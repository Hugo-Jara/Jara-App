-- Jara App · 0039 · La liga del jueves desde copafacil
--
-- El Senior Jueves juega en una liga que publica en copafacil. Sus datos son
-- públicos en la base de copafacil (Firebase): los partidos en
-- events/<evento>/matchs.json, los equipos con su línea de la tabla en
-- events/<evento>@<torneo>/teams.json, las fechas en .../m_set.json y las
-- canchas en events/<evento>/places.json. Con esto el jueves queda igual que
-- el sábado (0038): fechas, resultados y partidos del Jara que se crean
-- solos, y además las dos tablas (la del grupo del Jara y la general) se
-- actualizan solas, sin pantallazo.
--
-- Cambios:
--   - liga_torneos: fuente ('deporstar' o 'copafacil') y copafacil_torneo
--     (ej. '-68fm5@riynh'). deporstar_torneo deja de ser obligatorio.
--   - liga_jornadas.jornada_id y liga_partidos.jornada_id pasan a bigint (las
--     fechas de copafacil tienen números largos).
--   - liga_desde_copafacil(...) y tabla_desde_copafacil(...): leen lo que
--     devuelve copafacil.
--   - liga_refrescar: si el plantel es de copafacil, trae los cuatro archivos
--     (cada 3 horas, igual que antes), guarda partidos y tablas, y crea los
--     partidos del Jara que vienen.
--   - tablas_posiciones(): una tabla de un plantel conectado a copafacil
--     aparece como conectada (se actualiza sola).
--
-- Revisión: no toca plata ni datos personales (nombres de equipos de la liga,
-- públicos). La revisa el administrador de la app.

alter table public.liga_torneos
  add column fuente text not null default 'deporstar' check (fuente in ('deporstar', 'copafacil')),
  add column copafacil_torneo text check (copafacil_torneo ~ '^-?[A-Za-z0-9_-]{1,30}@[A-Za-z0-9_-]{1,30}$'),
  alter column deporstar_torneo drop not null,
  add constraint liga_torneos_fuente_ok check (
    (fuente = 'deporstar' and deporstar_torneo is not null) or (fuente = 'copafacil' and copafacil_torneo is not null));

alter table public.liga_jornadas alter column jornada_id type bigint;
alter table public.liga_partidos alter column jornada_id type bigint;

-- Partidos de un torneo de copafacil, en la misma forma que liga_desde_deporstar
-- más el número de la fecha ('jornada'). Se saltan los partidos contra "Cupo
-- Libre" (la fecha libre) y los que no tienen día. copafacil no manda los
-- goles en cero: un partido terminado sin goles de un lado cuenta 0.
create or replace function public.liga_desde_copafacil(p_matchs jsonb, p_teams jsonb, p_places jsonb, p_torneo text)
returns jsonb language sql immutable set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', k::bigint,
           'jornada', (m->>'m_set')::bigint,
           'dia', (to_timestamp((m->>'d_i')::bigint / 1000.0) at time zone 'America/Santiago')::date,
           'hora', to_char(to_timestamp((m->>'d_i')::bigint / 1000.0) at time zone 'America/Santiago', 'HH24:MI'),
           'division', '',
           'local', left(trim(coalesce(p_teams->(m->>'team1')->>'name', m->>'name1', '¿?')), 60),
           'visita', left(trim(coalesce(p_teams->(m->>'team2')->>'name', m->>'name2', '¿?')), 60),
           'goles_local', case when (m->>'st') = '3' or m ? 'finished' then coalesce((m->'dt'->>'qt_g1')::int, 0) end,
           'goles_visita', case when (m->>'st') = '3' or m ? 'finished' then coalesce((m->'dt'->>'qt_g2')::int, 0) end,
           'cancha', nullif(initcap(lower(left(trim(coalesce(p_places->(m->>'l')->>'title', '')), 40))), ''))
         order by (m->>'d_i')::bigint), '[]'::jsonb)
    from jsonb_each(coalesce(p_matchs, '{}'::jsonb)) as e(k, m)
   where jsonb_typeof(m) = 'object' and m->>'evt' = p_torneo
     and k ~ '^[0-9]{1,18}$' and (m->>'m_set') ~ '^[0-9]{1,18}$' and (m->>'d_i') ~ '^[0-9]{10,14}$'
     and coalesce(p_teams->(m->>'team1')->>'name', '') !~* 'cupo libre'
     and coalesce(p_teams->(m->>'team2')->>'name', '') !~* 'cupo libre';
$$;

-- Las tablas desde los equipos de copafacil. Cada equipo trae su línea en
-- dt.<fase>.dt como "1=7#2=3#...": 0 puntos, 1 jugados, 2 ganados, 3
-- empatados, 4 perdidos, 5 goles a favor, 6 goles en contra; col es el
-- puesto general y colg el puesto en su grupo (g). Se usa la última fase.
-- Devuelve {grupo: 'A', del_grupo: [...], general: [...]}.
create or replace function public.tabla_desde_copafacil(p_teams jsonb)
returns jsonb language plpgsql immutable set search_path = public as $$
declare
  v_fase text;
  v_grupo text;
  v_filas jsonb;
begin
  select max(f) into v_fase
    from jsonb_each(coalesce(p_teams, '{}'::jsonb)) e(k, t), jsonb_object_keys(t->'dt') f
   where jsonb_typeof(t->'dt') = 'object';
  if v_fase is null then return null; end if;

  with eq as (
    select trim(t->>'name') as nombre, coalesce(t->>'g', '') as g,
           (t->'dt'->v_fase->>'col')::int as col, (t->'dt'->v_fase->>'colg')::int as colg,
           (select jsonb_object_agg(split_part(x, '=', 1), split_part(x, '=', 2))
              from unnest(string_to_array(t->'dt'->v_fase->>'dt', '#')) x where x like '%=%') as n
      from jsonb_each(p_teams) e(k, t)
     where t->'dt'->v_fase is not null and coalesce(trim(t->>'name'), '') <> ''
  ), filas as (
    select nombre, g, col, colg, jsonb_build_object(
             'equipo', left(nombre, 60), 'es_jara', nombre ilike '%jara%',
             'pj', coalesce(round((n->>'1')::numeric)::int, 0), 'pg', coalesce(round((n->>'2')::numeric)::int, 0),
             'pe', coalesce(round((n->>'3')::numeric)::int, 0), 'pp', coalesce(round((n->>'4')::numeric)::int, 0),
             'gf', coalesce(round((n->>'5')::numeric)::int, 0), 'gc', coalesce(round((n->>'6')::numeric)::int, 0),
             'pts', coalesce(round((n->>'0')::numeric)::int, 0)) as fila
      from eq
  )
  select (select g from filas where nombre ilike '%jara%' limit 1),
         jsonb_build_object(
           'general', (select jsonb_agg(fila order by col nulls last, nombre) from filas),
           'grupos', (select jsonb_object_agg(g, x) from (
                        select g, jsonb_agg(fila order by colg nulls last, nombre) as x from filas where g <> '' group by g) s))
    into v_grupo, v_filas;
  return v_filas || jsonb_build_object('grupo', v_grupo);
end;
$$;

-- Trae lo nuevo de la liga para un plantel: Deporstar (como en la 0038) o
-- copafacil.
create or replace function public.liga_refrescar(p_equipo uuid, p_forzar boolean default false)
returns int language plpgsql security definer set search_path = public as $$
declare
  t public.liga_torneos;
  j record;
  v_status int;
  v_cuerpo text;
  v_lista jsonb;
  v_partidos jsonb;
  v_ids bigint[];
  v_hoy date := (now() at time zone 'America/Santiago')::date;
  v_faltan int;
  p record;
  v_rival text;
  v_tag text;
  v_base text := 'https://copafacil-web.firebaseio.com/events/';
  v_evento text;
  v_matchs jsonb;
  v_teams jsonb;
  v_sets jsonb;
  v_places jsonb;
  v_tablas jsonb;
  v_nombre text;
  v_filas jsonb;
begin
  select * into t from public.liga_torneos where equipo_id = p_equipo and club_id = public.mi_club_id();
  if t.equipo_id is null then
    raise exception 'Este plantel no está conectado a las fechas de la liga';
  end if;
  if p_forzar and not public.puedo_anotar(p_equipo) then
    raise exception 'Solo el encargado del plantel o quien anota partidos puede actualizarlas en el acto';
  end if;
  select count(*) into v_faltan from public.liga_jornadas
   where equipo_id = p_equipo and revisada_en is null and jornada_id >= t.desde_jornada and tag !~* '^amistoso';
  if not p_forzar and v_faltan = 0 and t.revisada_en is not null and t.revisada_en > now() - interval '3 hours' then
    return 0;
  end if;

  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '4000');

  if t.fuente = 'copafacil' then
    -- copafacil: cuatro archivos y listo (todas las fechas de una vez).
    v_evento := split_part(t.copafacil_torneo, '@', 1);
    select status, content into v_status, v_cuerpo from extensions.http_get(v_base || v_evento || '/matchs.json');
    if v_status is distinct from 200 then
      raise exception 'La página de la liga no respondió (%). Intenta más rato.', coalesce(v_status::text, 'sin respuesta');
    end if;
    begin
      v_matchs := v_cuerpo::jsonb;
      select content::jsonb into v_teams from extensions.http_get(v_base || t.copafacil_torneo || '/teams.json') where status = 200;
      select content::jsonb into v_sets from extensions.http_get(v_base || t.copafacil_torneo || '/m_set.json') where status = 200;
      select content::jsonb into v_places from extensions.http_get(v_base || v_evento || '/places.json') where status = 200;
    exception when invalid_text_representation then
      raise exception 'La liga respondió algo que no se entiende';
    end;
    if jsonb_typeof(v_sets) = 'object' then
      insert into public.liga_jornadas (equipo_id, jornada_id, tag, revisada_en)
      select p_equipo, k::bigint, left(coalesce(nullif(trim(s->>'title'), ''), 'Fecha'), 40), now()
        from jsonb_each(v_sets) e(k, s)
       where k ~ '^[0-9]{1,18}$'
      on conflict (equipo_id, jornada_id) do update set tag = excluded.tag, revisada_en = now();
    end if;
    v_partidos := public.liga_desde_copafacil(v_matchs, coalesce(v_teams, '{}'::jsonb), coalesce(v_places, '{}'::jsonb), t.copafacil_torneo);
    if jsonb_array_length(v_partidos) > 0 then
      -- Una fecha que copafacil no listó todavía igual queda guardada.
      insert into public.liga_jornadas (equipo_id, jornada_id, tag, revisada_en)
      select distinct p_equipo, (e->>'jornada')::bigint, 'Fecha', now() from jsonb_array_elements(v_partidos) e
      on conflict (equipo_id, jornada_id) do nothing;
      select array_agg((e->>'id')::bigint) into v_ids from jsonb_array_elements(v_partidos) e;
      delete from public.liga_partidos where equipo_id = p_equipo and not (deporstar_id = any (v_ids));
      insert into public.liga_partidos (equipo_id, deporstar_id, jornada_id, dia, hora, cancha, division, local, visita, goles_local, goles_visita)
      select p_equipo, (e->>'id')::bigint, (e->>'jornada')::bigint, (e->>'dia')::date, (e->>'hora')::time, e->>'cancha',
             '', e->>'local', e->>'visita', (e->>'goles_local')::smallint, (e->>'goles_visita')::smallint
        from jsonb_array_elements(v_partidos) e
      on conflict (equipo_id, deporstar_id) do update
         set jornada_id = excluded.jornada_id, dia = excluded.dia, hora = excluded.hora, cancha = excluded.cancha,
             local = excluded.local, visita = excluded.visita,
             goles_local = excluded.goles_local, goles_visita = excluded.goles_visita;
    end if;

    -- Las tablas: la del grupo del Jara y la general, como pestañas.
    v_tablas := public.tabla_desde_copafacil(v_teams);
    if v_tablas is not null then
      for v_nombre, v_filas in
        select 'Grupo ' || (v_tablas->>'grupo'), v_tablas->'grupos'->(v_tablas->>'grupo') where v_tablas->>'grupo' <> ''
        union all
        select 'General', v_tablas->'general'
      loop
        continue when v_filas is null or jsonb_array_length(v_filas) = 0;
        insert into public.tablas_posiciones (equipo_id, club_id, grupo, filas, fuente, actualizada_en, revisada_en)
        values (p_equipo, t.club_id, v_nombre, v_filas, 'https://copafacil.com/' || t.copafacil_torneo, now(), now())
        on conflict (equipo_id, grupo) do update
           set filas = excluded.filas, revisada_en = now(),
               actualizada_en = case when tablas_posiciones.filas is distinct from excluded.filas then now() else tablas_posiciones.actualizada_en end,
               actualizada_por = case when tablas_posiciones.filas is distinct from excluded.filas then null else tablas_posiciones.actualizada_por end,
               fuente = coalesce(tablas_posiciones.fuente, excluded.fuente);
      end loop;
    end if;
  else
    -- Deporstar (igual que la 0038).
    -- 1. La lista de fechas.
    select status, content into v_status, v_cuerpo
      from extensions.http_get(format('https://api.deporstar.com/api/fixture/jornada/simple-list-jornadas/torneo/%s/', t.deporstar_torneo));
    if v_status is distinct from 200 then
      raise exception 'La página de la liga no respondió (%). Intenta más rato.', coalesce(v_status::text, 'sin respuesta');
    end if;
    begin
      v_lista := v_cuerpo::jsonb;
    exception when invalid_text_representation then
      raise exception 'La liga respondió algo que no es una lista de fechas';
    end;
    if jsonb_typeof(v_lista) = 'array' then
      insert into public.liga_jornadas (equipo_id, jornada_id, tag)
      select p_equipo, (e->>'id')::bigint, left(coalesce(nullif(trim(e->>'tag'), ''), 'Fecha'), 40)
        from jsonb_array_elements(v_lista) e
       where (e->>'id') ~ '^[0-9]{1,12}$'
      on conflict (equipo_id, jornada_id) do update set tag = excluded.tag;
    end if;

    -- 2. Hasta 3 fechas: primero las nunca leídas, después las de estos días.
    for j in
      select lj.jornada_id, lj.tag from public.liga_jornadas lj
       where lj.equipo_id = p_equipo and not lj.cerrada and lj.jornada_id >= t.desde_jornada and lj.tag !~* '^amistoso'
       order by (lj.revisada_en is not null),
                not exists (select 1 from public.liga_partidos lp
                             where lp.equipo_id = p_equipo and lp.jornada_id = lj.jornada_id
                               and lp.dia between v_hoy - 2 and v_hoy + 8),
                lj.revisada_en nulls first, lj.jornada_id
       limit 3
    loop
      select status, content into v_status, v_cuerpo
        from extensions.http_get(format('https://deporstar.com/torneo/%s/fixture/?jornada=%s', t.deporstar_torneo, j.jornada_id));
      continue when v_status is distinct from 200;
      v_partidos := public.liga_desde_deporstar(v_cuerpo);
      if jsonb_array_length(v_partidos) > 0 then
        select array_agg((e->>'id')::bigint) into v_ids from jsonb_array_elements(v_partidos) e;
        delete from public.liga_partidos
         where equipo_id = p_equipo and jornada_id = j.jornada_id and not (deporstar_id = any (v_ids));
        insert into public.liga_partidos (equipo_id, deporstar_id, jornada_id, dia, hora, cancha, division, local, visita, goles_local, goles_visita)
        select p_equipo, (e->>'id')::bigint, j.jornada_id, (e->>'dia')::date, (e->>'hora')::time, e->>'cancha',
               coalesce(e->>'division', ''), e->>'local', e->>'visita', (e->>'goles_local')::smallint, (e->>'goles_visita')::smallint
          from jsonb_array_elements(v_partidos) e
        on conflict (equipo_id, deporstar_id) do update
           set jornada_id = excluded.jornada_id, dia = excluded.dia, hora = excluded.hora,
               cancha = coalesce(excluded.cancha, liga_partidos.cancha), division = excluded.division,
               local = excluded.local, visita = excluded.visita,
               goles_local = excluded.goles_local, goles_visita = excluded.goles_visita;
      end if;
      update public.liga_jornadas lj
         set revisada_en = now(),
             cerrada = exists (select 1 from public.liga_partidos lp where lp.equipo_id = p_equipo and lp.jornada_id = j.jornada_id)
                   and not exists (select 1 from public.liga_partidos lp
                                    where lp.equipo_id = p_equipo and lp.jornada_id = j.jornada_id
                                      and lp.goles_local is null and lp.dia >= v_hoy - 14)
       where lj.equipo_id = p_equipo and lj.jornada_id = j.jornada_id;
    end loop;
  end if;

  -- 3. La división del Jara: la del último partido donde aparece.
  update public.liga_torneos
     set revisada_en = now(),
         division = coalesce((select lp.division from public.liga_partidos lp
                               where lp.equipo_id = p_equipo and (lp.local ilike '%jara%' or lp.visita ilike '%jara%')
                               order by lp.dia desc limit 1), division)
   where equipo_id = p_equipo
  returning * into t;

  -- 4. Los partidos del Jara que vienen quedan como partidos de la app.
  if t.division is not null then
    for p in
      select lp.*, lj.tag from public.liga_partidos lp
        join public.liga_jornadas lj on lj.equipo_id = lp.equipo_id and lj.jornada_id = lp.jornada_id
       where lp.equipo_id = p_equipo and lp.division = t.division and lp.goles_local is null and lp.dia >= v_hoy
         and (lp.local ilike '%jara%' or lp.visita ilike '%jara%')
    loop
      v_rival := case when p.local ilike '%jara%' then p.visita else p.local end;
      v_tag := left(p.tag, 40);
      if exists (select 1 from public.partidos where equipo_id = p_equipo and liga_partido = p.deporstar_id) then
        update public.partidos
           set fecha = p.dia, hora_inicio = coalesce(p.hora, hora_inicio), cancha = coalesce(p.cancha, cancha), rival = v_rival
         where equipo_id = p_equipo and liga_partido = p.deporstar_id and goles_favor is null;
      elsif exists (select 1 from public.partidos where equipo_id = p_equipo and fecha = p.dia and liga_partido is null) then
        update public.partidos
           set liga_partido = p.deporstar_id, hora_inicio = coalesce(hora_inicio, p.hora), cancha = coalesce(cancha, p.cancha),
               torneo = coalesce(torneo, v_tag)
         where id = (select id from public.partidos where equipo_id = p_equipo and fecha = p.dia and liga_partido is null
                      order by creado_en limit 1);
      else
        insert into public.partidos (club_id, equipo_id, rival, torneo, fecha, hora_inicio, cancha, liga_partido)
        values (t.club_id, p_equipo, v_rival, v_tag, p.dia, p.hora, p.cancha, p.deporstar_id);
      end if;
    end loop;
  end if;

  select count(*) into v_faltan from public.liga_jornadas
   where equipo_id = p_equipo and revisada_en is null and jornada_id >= t.desde_jornada and tag !~* '^amistoso';
  return v_faltan;
end;
$$;

-- Igual que la 0037, pero una tabla de un plantel conectado a copafacil
-- también cuenta como conectada (se actualiza sola, sin pantallazo).
create or replace function public.tablas_posiciones()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'equipo_id', e.id, 'equipo', e.nombre, 'grupo', coalesce(t.grupo, ''),
           'torneo', t.torneo, 'filas', coalesce(t.filas, '[]'::jsonb), 'fuente', t.fuente,
           'actualizada_en', case when jsonb_array_length(coalesce(t.filas, '[]'::jsonb)) > 0 then t.actualizada_en end,
           'conectada', t.deporstar_tabla is not null
                        or exists (select 1 from public.liga_torneos l where l.equipo_id = e.id and l.fuente = 'copafacil'),
           'deporstar_tabla', t.deporstar_tabla,
           'revisada_en', t.revisada_en,
           'puedo_editar', public.puedo_anotar(e.id) and not public.soy_cuenta_de_prueba())
         order by e.orden, e.nombre, t.creada_en, t.grupo), '[]'::jsonb)
    from public.equipos e
    left join public.tablas_posiciones t on t.equipo_id = e.id
   where e.club_id = public.mi_club_id();
$$;

revoke execute on function public.liga_desde_copafacil(jsonb, jsonb, jsonb, text) from public, anon;
revoke execute on function public.tabla_desde_copafacil(jsonb) from public, anon;
revoke execute on function public.liga_refrescar(uuid, boolean) from public, anon;
grant execute on function public.liga_refrescar(uuid, boolean) to authenticated;
