-- Jara App · 0040 · El botón "Actualizar la liga" para todos
--
-- Hasta ahora solo quien anota partidos (encargado, anota_partidos o admin)
-- podía pedir la liga en el acto; el resto veía la última actualización y la
-- app revisaba sola cada 3 horas. Ahora cualquiera del club puede apretar el
-- botón. Para no saturar a Deporstar ni a copafacil, quien no anota partidos
-- solo sale a la liga si pasaron 5 minutos desde la última revisión de ese
-- plantel; si no, la función vuelve sin hacer nada.
--
-- Cambios:
--   - liga_refrescar: igual que la 0039, con la regla de los 5 minutos en vez
--     del error "Solo el encargado…".
--   - tabla_refrescar: igual que la 0037, con la misma regla.
--   - liga_fechas: puedo_actualizar queda en true para todos (la app ya no lo
--     usa para esconder el botón).
--
-- Revisión: cambia quién puede pedir la liga en el acto (permiso). No toca
-- plata ni datos personales. La revisa el administrador de la app.

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


create or replace function public.tabla_refrescar(p_equipo uuid, p_forzar boolean default false, p_grupo text default '')
returns boolean language plpgsql security definer set search_path = public as $$
declare
  t public.tablas_posiciones;
  v_status int;
  v_cuerpo text;
  v_filas jsonb;
begin
  select * into t from public.tablas_posiciones
   where equipo_id = p_equipo and grupo = coalesce(trim(p_grupo), '') and club_id = public.mi_club_id();
  if t.equipo_id is null or t.deporstar_tabla is null then
    raise exception 'La tabla de este plantel no está conectada a la liga';
  end if;
  -- Cualquiera del club puede pedirla en el acto. Quien no anota partidos
  -- espera 5 minutos desde la última revisión, para no saturar la liga.
  if not p_forzar and t.revisada_en is not null and t.revisada_en > now() - interval '3 hours' then
    return false;
  end if;
  if p_forzar and not public.puedo_anotar(p_equipo)
     and t.revisada_en is not null and t.revisada_en > now() - interval '5 minutes' then
    return false;
  end if;

  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '8000');
  select status, content into v_status, v_cuerpo
    from extensions.http_get(format('https://api.deporstar.com/api/fixture/match/tabla-positions/%s/', t.deporstar_tabla));
  if v_status is distinct from 200 then
    raise exception 'La página de la liga no respondió (%). Intenta más rato.', coalesce(v_status::text, 'sin respuesta');
  end if;
  begin
    v_filas := public.tabla_desde_deporstar(v_cuerpo::jsonb);
  exception when invalid_text_representation then
    raise exception 'La liga respondió algo que no es una tabla';
  end;

  if v_filas = t.filas then
    update public.tablas_posiciones set revisada_en = now() where equipo_id = p_equipo and grupo = t.grupo;
    return false;
  end if;
  update public.tablas_posiciones
     set filas = v_filas, revisada_en = now(), actualizada_en = now(), actualizada_por = null,
         fuente = coalesce(fuente, 'https://deporstar.com')
   where equipo_id = p_equipo and grupo = t.grupo;
  return true;
end;
$$;


create or replace function public.liga_fechas()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'conectados', coalesce((
      select jsonb_agg(jsonb_build_object('equipo_id', t.equipo_id, 'equipo', e.nombre, 'revisada_en', t.revisada_en,
                                          'puedo_actualizar', true)
                       order by e.orden, e.nombre)
        from public.liga_torneos t join public.equipos e on e.id = t.equipo_id
       where t.club_id = public.mi_club_id()), '[]'::jsonb),
    'partidos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', lp.deporstar_id, 'equipo_id', lp.equipo_id, 'equipo', e.nombre, 'fecha', lj.tag,
               'dia', lp.dia, 'hora', to_char(lp.hora, 'HH24:MI'), 'cancha', lp.cancha,
               'local', lp.local, 'visita', lp.visita, 'goles_local', lp.goles_local, 'goles_visita', lp.goles_visita,
               'es_jara', (lp.local ilike '%jara%' or lp.visita ilike '%jara%'))
             order by e.orden, lp.dia, lp.hora, lp.deporstar_id)
        from public.liga_partidos lp
        join public.liga_torneos t on t.equipo_id = lp.equipo_id
        join public.equipos e on e.id = lp.equipo_id
        join public.liga_jornadas lj on lj.equipo_id = lp.equipo_id and lj.jornada_id = lp.jornada_id
       where t.club_id = public.mi_club_id() and (t.division is null or lp.division = t.division)), '[]'::jsonb));
$$;


revoke execute on function public.liga_refrescar(uuid, boolean) from public, anon;
revoke execute on function public.tabla_refrescar(uuid, boolean, text) from public, anon;
revoke execute on function public.liga_fechas() from public, anon;
grant execute on function public.liga_refrescar(uuid, boolean) to authenticated;
grant execute on function public.tabla_refrescar(uuid, boolean, text) to authenticated;
grant execute on function public.liga_fechas() to authenticated;
