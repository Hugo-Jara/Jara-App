-- Jara App · 0043 · Los sábados desde cof.cl
--
-- La liga de los sábados cambió su página a cof.cl. Deporstar (de donde la
-- app sacaba fechas, resultados y tabla desde la 0032 y la 0038) dejó de
-- estar al día: al 9 de noviembre su tabla seguía en 4 partidos jugados y
-- sin el resultado del 7 de noviembre, mientras cof.cl ya mostraba 5.
--
-- cof.cl es una página Next.js que trae, dentro del mismo HTML, los datos de
-- todos los torneos (self.__next_f.push(...)): por torneo, sus fechas con los
-- partidos (home, away, hs, as, played, date, slot "08:45 · Cancha 2") y su
-- tabla (pos, name, pj, g, e, p, gf, gc, dif, pts). Se lee de una vez.
--
-- Cambios:
--   - liga_torneos: fuente 'cof' y cof_torneo (ej. 'senior-segunda-clausura').
--   - liga_desde_cof(html): saca la lista de torneos de la página.
--   - partidos_desde_cof(torneo) y tabla_desde_cof(torneo): los partidos y la
--     tabla de un torneo, en la misma forma que las otras fuentes.
--   - liga_refrescar: rama cof (fechas, resultados y tabla en un solo pedido,
--     cada 3 horas o con el botón). Además, un partido de la app enlazado a un
--     partido de la liga que ya no existe se vuelve a enlazar en vez de
--     duplicarse (pasa al cambiar de fuente).
--   - tablas_posiciones(): una tabla de un plantel con fuente cof cuenta como
--     conectada.
--
-- Revisión: no toca plata ni datos personales (nombres de equipos de la liga,
-- públicos). La revisa el administrador de la app.

alter table public.liga_torneos drop constraint if exists liga_torneos_fuente_check;
alter table public.liga_torneos drop constraint if exists liga_torneos_fuente_ok;
alter table public.liga_torneos
  add column if not exists cof_torneo text check (cof_torneo ~ '^[a-z0-9-]{1,60}$'),
  add constraint liga_torneos_fuente_check check (fuente in ('deporstar', 'copafacil', 'cof')),
  add constraint liga_torneos_fuente_ok check (
    (fuente = 'deporstar' and deporstar_torneo is not null)
    or (fuente = 'copafacil' and copafacil_torneo is not null)
    or (fuente = 'cof' and cof_torneo is not null));

-- La lista de torneos que trae la página de cof.cl, o null si no se encuentra.
-- Junta los pedazos self.__next_f.push([1,"..."]), busca la línea con
-- {"torneos":[...]} y la lee como JSON.
create or replace function public.liga_desde_cof(p_html text)
returns jsonb language plpgsql immutable set search_path = public as $$
declare
  v_datos text;
  v_linea text;
  v_arr jsonb;
begin
  select string_agg(('"' || m[1] || '"')::json #>> '{}', '' order by n) into v_datos
    from regexp_matches(coalesce(p_html, ''), 'self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)', 'g')
         with ordinality as r(m, n);
  if v_datos is null then return null; end if;
  select l into v_linea from regexp_split_to_table(v_datos, E'\n') l where l like '%{"torneos":[%' limit 1;
  if v_linea is null then return null; end if;
  begin
    v_arr := substr(v_linea, strpos(v_linea, ':') + 1)::jsonb;
  exception when others then
    return null;
  end;
  return (select x->'torneos' from jsonb_array_elements(case when jsonb_typeof(v_arr) = 'array' then v_arr else '[]'::jsonb end) x
           where jsonb_typeof(x) = 'object' and jsonb_typeof(x->'torneos') = 'array' limit 1);
end;
$$;

-- El número de una fecha de cof.cl: el de su nombre ("Fecha 7", "Fecha 8 CL").
-- Se usa el nombre y no la posición porque la página se salta las fechas
-- suspendidas (si después se juegan, las demás no cambian de número).
create or replace function public.fecha_de_cof(p_ronda jsonb)
returns bigint language sql immutable set search_path = public as $$
  select coalesce(substring(p_ronda->>'label' from '(\d{1,4})')::bigint,
                  case when (p_ronda->>'idx') ~ '^[0-9]{1,6}$' then (p_ronda->>'idx')::bigint end);
$$;

-- Los partidos de un torneo de cof.cl. El id es fijo para cada partido (el
-- número de fecha y los dos equipos), así se puede actualizar sin duplicar.
create or replace function public.partidos_desde_cof(p_torneo jsonb)
returns jsonb language sql immutable set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', hashtextextended(public.fecha_de_cof(r) || '|' || trim(m->>'home') || '|' || trim(m->>'away'), 0) & 9223372036854775807,
           'jornada', public.fecha_de_cof(r),
           'dia', coalesce(nullif(m->>'date', ''), r->>'iso'),
           'hora', nullif(substring(m->>'slot' from '^\s*(\d{1,2}:\d{2})'), ''),
           'cancha', nullif(left(trim(substring(m->>'slot' from '·\s*(.*)$')), 40), ''),
           'division', '',
           'local', left(trim(m->>'home'), 60),
           'visita', left(trim(m->>'away'), 60),
           'goles_local', case when (m->>'played')::boolean and jsonb_typeof(m->'hs') = 'number' then (m->>'hs')::int end,
           'goles_visita', case when (m->>'played')::boolean and jsonb_typeof(m->'as') = 'number' then (m->>'as')::int end)
         order by public.fecha_de_cof(r), m->>'slot'), '[]'::jsonb)
    from jsonb_array_elements(case when jsonb_typeof(p_torneo->'rounds') = 'array' then p_torneo->'rounds' else '[]'::jsonb end) r,
         jsonb_array_elements(case when jsonb_typeof(r->'matches') = 'array' then r->'matches' else '[]'::jsonb end) m
   where public.fecha_de_cof(r) is not null
     and coalesce(trim(m->>'home'), '') <> '' and coalesce(trim(m->>'away'), '') <> ''
     and coalesce(nullif(m->>'date', ''), r->>'iso') ~ '^\d{4}-\d{2}-\d{2}$'
     and (m->>'home') !~* '^\s*(libre|cupo libre)\s*$' and (m->>'away') !~* '^\s*(libre|cupo libre)\s*$';
$$;

-- La tabla de un torneo de cof.cl, en el orden de la liga.
create or replace function public.tabla_desde_cof(p_torneo jsonb)
returns jsonb language sql immutable set search_path = public as $$
  select jsonb_agg(jsonb_build_object(
           'equipo', left(trim(s->>'name'), 60), 'es_jara', trim(s->>'name') ilike '%jara%',
           'pj', coalesce((s->>'pj')::int, 0), 'pg', coalesce((s->>'g')::int, 0),
           'pe', coalesce((s->>'e')::int, 0), 'pp', coalesce((s->>'p')::int, 0),
           'gf', coalesce((s->>'gf')::int, 0), 'gc', coalesce((s->>'gc')::int, 0),
           'pts', coalesce((s->>'pts')::int, 0))
         order by (s->>'pos')::int nulls last, n)
    from jsonb_array_elements(case when jsonb_typeof(p_torneo->'standings') = 'array' then p_torneo->'standings' else '[]'::jsonb end)
         with ordinality as x(s, n)
   where coalesce(trim(s->>'name'), '') <> '';
$$;

-- Trae lo nuevo de la liga para un plantel: Deporstar, copafacil o cof.cl.
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
  v_torneo jsonb;
  v_grupo text;
begin
  select * into t from public.liga_torneos where equipo_id = p_equipo and club_id = public.mi_club_id();
  if t.equipo_id is null then
    raise exception 'Este plantel no está conectado a las fechas de la liga';
  end if;
  -- Cualquiera del club puede pedirla en el acto. Quien no anota partidos
  -- espera 5 minutos desde la última revisión, para no saturar la liga.
  if p_forzar and not public.puedo_anotar(p_equipo)
     and t.revisada_en is not null and t.revisada_en > now() - interval '5 minutes' then
    return 0;
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
  elsif t.fuente = 'cof' then
    -- cof.cl (la página nueva de la liga): una sola página trae las fechas,
    -- los resultados y la tabla de todos los torneos.
    select status, content into v_status, v_cuerpo
      from extensions.http_get('https://cof.cl/resultados?t=' || t.cof_torneo || '&v=tabla');
    if v_status is distinct from 200 then
      raise exception 'La página de la liga no respondió (%). Intenta más rato.', coalesce(v_status::text, 'sin respuesta');
    end if;
    select x into v_torneo from jsonb_array_elements(coalesce(public.liga_desde_cof(v_cuerpo), '[]'::jsonb)) x
     where x->>'id' = t.cof_torneo limit 1;
    if v_torneo is null then
      raise exception 'La página de la liga cambió: no se encontró el torneo %. Avísale al administrador de la app.', t.cof_torneo;
    end if;
    if jsonb_typeof(v_torneo->'rounds') = 'array' then
      insert into public.liga_jornadas (equipo_id, jornada_id, tag, revisada_en)
      select p_equipo, public.fecha_de_cof(r), left(coalesce(nullif(trim(r->>'label'), ''), 'Fecha'), 40), now()
        from jsonb_array_elements(v_torneo->'rounds') r
       where public.fecha_de_cof(r) is not null
      on conflict (equipo_id, jornada_id) do update set tag = excluded.tag, revisada_en = now();
      -- Las fechas que ya no están en la página (por ejemplo, las de Deporstar
      -- al cambiar de fuente) se borran.
      delete from public.liga_jornadas lj
       where lj.equipo_id = p_equipo
         and not exists (select 1 from jsonb_array_elements(v_torneo->'rounds') r where public.fecha_de_cof(r) = lj.jornada_id);
    end if;
    v_partidos := public.partidos_desde_cof(v_torneo);
    if jsonb_array_length(v_partidos) > 0 then
      select array_agg((e->>'id')::bigint) into v_ids from jsonb_array_elements(v_partidos) e;
      delete from public.liga_partidos where equipo_id = p_equipo and not (deporstar_id = any (v_ids));
      insert into public.liga_partidos (equipo_id, deporstar_id, jornada_id, dia, hora, cancha, division, local, visita, goles_local, goles_visita)
      select p_equipo, (e->>'id')::bigint, (e->>'jornada')::bigint, (e->>'dia')::date, (e->>'hora')::time, e->>'cancha',
             '', e->>'local', e->>'visita', (e->>'goles_local')::smallint, (e->>'goles_visita')::smallint
        from jsonb_array_elements(v_partidos) e
      on conflict (equipo_id, deporstar_id) do update
         set jornada_id = excluded.jornada_id, dia = excluded.dia, hora = excluded.hora,
             cancha = coalesce(excluded.cancha, liga_partidos.cancha), division = excluded.division,
             local = excluded.local, visita = excluded.visita,
             goles_local = excluded.goles_local, goles_visita = excluded.goles_visita;
    end if;

    -- La tabla: queda en la pestaña que ya tenía el plantel (o sin nombre).
    v_filas := public.tabla_desde_cof(v_torneo);
    if v_filas is not null then
      v_grupo := coalesce((select grupo from public.tablas_posiciones where equipo_id = p_equipo order by creada_en, grupo limit 1), '');
      insert into public.tablas_posiciones (equipo_id, club_id, grupo, filas, fuente, actualizada_en, revisada_en)
      values (p_equipo, t.club_id, v_grupo, v_filas, 'https://cof.cl/resultados?t=' || t.cof_torneo, now(), now())
      on conflict (equipo_id, grupo) do update
         set filas = excluded.filas, revisada_en = now(), deporstar_tabla = null, fuente = excluded.fuente,
             actualizada_en = case when tablas_posiciones.filas is distinct from excluded.filas then now() else tablas_posiciones.actualizada_en end,
             actualizada_por = case when tablas_posiciones.filas is distinct from excluded.filas then null else tablas_posiciones.actualizada_por end;
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
      elsif exists (select 1 from public.partidos pa where pa.equipo_id = p_equipo and pa.fecha = p.dia
                     and (pa.liga_partido is null or not exists (select 1 from public.liga_partidos l2
                                                                  where l2.equipo_id = p_equipo and l2.deporstar_id = pa.liga_partido))) then
        -- Un partido de ese día sin enlazar, o enlazado a un partido de la liga
        -- que ya no existe (por ejemplo, al cambiar de Deporstar a cof.cl).
        update public.partidos
           set liga_partido = p.deporstar_id, hora_inicio = coalesce(p.hora, hora_inicio), cancha = coalesce(p.cancha, cancha),
               torneo = coalesce(torneo, v_tag), rival = v_rival
         where id = (select pa.id from public.partidos pa where pa.equipo_id = p_equipo and pa.fecha = p.dia
                       and (pa.liga_partido is null or not exists (select 1 from public.liga_partidos l2
                                                                    where l2.equipo_id = p_equipo and l2.deporstar_id = pa.liga_partido))
                      order by pa.creado_en limit 1)
           and goles_favor is null;
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


-- Igual que la 0039, con la fuente cof también como conectada.
create or replace function public.tablas_posiciones()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'equipo_id', e.id, 'equipo', e.nombre, 'grupo', coalesce(t.grupo, ''),
           'torneo', t.torneo, 'filas', coalesce(t.filas, '[]'::jsonb), 'fuente', t.fuente,
           'actualizada_en', case when jsonb_array_length(coalesce(t.filas, '[]'::jsonb)) > 0 then t.actualizada_en end,
           'conectada', t.deporstar_tabla is not null
                        or exists (select 1 from public.liga_torneos l where l.equipo_id = e.id and l.fuente in ('copafacil', 'cof')),
           'deporstar_tabla', t.deporstar_tabla,
           'revisada_en', t.revisada_en,
           'puedo_editar', public.puedo_anotar(e.id) and not public.soy_cuenta_de_prueba())
         order by e.orden, e.nombre, t.creada_en, t.grupo), '[]'::jsonb)
    from public.equipos e
    left join public.tablas_posiciones t on t.equipo_id = e.id
   where e.club_id = public.mi_club_id();
$$;

revoke execute on function public.liga_desde_cof(text) from public, anon;
revoke execute on function public.fecha_de_cof(jsonb) from public, anon;
revoke execute on function public.partidos_desde_cof(jsonb) from public, anon;
revoke execute on function public.tabla_desde_cof(jsonb) from public, anon;
revoke execute on function public.liga_refrescar(uuid, boolean) from public, anon;
revoke execute on function public.tablas_posiciones() from public, anon;
grant execute on function public.liga_refrescar(uuid, boolean) to authenticated;
grant execute on function public.tablas_posiciones() to authenticated;
