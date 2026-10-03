-- Jara App · 0009 · Ingreso: cada jugador elige su nombre y un encargado lo aprueba
--
-- La nómina se trae de tesorería con nombre y plantel, pero sin correos. En vez
-- de juntar los correos a mano, cada persona entra con su cuenta, busca su
-- nombre y pide ser reconocida. Un encargado de su plantel o un administrador
-- aprueba, y recién ahí la cuenta queda enlazada a la persona de la nómina.
--
-- Una persona puede estar en más de un plantel: es una sola fila en `personas`
-- con varias filas en `persona_equipos`.
--
-- Todo pasa por funciones. Quien todavía no está aprobado no lee ninguna tabla.

-- Cómo figura la persona en la planilla del tesorero de ese plantel. Sirve
-- para cruzar los pagos de cuota cuando se traiga tesorería.
alter table public.persona_equipos add column nombre_tesoreria text;

-- Fotografía de la planilla de tesorería al momento de traer la nómina: una
-- fila por jugador y plantel, tal como la escribe cada tesorero. La app no la
-- usa; queda como respaldo del cruce y para traer después los pagos de cuota.
create table public.importacion_nomina (
  id       bigint generated always as identity primary key,
  plantel  text not null,
  nombre   text not null,
  status   text,
  unique (plantel, nombre)
);
alter table public.importacion_nomina enable row level security;
revoke all on public.importacion_nomina from anon, authenticated;

-- Junior o senior: define el precio del entrenamiento.
alter table public.equipos add column categoria text not null default 'senior'
  check (categoria in ('junior', 'senior'));

-- Para comparar nombres sin importar tildes ni mayúsculas.
create or replace function public.sin_tildes(t text)
returns text language sql immutable set search_path = public as $$
  select lower(translate(coalesce(t, ''), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN'));
$$;

create table public.ingreso_solicitudes (
  id                  uuid primary key default gen_random_uuid(),
  club_id             uuid not null references public.clubes(id) on delete cascade,
  user_id             uuid not null references auth.users(id) on delete cascade,
  email               text,
  -- La persona de la nómina que dice ser. Vacío si no se encontró en la lista.
  persona_id          uuid references public.personas(id) on delete cascade,
  -- Solo cuando no está en la nómina: cómo se llama y en qué planteles juega.
  nombre_propuesto    text,
  equipos_propuestos  uuid[] not null default '{}',
  estado              text not null default 'pendiente'
                      check (estado in ('pendiente', 'aprobada', 'rechazada')),
  resuelta_por        uuid references public.personas(id) on delete set null,
  resuelta_en         timestamptz,
  creado_en           timestamptz not null default now(),
  constraint con_persona_o_nombre check (
    persona_id is not null or coalesce(length(trim(nombre_propuesto)), 0) >= 3)
);
-- Una sola solicitud en espera por cuenta.
create unique index ingreso_una_pendiente_idx on public.ingreso_solicitudes (user_id) where estado = 'pendiente';
create index ingreso_club_estado_idx on public.ingreso_solicitudes (club_id, estado);

alter table public.ingreso_solicitudes enable row level security;
revoke all on public.ingreso_solicitudes from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Quién soy
-- ---------------------------------------------------------------------------

-- ¿Soy encargado de este plantel? Los administradores lo son de todos.
create or replace function public.soy_encargado(p_equipo uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.soy_admin() or exists (
    select 1 from public.persona_equipos pe
     where pe.persona_id = public.mi_persona_id() and pe.equipo_id = p_equipo and pe.rol = 'encargado');
$$;

-- ¿Soy encargado de algún plantel?
create or replace function public.soy_encargado_de_alguno()
returns boolean language sql stable security definer set search_path = public as $$
  select public.soy_admin() or exists (
    select 1 from public.persona_equipos pe
     where pe.persona_id = public.mi_persona_id() and pe.rol = 'encargado');
$$;

-- Mis datos para armar la app: quién soy, mis planteles y qué puedo hacer.
-- Devuelve null si la cuenta no está enlazada a nadie de la nómina.
create or replace function public.mi_persona()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  p public.personas;
begin
  select * into p from public.personas where user_id = auth.uid() and estado <> 'inactivo';
  if p.id is null then
    return null;
  end if;
  return jsonb_build_object(
    'id', p.id, 'nombre', p.nombre, 'es_admin', p.es_admin, 'estado', p.estado,
    'club', (select jsonb_build_object('nombre', c.nombre, 'etiqueta_area', c.etiqueta_area)
               from public.clubes c where c.id = p.club_id),
    'equipos', coalesce((
      select jsonb_agg(x order by (x->>'orden')::int, x->>'nombre') from (
        select jsonb_build_object(
                 'id', e.id, 'nombre', e.nombre, 'orden', e.orden,
                 'encargado', bool_or(pe.rol = 'encargado'),
                 'tesorero', bool_or(pe.rol = 'tesorero')) as x
          from public.persona_equipos pe join public.equipos e on e.id = pe.equipo_id
         where pe.persona_id = p.id
         group by e.id) s), '[]'::jsonb),
    'aprueba_compras', public.puedo_aprobar_compras(),
    'es_encargado', public.soy_encargado_de_alguno());
end;
$$;

-- ---------------------------------------------------------------------------
-- Pedir el ingreso
-- ---------------------------------------------------------------------------

-- Busca en la nómina a quienes todavía no tienen cuenta. Pide al menos tres
-- letras para que nadie se lleve la lista completa de una vez.
create or replace function public.nomina_buscar(p_texto text, p_club text default 'hugo-jara')
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_texto text := trim(regexp_replace(public.sin_tildes(p_texto), '\s+', ' ', 'g'));
begin
  if auth.uid() is null then raise exception 'Hay que entrar con una cuenta'; end if;
  if length(v_texto) < 3 then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', s.id, 'nombre', s.nombre, 'equipos', s.equipos) order by s.nombre)
      from (
        select p.id, p.nombre,
               coalesce((select jsonb_agg(e.nombre order by e.orden, e.nombre)
                           from public.equipos e
                          where exists (select 1 from public.persona_equipos pe
                                         where pe.persona_id = p.id and pe.equipo_id = e.id)), '[]'::jsonb) as equipos
          from public.personas p join public.clubes c on c.id = p.club_id
         where c.slug = p_club and p.user_id is null and p.estado <> 'inactivo'
           and (select bool_and(public.sin_tildes(p.nombre) like '%' || palabra || '%')
                  from unnest(string_to_array(v_texto, ' ')) as palabra)
         order by p.nombre
         limit 8) s), '[]'::jsonb);
end;
$$;

-- Los planteles del club, para quien no se encontró en la lista.
create or replace function public.equipos_del_club(p_club text default 'hugo-jara')
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'nombre', e.nombre) order by e.orden, e.nombre), '[]'::jsonb)
    from public.equipos e join public.clubes c on c.id = e.club_id
   where c.slug = p_club and auth.uid() is not null;
$$;

-- Pide el ingreso: con una persona de la nómina, o con nombre y planteles si
-- no está en la lista. Reemplaza la solicitud anterior si había una en espera.
create or replace function public.ingreso_solicitar(
  p_persona uuid default null, p_nombre text default null,
  p_equipos uuid[] default '{}', p_club text default 'hugo-jara')
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_club uuid;
  v_id uuid;
  v_equipos uuid[];
begin
  if auth.uid() is null then raise exception 'Hay que entrar con una cuenta'; end if;
  if exists (select 1 from public.personas where user_id = auth.uid()) then
    raise exception 'Tu cuenta ya está en la nómina';
  end if;
  select id into v_club from public.clubes where slug = p_club;
  if v_club is null then raise exception 'Ese club no existe'; end if;

  if p_persona is not null then
    if not exists (select 1 from public.personas
                    where id = p_persona and club_id = v_club and user_id is null and estado <> 'inactivo') then
      raise exception 'Ese nombre ya tiene una cuenta. Si eres tú, avísale a un administrador.';
    end if;
    v_equipos := '{}';
  else
    if coalesce(length(trim(p_nombre)), 0) < 3 then raise exception 'Escribe tu nombre y apellido'; end if;
    select coalesce(array_agg(e.id), '{}') into v_equipos
      from public.equipos e where e.club_id = v_club and e.id = any(coalesce(p_equipos, '{}'));
  end if;

  delete from public.ingreso_solicitudes where user_id = auth.uid() and estado = 'pendiente';
  insert into public.ingreso_solicitudes (club_id, user_id, email, persona_id, nombre_propuesto, equipos_propuestos)
  values (v_club, auth.uid(), lower(auth.jwt() ->> 'email'), p_persona,
          case when p_persona is null then trim(p_nombre) end, v_equipos)
  returning id into v_id;
  return v_id;
end;
$$;

-- Los planteles que le importan a una solicitud: los de la persona elegida o
-- los que propuso.
create or replace function public.ingreso_equipos(s public.ingreso_solicitudes)
returns uuid[] language sql stable security definer set search_path = public as $$
  select case when s.persona_id is not null
              then coalesce((select array_agg(distinct pe.equipo_id) from public.persona_equipos pe
                              where pe.persona_id = s.persona_id), '{}')
              else s.equipos_propuestos end;
$$;

-- En qué está mi solicitud, y a quién pedirle que la apruebe.
create or replace function public.ingreso_mi_estado()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  s public.ingreso_solicitudes;
  v_equipos uuid[];
begin
  if auth.uid() is null then raise exception 'Hay que entrar con una cuenta'; end if;
  select * into s from public.ingreso_solicitudes
   where user_id = auth.uid() order by creado_en desc limit 1;
  if s.id is null or s.estado = 'aprobada' then
    return jsonb_build_object('estado', 'sin_solicitud');
  end if;
  v_equipos := public.ingreso_equipos(s);
  return jsonb_build_object(
    'estado', s.estado,
    'nombre', coalesce((select nombre from public.personas where id = s.persona_id), s.nombre_propuesto),
    'equipos', coalesce((select jsonb_agg(e.nombre order by e.orden) from public.equipos e
                          where e.id = any(v_equipos)), '[]'::jsonb),
    -- A quién avisarle: encargados de esos planteles y administradores.
    'aprueban', coalesce((
      select jsonb_agg(distinct p.nombre)
        from public.personas p
       where p.club_id = s.club_id and p.user_id is not null and p.estado <> 'inactivo'
         and (p.es_admin or exists (
               select 1 from public.persona_equipos pe
                where pe.persona_id = p.id and pe.rol = 'encargado' and pe.equipo_id = any(v_equipos)))),
      '[]'::jsonb));
end;
$$;

create or replace function public.ingreso_cancelar()
returns void language sql security definer set search_path = public as $$
  delete from public.ingreso_solicitudes where user_id = auth.uid() and estado in ('pendiente', 'rechazada');
$$;

-- ---------------------------------------------------------------------------
-- Aprobar el ingreso
-- ---------------------------------------------------------------------------

-- ¿Puedo resolver esta solicitud? Administradores, y encargados de alguno de
-- los planteles de la persona.
create or replace function public.ingreso_puedo_resolver(s public.ingreso_solicitudes)
returns boolean language sql stable security definer set search_path = public as $$
  select s.club_id = public.mi_club_id() and (
    public.soy_admin() or exists (
      select 1 from public.persona_equipos pe
       where pe.persona_id = public.mi_persona_id() and pe.rol = 'encargado'
         and pe.equipo_id = any(public.ingreso_equipos(s))));
$$;

-- Las solicitudes en espera que me toca resolver.
create or replace function public.ingreso_pendientes()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', s.id, 'email', s.email, 'creado_en', s.creado_en,
           'en_nomina', s.persona_id is not null,
           'nombre', coalesce((select nombre from public.personas where id = s.persona_id), s.nombre_propuesto),
           'equipos', coalesce((select jsonb_agg(e.nombre order by e.orden) from public.equipos e
                                 where e.id = any(public.ingreso_equipos(s))), '[]'::jsonb))
           order by s.creado_en), '[]'::jsonb)
    from public.ingreso_solicitudes s
   where s.estado = 'pendiente' and public.ingreso_puedo_resolver(s);
$$;

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
      insert into public.persona_equipos (persona_id, equipo_id, rol)
      select v_persona, e, 'jugador' from unnest(s.equipos_propuestos) as e;
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

-- El correo de la nómina lo cambia un administrador, o la aprobación de un
-- ingreso (que lo toma de la cuenta con que la persona entró).
create or replace function public.proteger_email_contacto()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.email is distinct from old.email
     and not public.soy_admin()
     and coalesce(current_setting('jara.enlazando_ingreso', true), '') <> '1' then
    raise exception 'Solo un administrador puede cambiar el correo de la nómina';
  end if;
  return new;
end;
$$;

revoke execute on function public.sin_tildes(text) from public, anon;
revoke execute on function public.soy_encargado(uuid) from public, anon;
revoke execute on function public.soy_encargado_de_alguno() from public, anon;
revoke execute on function public.mi_persona() from public, anon;
revoke execute on function public.nomina_buscar(text, text) from public, anon;
revoke execute on function public.equipos_del_club(text) from public, anon;
revoke execute on function public.ingreso_solicitar(uuid, text, uuid[], text) from public, anon;
revoke execute on function public.ingreso_equipos(public.ingreso_solicitudes) from public, anon, authenticated;
revoke execute on function public.ingreso_puedo_resolver(public.ingreso_solicitudes) from public, anon, authenticated;
revoke execute on function public.ingreso_mi_estado() from public, anon;
revoke execute on function public.ingreso_cancelar() from public, anon;
revoke execute on function public.ingreso_pendientes() from public, anon;
revoke execute on function public.ingreso_resolver(uuid, boolean) from public, anon;
revoke execute on function public.proteger_email_contacto() from public, anon, authenticated;
grant execute on function public.sin_tildes(text) to authenticated;
grant execute on function public.soy_encargado(uuid) to authenticated;
grant execute on function public.soy_encargado_de_alguno() to authenticated;
grant execute on function public.mi_persona() to authenticated;
grant execute on function public.nomina_buscar(text, text) to authenticated;
grant execute on function public.equipos_del_club(text) to authenticated;
grant execute on function public.ingreso_solicitar(uuid, text, uuid[], text) to authenticated;
grant execute on function public.ingreso_mi_estado() to authenticated;
grant execute on function public.ingreso_cancelar() to authenticated;
grant execute on function public.ingreso_pendientes() to authenticated;
grant execute on function public.ingreso_resolver(uuid, boolean) to authenticated;
