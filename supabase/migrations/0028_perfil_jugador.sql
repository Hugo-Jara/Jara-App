-- Jara App · 0028 · Perfil del jugador (Fase 7, parte 2)
--
-- Cada jugador tiene su perfil: foto, apodo (0024), dorsal en cada plantel,
-- posición, pie hábil, fecha de nacimiento y, si quiere, estatura y peso.
--
-- Quién cambia qué:
--   - El jugador: todo lo de arriba, solo lo suyo.
--   - El tesorero y el encargado de su plantel, Hacienda y administradores:
--     dorsal, posición y pie (sirve para cargar a quienes todavía no entran a
--     la app). La foto, la fecha y el físico son solo del jugador.
--   - Nombre, celular y correo: nadie los cambia desde el perfil. Siguen
--     cambiándose desde Tesorería (0024): tesorero del plantel, Hacienda y
--     administradores.
--
-- Quién ve qué:
--   - Todo el club ve foto, apodo, dorsal, posición, pie y el día del cumpleaños
--     (día y mes, sin el año).
--   - Estatura y peso, solo si el jugador elige mostrarlos.
--   - La fecha completa, el celular y el correo los ve solo el propio jugador.
--
-- Fotos: bucket privado 'fotos-perfil', máx. 2 MB. Cada uno sube solo a su
-- carpeta (<persona_id>/...) y solo los socios del club las ven, con una
-- dirección que dura una hora. La app las achica a 600 px antes de subirlas.
--
-- Las tablas nuevas quedan cerradas al navegador (como en 0018): todo pasa por
-- las funciones de abajo.
--
-- Revisión: toca datos personales y permisos. La revisa el administrador de la app.

create table public.perfiles (
  persona_id     uuid primary key references public.personas(id) on delete cascade,
  foto_ruta      text,
  posicion       text check (posicion in ('arquero', 'defensa', 'lateral', 'volante', 'delantero')),
  pie            text check (pie in ('derecho', 'izquierdo', 'ambos')),
  nacimiento     date,
  estatura_cm    smallint check (estatura_cm between 120 and 230),
  peso_kg        smallint check (peso_kg between 35 and 200),
  muestra_fisico boolean not null default false,
  actualizado_en timestamptz not null default now()
);
alter table public.perfiles enable row level security;

-- Dorsal por plantel: el mismo jugador puede tener un número en cada uno.
create table public.dorsales (
  persona_id uuid not null references public.personas(id) on delete cascade,
  equipo_id  uuid not null references public.equipos(id) on delete cascade,
  numero     smallint not null check (numero between 1 and 99),
  primary key (persona_id, equipo_id)
);
alter table public.dorsales enable row level security;

-- ---------------------------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------------------------
-- ¿Puedo cargar dorsal, posición y pie de esta persona sin ser ella?
create or replace function public.perfil_puedo_cargar(p_persona uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select not public.soy_cuenta_de_prueba()
     and exists (select 1 from public.personas where id = p_persona and club_id = public.mi_club_id())
     and (public.soy_admin() or public.puedo_aprobar_compras()
          or exists (select 1 from public.persona_equipos pe
                      where pe.persona_id = p_persona and pe.rol = 'jugador'
                        and (public.tes_soy_tesorero_de(pe.equipo_id) or public.soy_encargado(pe.equipo_id))));
$$;

-- ---------------------------------------------------------------------------
-- Ver un perfil (sin p_persona, el mío)
-- ---------------------------------------------------------------------------
create or replace function public.perfil_ver(p_persona uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_id     uuid := coalesce(p_persona, public.mi_persona_id());
  v_propio boolean := v_id = public.mi_persona_id();
  p        public.personas;
  f        public.perfiles;
  c        public.persona_contactos;
begin
  if public.mi_persona_id() is null then raise exception 'Tu cuenta no está en la nómina del club'; end if;
  select * into p from public.personas where id = v_id and club_id = public.mi_club_id() and estado <> 'inactivo';
  if p.id is null then raise exception 'No encontramos a esa persona en el club'; end if;
  select * into f from public.perfiles where persona_id = v_id;
  if v_propio then select * into c from public.persona_contactos where persona_id = v_id; end if;

  return jsonb_build_object(
    'id', p.id, 'nombre', p.nombre, 'apodo', p.apodo, 'estado', p.estado,
    'propio', v_propio,
    'puedo_cargar', v_propio or public.perfil_puedo_cargar(v_id),
    'foto_ruta', f.foto_ruta, 'posicion', f.posicion, 'pie', f.pie,
    'cumple', to_char(f.nacimiento, 'MM-DD'),
    'nacimiento', case when v_propio then f.nacimiento end,
    'muestra_fisico', coalesce(f.muestra_fisico, false),
    'estatura_cm', case when v_propio or f.muestra_fisico then f.estatura_cm end,
    'peso_kg', case when v_propio or f.muestra_fisico then f.peso_kg end,
    'telefono', case when v_propio then c.telefono end,
    'correo', case when v_propio then c.email end,
    'planteles', coalesce((
      select jsonb_agg(jsonb_build_object('id', e.id, 'nombre', e.nombre, 'dorsal', d.numero) order by e.orden, e.nombre)
        from public.equipos e
        left join public.dorsales d on d.equipo_id = e.id and d.persona_id = v_id
       where exists (select 1 from public.persona_equipos pe
                      where pe.persona_id = v_id and pe.equipo_id = e.id and pe.rol = 'jugador')), '[]'::jsonb));
end;
$$;

-- ---------------------------------------------------------------------------
-- Guardar. Solo cambia lo que viene en p_datos:
--   apodo, posicion, pie, nacimiento (aaaa-mm-dd), estatura_cm, peso_kg,
--   muestra_fisico, dorsales {equipo_id: número o null}
-- ---------------------------------------------------------------------------
create or replace function public.perfil_guardar(p_persona uuid, p_datos jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_propio boolean := p_persona = public.mi_persona_id();
  v_nac    date;
  v_num    int;
  k        text;
begin
  if public.mi_persona_id() is null then raise exception 'Tu cuenta no está en la nómina del club'; end if;
  if not v_propio and not public.perfil_puedo_cargar(p_persona) then
    raise exception 'Solo el jugador, el tesorero o el encargado de su plantel pueden cambiar este perfil';
  end if;
  if not v_propio and (p_datos ? 'apodo' or p_datos ? 'nacimiento' or p_datos ? 'estatura_cm'
                       or p_datos ? 'peso_kg' or p_datos ? 'muestra_fisico') then
    raise exception 'El apodo, la fecha de nacimiento, la estatura y el peso los cambia solo el jugador';
  end if;
  if p_datos ? 'nombre' or p_datos ? 'telefono' or p_datos ? 'correo' then
    raise exception 'El nombre, el celular y el correo los cambia tu tesorero o Hacienda';
  end if;

  insert into public.perfiles (persona_id) values (p_persona) on conflict (persona_id) do nothing;

  if p_datos ? 'apodo' then
    if length(trim(coalesce(p_datos->>'apodo', ''))) > 20 then raise exception 'El apodo puede tener hasta 20 letras'; end if;
    update public.personas set apodo = nullif(trim(p_datos->>'apodo'), '') where id = p_persona;
  end if;
  if p_datos ? 'posicion' then
    if nullif(p_datos->>'posicion', '') not in ('arquero', 'defensa', 'lateral', 'volante', 'delantero') then
      raise exception 'Elige una posición de la lista';
    end if;
    update public.perfiles set posicion = nullif(p_datos->>'posicion', '') where persona_id = p_persona;
  end if;
  if p_datos ? 'pie' then
    if nullif(p_datos->>'pie', '') not in ('derecho', 'izquierdo', 'ambos') then raise exception 'Elige derecho, izquierdo o ambos'; end if;
    update public.perfiles set pie = nullif(p_datos->>'pie', '') where persona_id = p_persona;
  end if;
  if p_datos ? 'nacimiento' then
    v_nac := nullif(p_datos->>'nacimiento', '')::date;
    if v_nac is not null and (v_nac < date '1930-01-01' or v_nac > current_date - interval '10 years') then
      raise exception 'Revisa la fecha de nacimiento';
    end if;
    update public.perfiles set nacimiento = v_nac where persona_id = p_persona;
  end if;
  if p_datos ? 'estatura_cm' then
    if nullif(p_datos->>'estatura_cm', '')::int not between 120 and 230 then raise exception 'La estatura va en centímetros, entre 120 y 230'; end if;
    update public.perfiles set estatura_cm = nullif(p_datos->>'estatura_cm', '')::int where persona_id = p_persona;
  end if;
  if p_datos ? 'peso_kg' then
    if nullif(p_datos->>'peso_kg', '')::int not between 35 and 200 then raise exception 'El peso va en kilos, entre 35 y 200'; end if;
    update public.perfiles set peso_kg = nullif(p_datos->>'peso_kg', '')::int where persona_id = p_persona;
  end if;
  if p_datos ? 'muestra_fisico' then
    update public.perfiles set muestra_fisico = coalesce((p_datos->>'muestra_fisico')::boolean, false) where persona_id = p_persona;
  end if;

  if p_datos ? 'dorsales' then
    for k in select jsonb_object_keys(p_datos->'dorsales') loop
      if not exists (select 1 from public.persona_equipos
                      where persona_id = p_persona and equipo_id = k::uuid and rol = 'jugador') then
        raise exception 'El dorsal va solo en los planteles donde juega';
      end if;
      if not v_propio and not (public.soy_admin() or public.puedo_aprobar_compras()
                               or public.tes_soy_tesorero_de(k::uuid) or public.soy_encargado(k::uuid)) then
        raise exception 'Solo puedes poner el dorsal de tu plantel';
      end if;
      v_num := nullif(p_datos->'dorsales'->>k, '')::int;
      if v_num is null then
        delete from public.dorsales where persona_id = p_persona and equipo_id = k::uuid;
      elsif v_num not between 1 and 99 then
        raise exception 'El dorsal va del 1 al 99';
      else
        insert into public.dorsales (persona_id, equipo_id, numero) values (p_persona, k::uuid, v_num)
          on conflict (persona_id, equipo_id) do update set numero = excluded.numero;
      end if;
    end loop;
  end if;

  update public.perfiles set actualizado_en = now() where persona_id = p_persona;
end;
$$;

-- ---------------------------------------------------------------------------
-- Foto: cada uno la suya. Devuelve la ruta anterior para que la app la borre.
-- ---------------------------------------------------------------------------
create or replace function public.perfil_foto_guardar(p_ruta text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_yo    uuid := public.mi_persona_id();
  v_antes text;
begin
  if v_yo is null then raise exception 'Tu cuenta no está en la nómina del club'; end if;
  if p_ruta is not null and p_ruta not like v_yo::text || '/%' then
    raise exception 'Esa foto no es tuya';
  end if;
  insert into public.perfiles (persona_id) values (v_yo) on conflict (persona_id) do nothing;
  select foto_ruta into v_antes from public.perfiles where persona_id = v_yo;
  update public.perfiles set foto_ruta = p_ruta, actualizado_en = now() where persona_id = v_yo;
  return v_antes;
end;
$$;

-- ---------------------------------------------------------------------------
-- Los planteles con sus jugadores, para la pantalla Planteles.
-- ---------------------------------------------------------------------------
create or replace function public.planteles_fichas()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if public.mi_persona_id() is null then raise exception 'Tu cuenta no está en la nómina del club'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', e.id, 'nombre', e.nombre, 'jugadores', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'id', p.id, 'nombre', p.nombre, 'apodo', p.apodo, 'foto_ruta', f.foto_ruta,
                      'posicion', f.posicion, 'dorsal', d.numero)
                    order by d.numero nulls last, p.nombre)
               from public.persona_equipos pe
               join public.personas p on p.id = pe.persona_id and p.estado = 'activo'
               left join public.perfiles f on f.persona_id = p.id
               left join public.dorsales d on d.persona_id = p.id and d.equipo_id = e.id
              where pe.equipo_id = e.id and pe.rol = 'jugador'), '[]'::jsonb))
           order by e.orden, e.nombre)
      from public.equipos e where e.club_id = public.mi_club_id()), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- Bucket de fotos
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos-perfil', 'fotos-perfil', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- ¿Esta carpeta es de alguien de mi club?
create or replace function public.foto_perfil_de_mi_club(p_carpeta text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.mi_persona_id() is not null
     and exists (select 1 from public.personas where id::text = p_carpeta and club_id = public.mi_club_id());
$$;

create policy "subir mi foto de perfil" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'fotos-perfil'
              and (storage.foldername(name))[1] = public.mi_persona_id()::text);

create policy "borrar mi foto de perfil" on storage.objects
  for delete to authenticated
  using (bucket_id = 'fotos-perfil'
         and (storage.foldername(name))[1] = public.mi_persona_id()::text);

create policy "socios ven fotos de perfil" on storage.objects
  for select to authenticated
  using (bucket_id = 'fotos-perfil'
         and public.foto_perfil_de_mi_club((storage.foldername(name))[1]));

-- ---------------------------------------------------------------------------
-- Permisos de las funciones
-- ---------------------------------------------------------------------------
revoke execute on function public.perfil_puedo_cargar(uuid) from public, anon, authenticated;
revoke execute on function public.perfil_ver(uuid) from public, anon;
revoke execute on function public.perfil_guardar(uuid, jsonb) from public, anon;
revoke execute on function public.perfil_foto_guardar(text) from public, anon;
revoke execute on function public.planteles_fichas() from public, anon;
revoke execute on function public.foto_perfil_de_mi_club(text) from public, anon;
grant execute on function public.perfil_ver(uuid) to authenticated;
grant execute on function public.perfil_guardar(uuid, jsonb) to authenticated;
grant execute on function public.perfil_foto_guardar(text) to authenticated;
grant execute on function public.planteles_fichas() to authenticated;
grant execute on function public.foto_perfil_de_mi_club(text) to authenticated;
