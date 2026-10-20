-- Jara App · 0018 · Seguridad antes de sumar gente
--
-- El repo es público y la dirección y la clave publishable de Supabase están
-- a la vista: todo depende de los permisos de la base. Esta migración cierra
-- cuatro huecos antes de que entren los tesoreros y el resto del club.
--
--   M1 · Un encargado gestiona solo lo de su plantel.
--        - Las listas de entrenamiento las administran los administradores y
--          quien tiene el permiso 'administra_entrenamientos'. Los encargados
--          de plantel dejan de abrirlas, editarlas, eliminarlas y bajar gente.
--          ANTES DE CORRERLA: dale ese permiso a quien lleva Entrenamiento
--          (Table Editor > personas > administra_entrenamientos).
--        - Si alguien que no está en la lista pide entrar a varios planteles,
--          el encargado que aprueba lo deja solo en los planteles que maneja.
--          Un administrador (o un encargado de todos ellos) lo deja en todos.
--        - Los partidos ya estaban amarrados a su plantel; no cambian.
--   M2 · Las tablas de 0001 y 0002 ya no se leen ni escriben directamente.
--        La app pasa siempre por funciones, así que no cambia nada para nadie.
--        Se quitan también las dos reglas de Storage del bucket 'compras' (0003),
--        que nadie usa y que consultaban una de esas tablas.
--   M3 · La nómina no se puede sacar completa buscando nombres:
--        - cada palabra tiene que calzar con el comienzo de una palabra del
--          nombre, y una de ellas tener al menos tres letras;
--        - si calzan más de 5 personas no se muestra ninguna y se pide
--          escribir también el apellido;
--        - máximo 30 búsquedas por hora por cuenta.
--   M5 · Tocar dos veces "Sumar invitado" no anota dos veces al mismo invitado.
--
-- Las funciones mantienen sus nombres y parámetros, así que la app actual
-- sigue funcionando mientras se sube la nueva.

-- ---------------------------------------------------------------------------
-- M1 · Entrenamientos: solo administradores y quien tiene el permiso
-- ---------------------------------------------------------------------------
create or replace function public.puedo_administrar_entrenamientos()
returns boolean language sql stable security definer set search_path = public as $$
  select public.soy_admin()
      or exists (select 1 from public.personas p
                  where p.id = public.mi_persona_id() and p.administra_entrenamientos);
$$;

-- ---------------------------------------------------------------------------
-- M1 · Ingreso: quien aprueba suma a la persona solo a sus planteles
-- ---------------------------------------------------------------------------
-- Igual que en 0009, salvo los planteles de quien no estaba en la lista.
create or replace function public.ingreso_resolver(p_solicitud uuid, p_aprobar boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  s public.ingreso_solicitudes;
  v_persona uuid;
begin
  select * into s from public.ingreso_solicitudes where id = p_solicitud for update;
  if s.id is null or not public.ingreso_puedo_resolver(s) then
    raise exception 'No puedes resolver esa solicitud';
  end if;
  if s.estado <> 'pendiente' then raise exception 'Esa solicitud ya fue resuelta'; end if;

  if p_aprobar then
    if exists (select 1 from public.personas where user_id = s.user_id) then
      raise exception 'Esa cuenta ya está enlazada a otra persona';
    end if;
    if s.persona_id is not null then
      update public.personas set user_id = s.user_id
       where id = s.persona_id and user_id is null
      returning id into v_persona;
      if v_persona is null then raise exception 'Ese nombre ya tiene una cuenta'; end if;
    else
      insert into public.personas (club_id, nombre, user_id) values (s.club_id, s.nombre_propuesto, s.user_id)
      returning id into v_persona;
      -- Solo los planteles que maneja quien aprueba (un administrador, todos).
      insert into public.persona_equipos (persona_id, equipo_id, rol)
      select v_persona, e, 'jugador' from unnest(s.equipos_propuestos) as e
       where public.soy_encargado(e);
    end if;

    -- Guarda el correo con que entró, salvo que ya lo use otra persona.
    if s.email is not null and not exists (
         select 1 from public.persona_contactos where email = s.email and persona_id <> v_persona) then
      perform set_config('jara.enlazando_ingreso', '1', true);
      insert into public.persona_contactos (persona_id, email) values (v_persona, s.email)
      on conflict (persona_id) do update set email = excluded.email;
      perform set_config('jara.enlazando_ingreso', '', true);
    end if;

    -- Si otra cuenta pedía el mismo nombre, queda rechazada.
    update public.ingreso_solicitudes
       set estado = 'rechazada', resuelta_por = public.mi_persona_id(), resuelta_en = now()
     where persona_id = s.persona_id and estado = 'pendiente' and id <> s.id;
  end if;

  update public.ingreso_solicitudes
     set estado = case when p_aprobar then 'aprobada' else 'rechazada' end,
         persona_id = coalesce(persona_id, v_persona),
         resuelta_por = public.mi_persona_id(), resuelta_en = now()
   where id = s.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- M2 · Las tablas de 0001 y 0002 solo se tocan a través de funciones
-- ---------------------------------------------------------------------------
revoke all on
  public.clubes, public.personas, public.persona_contactos, public.equipos,
  public.persona_equipos, public.areas, public.persona_areas,
  public.solicitudes_compra, public.solicitud_adjuntos, public.solicitud_eventos
  from anon, authenticated;
revoke all on sequence public.solicitud_compra_codigo_seq from anon, authenticated;

-- Las reglas del bucket 'compras' leían solicitudes_compra directamente; con
-- la tabla cerrada, cualquier consulta a Storage con sesión fallaría (también
-- la de los comprobantes). Ese bucket no lo usa la app.
do $$
begin
  if to_regclass('storage.objects') is not null then
    drop policy if exists "ver archivos de solicitudes visibles" on storage.objects;
    drop policy if exists "subir archivos a solicitudes visibles" on storage.objects;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- M3 · Buscar en la nómina sin poder llevársela completa
-- ---------------------------------------------------------------------------
-- Una fila por búsqueda, para el tope por hora. Nadie la lee desde la app.
create table public.nomina_busquedas (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  creado_en  timestamptz not null default now()
);
create index nomina_busquedas_user_idx on public.nomina_busquedas (user_id, creado_en);
alter table public.nomina_busquedas enable row level security;
revoke all on public.nomina_busquedas from anon, authenticated;

-- Busca a quienes todavía no tienen cuenta. Devuelve la lista de personas
-- (máximo 5), o {"demasiados": true} si calzan más de 5.
create or replace function public.nomina_buscar(p_texto text, p_club text default 'hugo-jara')
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_texto    text := trim(regexp_replace(public.sin_tildes(p_texto), '\s+', ' ', 'g'));
  v_palabras text[];
begin
  if auth.uid() is null then raise exception 'Hay que entrar con una cuenta'; end if;
  -- Los comodines no sirven para buscar: se tratan como letras.
  v_palabras := string_to_array(
    replace(replace(replace(v_texto, '\', '\\'), '%', '\%'), '_', '\_'), ' ');
  if not exists (select 1 from unnest(v_palabras) w where length(w) >= 3) then
    return '[]'::jsonb;
  end if;

  if (select count(*) from public.nomina_busquedas
       where user_id = auth.uid() and creado_en > now() - interval '1 hour') >= 30 then
    raise exception 'Hiciste muchas búsquedas seguidas. Espera un rato y vuelve a intentarlo.';
  end if;
  delete from public.nomina_busquedas where user_id = auth.uid() and creado_en < now() - interval '1 day';
  insert into public.nomina_busquedas (user_id) values (auth.uid());

  -- Se piden 6 para saber si calzan más de 5.
  return (
    with hallados as (
      select p.id, p.nombre
        from public.personas p join public.clubes c on c.id = p.club_id
       where c.slug = p_club and p.user_id is null and p.estado <> 'inactivo'
         -- Cada palabra calza con el comienzo de alguna palabra del nombre.
         and (select bool_and(' ' || regexp_replace(public.sin_tildes(p.nombre), '[\s-]+', ' ', 'g')
                              like '% ' || w || '%')
                from unnest(v_palabras) w)
       order by p.nombre
       limit 6)
    select case when count(*) > 5 then jsonb_build_object('demasiados', true)
                else coalesce(jsonb_agg(jsonb_build_object('id', h.id, 'nombre', h.nombre, 'equipos',
                       coalesce((select jsonb_agg(e.nombre order by e.orden, e.nombre)
                                   from public.equipos e
                                  where exists (select 1 from public.persona_equipos pe
                                                 where pe.persona_id = h.id and pe.equipo_id = e.id)), '[]'::jsonb))
                     order by h.nombre), '[]'::jsonb) end
      from hallados h);
end;
$$;

-- ---------------------------------------------------------------------------
-- M5 · Un invitado no se anota dos veces por tocar dos veces
-- ---------------------------------------------------------------------------
-- Igual que en 0011, pero si quien anota ya tiene en la lista a un invitado con
-- ese nombre (sin contar tildes, mayúsculas ni espacios), no hace nada. La
-- lista queda bloqueada mientras tanto, así que dos toques seguidos se
-- atienden uno después del otro.
create or replace function public.entrenamiento_invitar(p_id uuid, p_nombre text)
returns void language plpgsql security definer set search_path = public as $$
declare
  e public.entrenamientos := public.entrenamiento_abierto(p_id);
  v_nombre text := trim(regexp_replace(coalesce(p_nombre, ''), '\s+', ' ', 'g'));
begin
  if length(v_nombre) < 2 then raise exception 'Escribe el nombre del invitado'; end if;
  if exists (select 1 from public.entrenamiento_inscritos
              where entrenamiento_id = e.id and persona_id is null and estado = 'inscrito'
                and invitado_por = public.mi_persona_id()
                and public.sin_tildes(trim(regexp_replace(invitado_nombre, '\s+', ' ', 'g'))) = public.sin_tildes(v_nombre)) then
    return;
  end if;
  if public.entrenamiento_cupos_libres(e) <= 0 then raise exception 'La lista está completa'; end if;
  insert into public.entrenamiento_inscritos (entrenamiento_id, invitado_nombre, invitado_por, monto)
  values (e.id, v_nombre, public.mi_persona_id(), e.precio_invitado);
end;
$$;

revoke execute on function public.nomina_buscar(text, text) from public, anon;
grant execute on function public.nomina_buscar(text, text) to authenticated;
