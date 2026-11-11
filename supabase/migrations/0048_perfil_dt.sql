-- Jara App · 0048 · Perfil del DT y partidos dirigidos
--
-- Pedido del administrador (10/11): los DT también tienen perfil, pero no
-- tenían una posición que elegir ni números que mostrar.
--
--   · Posición: se suman 'dt' (DT) y 'ayudante' (ayudante técnico). Es solo
--     cómo se muestra: no da permisos. El permiso de votar MVP sigue siendo
--     personas.cuerpo_tecnico (0033), que se da por SQL.
--   · ¿Quién dirigió?: al anotar el resultado, quien anota marca al cuerpo
--     técnico que estuvo (tabla partido_tecnicos, como ¿Quién atajó? en 0046).
--     La app lo trae marcado con el cuerpo técnico del plantel.
--   · En los partidos sin nadie marcado (los anotados antes de esto, o si
--     nadie lo marcó) cuentan como dirigidos para el cuerpo técnico del
--     plantel: quien tiene cuerpo_tecnico o DT/Ayudante en su perfil y está en
--     el plantel.
--   · dt_cifras: récord G/E/P, goles a favor y en contra, vallas invictas,
--     sus planteles, últimos resultados, goleador y jugador del partido más
--     repetido en sus partidos.
--   · perfil_ver: agrega 'cuerpo_tecnico' y 'dirige' (planteles donde está
--     como cuerpo técnico, aunque no sea jugador ahí).
--
-- No toca plata. Anota quien ya puede anotar el resultado. Revisión: cambia
-- perfil_guardar y perfil_ver (datos personales); la revisa el administrador.

-- ---------------------------------------------------------------------------
-- Posiciones nuevas
-- ---------------------------------------------------------------------------
alter table public.perfiles drop constraint if exists perfiles_posicion_check;
alter table public.perfiles add constraint perfiles_posicion_check
  check (posicion in ('arquero', 'defensa', 'lateral', 'volante', 'delantero', 'dt', 'ayudante'));

-- ---------------------------------------------------------------------------
-- Quién dirigió cada partido
-- ---------------------------------------------------------------------------
create table public.partido_tecnicos (
  partido_id uuid not null references public.partidos(id) on delete cascade,
  persona_id uuid not null references public.personas(id) on delete cascade,
  primary key (partido_id, persona_id)
);
create index partido_tecnicos_persona_idx on public.partido_tecnicos (persona_id);
alter table public.partido_tecnicos enable row level security;
revoke all on public.partido_tecnicos from anon, authenticated;

-- ¿Es cuerpo técnico de este plantel? (permiso de la 0033 o DT/Ayudante en su perfil)
create or replace function public.es_tecnico_de(p_persona uuid, p_equipo uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.persona_equipos pe
      join public.personas pr on pr.id = pe.persona_id and pr.estado <> 'inactivo'
      left join public.perfiles f on f.persona_id = pe.persona_id
     where pe.persona_id = p_persona and pe.equipo_id = p_equipo
       and (pr.cuerpo_tecnico or f.posicion in ('dt', 'ayudante')));
$$;

-- Quién dirigió un partido y el cuerpo técnico de su plantel (para sugerirlo).
--   { "tecnicos": ["persona_id", ...], "sugeridos": [{"id": "...", "nombre": "..."}] }
create or replace function public.partido_banca(p_partido uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  p public.partidos;
begin
  if public.mi_persona_id() is null then raise exception 'Tu cuenta no está en la nómina del club'; end if;
  select * into p from public.partidos where id = p_partido and club_id = public.mi_club_id();
  if p.id is null then raise exception 'Ese partido no existe'; end if;
  return jsonb_build_object(
    'tecnicos', coalesce((
      select jsonb_agg(t.persona_id order by t.persona_id) from public.partido_tecnicos t where t.partido_id = p.id), '[]'::jsonb),
    'sugeridos', coalesce((
      select jsonb_agg(jsonb_build_object('id', pr.id, 'nombre', pr.nombre) order by pr.nombre)
        from public.personas pr
       where pr.club_id = p.club_id and public.es_tecnico_de(pr.id, p.equipo_id)), '[]'::jsonb));
end;
$$;

-- Anotar quién dirigió. Se llama después de partido_resultado.
--   p_tecnicos: ["persona_id", ...]; vacío = nadie marcado.
create or replace function public.partido_banca_guardar(p_partido uuid, p_tecnicos jsonb default '[]')
returns void language plpgsql security definer set search_path = public as $$
declare
  p public.partidos;
  v_persona uuid;
begin
  select * into p from public.partidos where id = p_partido and club_id = public.mi_club_id();
  if p.id is null then raise exception 'Ese partido no existe'; end if;
  if not public.puedo_anotar(p.equipo_id) then
    raise exception 'Solo quien anota los partidos puede poner quién dirigió';
  end if;
  if p_tecnicos is not null and jsonb_typeof(p_tecnicos) <> 'array' then raise exception 'La lista del cuerpo técnico no es válida'; end if;
  if coalesce(jsonb_array_length(p_tecnicos), 0) > 4 then raise exception 'Marca como máximo cuatro personas del cuerpo técnico'; end if;

  delete from public.partido_tecnicos where partido_id = p.id;
  for v_persona in select distinct (x #>> '{}')::uuid from jsonb_array_elements(coalesce(p_tecnicos, '[]')) x loop
    if not exists (select 1 from public.personas where id = v_persona and club_id = p.club_id) then
      raise exception 'Esa persona no está en la nómina del club';
    end if;
    insert into public.partido_tecnicos (partido_id, persona_id) values (p.id, v_persona);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Las cifras de un DT o ayudante
-- ---------------------------------------------------------------------------
-- Cuentan los partidos con resultado donde lo marcaron y, en los que no tienen
-- a nadie marcado, los de los planteles donde es cuerpo técnico.
create or replace function public.dt_cifras(p_persona uuid, p_anio int default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if public.mi_persona_id() is null then raise exception 'Tu cuenta no está en la nómina del club'; end if;
  return (
    with ps as (
      select p.* from public.partidos p
       where p.club_id = public.mi_club_id()
         and p.goles_favor is not null and p.goles_contra is not null
         and (p_anio is null or extract(year from p.fecha) = p_anio)
    ), mios as (
      select ps.* from ps
       where exists (select 1 from public.partido_tecnicos t where t.partido_id = ps.id and t.persona_id = p_persona)
          or (not exists (select 1 from public.partido_tecnicos t where t.partido_id = ps.id)
              and public.es_tecnico_de(p_persona, ps.equipo_id))
    ), goles as (
      select g.persona_id, sum(g.goles)::int as goles from public.partido_estadisticas g
        join mios m on m.id = g.partido_id group by g.persona_id having sum(g.goles) > 0
    ), mvps as (
      select (w->>'persona_id')::uuid as persona_id, count(*)::int as veces
        from mios m join public.partidos pp on pp.id = m.id
             cross join lateral jsonb_array_elements(public.mvp_ganadores(m.id)) w
       where now() > public.mvp_cierre(pp)
       group by 1
    )
    select jsonb_build_object(
      'pj', (select count(*) from mios)::int,
      'g', (select count(*) from mios where goles_favor > goles_contra)::int,
      'e', (select count(*) from mios where goles_favor = goles_contra)::int,
      'p', (select count(*) from mios where goles_favor < goles_contra)::int,
      'gf', (select coalesce(sum(goles_favor), 0) from mios)::int,
      'gc', (select coalesce(sum(goles_contra), 0) from mios)::int,
      'invictas', (select count(*) from mios where goles_contra = 0)::int,
      'por_plantel', coalesce((
        select jsonb_agg(jsonb_build_object('id', e.id, 'nombre', e.nombre, 'pj', x.pj, 'g', x.g, 'e', x.e, 'p', x.p) order by e.orden, e.nombre)
          from (select equipo_id, count(*)::int pj, count(*) filter (where goles_favor > goles_contra)::int g,
                       count(*) filter (where goles_favor = goles_contra)::int e, count(*) filter (where goles_favor < goles_contra)::int p
                  from mios group by equipo_id) x
          join public.equipos e on e.id = x.equipo_id), '[]'::jsonb),
      'partidos', coalesce((select jsonb_agg(m.id) from mios m), '[]'::jsonb),
      'goleador', (select jsonb_build_object('persona_id', g.persona_id, 'nombre', pr.nombre, 'goles', g.goles)
                     from goles g join public.personas pr on pr.id = g.persona_id
                    order by g.goles desc, pr.nombre limit 1),
      'mvp', (select jsonb_build_object('persona_id', v.persona_id, 'nombre', pr.nombre, 'veces', v.veces)
                from mvps v join public.personas pr on pr.id = v.persona_id
               order by v.veces desc, pr.nombre limit 1)));
end;
$$;

-- ---------------------------------------------------------------------------
-- Perfil: DT y Ayudante técnico como posición (igual que en 0028)
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
    if nullif(p_datos->>'posicion', '') not in ('arquero', 'defensa', 'lateral', 'volante', 'delantero', 'dt', 'ayudante') then
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

-- Igual que en 0030, más 'cuerpo_tecnico' y 'dirige'.
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
    'instagram', f.instagram,
    'foto_ruta', f.foto_ruta, 'posicion', f.posicion, 'pie', f.pie,
    'cumple', to_char(f.nacimiento, 'MM-DD'),
    'nacimiento', case when v_propio then f.nacimiento end,
    'muestra_fisico', coalesce(f.muestra_fisico, false),
    'estatura_cm', case when v_propio or f.muestra_fisico then f.estatura_cm end,
    'peso_kg', case when v_propio or f.muestra_fisico then f.peso_kg end,
    'telefono', case when v_propio then c.telefono end,
    'correo', case when v_propio then c.email end,
    'cuerpo_tecnico', p.cuerpo_tecnico,
    'planteles', coalesce((
      select jsonb_agg(jsonb_build_object('id', e.id, 'nombre', e.nombre, 'dorsal', d.numero) order by e.orden, e.nombre)
        from public.equipos e
        left join public.dorsales d on d.equipo_id = e.id and d.persona_id = v_id
       where exists (select 1 from public.persona_equipos pe
                      where pe.persona_id = v_id and pe.equipo_id = e.id and pe.rol = 'jugador')), '[]'::jsonb),
    'dirige', coalesce((
      select jsonb_agg(jsonb_build_object('id', e.id, 'nombre', e.nombre) order by e.orden, e.nombre)
        from public.equipos e
       where e.club_id = p.club_id and public.es_tecnico_de(v_id, e.id)), '[]'::jsonb));
end;
$$;

revoke execute on function public.es_tecnico_de(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.partido_banca(uuid) from public, anon;
revoke execute on function public.partido_banca_guardar(uuid, jsonb) from public, anon;
revoke execute on function public.dt_cifras(uuid, int) from public, anon;
grant execute on function public.partido_banca(uuid) to authenticated;
grant execute on function public.partido_banca_guardar(uuid, jsonb) to authenticated;
grant execute on function public.dt_cifras(uuid, int) to authenticated;
