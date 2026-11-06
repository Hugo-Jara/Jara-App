-- Jara App · 0038 · Las fechas de la liga (fixture y resultados) desde Deporstar
--
-- Los sábados la liga publica en Deporstar todas sus fechas: la lista sale en
-- limpio (api.deporstar.com/api/fixture/jornada/simple-list-jornadas/torneo/N/)
-- y los partidos de cada fecha, con hora, cancha y resultado, vienen dentro de
-- la página de esa fecha (deporstar.com/torneo/N/fixture/?jornada=M). La base
-- trae las dos cosas, igual que la tabla en la 0032, y la app las muestra en
-- "La liga" > Fechas: todos los partidos del campeonato, no solo los del Jara.
--
-- Un torneo de Deporstar mezcla divisiones ("1ERA División Clausura" y "2DA
-- División Clausura"): se guarda todo y se muestra solo la división donde
-- juega el Jara.
--
-- Además, cada partido del Jara que viene queda creado solo como partido de la
-- app (rival, día, hora y cancha), para responder voy / no voy sin que el
-- encargado lo programe. Si el encargado ya había creado uno ese día, se usa
-- ese y solo se completa lo que le falta. Si la liga cambia la hora o la
-- cancha, el partido se actualiza mientras no tenga resultado.
--
-- Cambios:
--   - liga_torneos: qué torneo de Deporstar sigue cada plantel (lo conecta el
--     administrador por SQL, como la tabla) y desde qué fecha.
--   - liga_jornadas y liga_partidos: lo que se trajo.
--   - partidos.liga_partido: el partido de la liga del que salió.
--   - liga_desde_deporstar(html): lee los partidos de la página de una fecha.
--   - liga_refrescar(plantel, forzar): trae lo nuevo (máximo 3 páginas por vez,
--     cada 3 horas; forzar solo quien anota partidos). Devuelve cuántas fechas
--     faltan por leer la primera vez.
--   - liga_fechas(): lo que ve la app.
--
-- Revisión: no toca plata ni datos personales (solo nombres de equipos de la
-- liga, que son públicos). Crea partidos del plantel, como haría su encargado.
-- La revisa el administrador de la app.

create table public.liga_torneos (
  equipo_id         uuid primary key references public.equipos(id) on delete cascade,
  club_id           uuid not null references public.clubes(id) on delete cascade,
  deporstar_torneo  int not null check (deporstar_torneo between 1 and 99999999),
  desde_jornada     int not null default 0,
  division          text,
  revisada_en       timestamptz
);

create table public.liga_jornadas (
  equipo_id    uuid not null references public.equipos(id) on delete cascade,
  jornada_id   int not null,
  tag          text not null,
  revisada_en  timestamptz,
  cerrada      boolean not null default false,
  primary key (equipo_id, jornada_id)
);

create table public.liga_partidos (
  equipo_id     uuid not null references public.equipos(id) on delete cascade,
  deporstar_id  bigint not null,
  jornada_id    int not null,
  dia           date not null,
  hora          time,
  cancha        text,
  division      text not null default '',
  local         text not null,
  visita        text not null,
  goles_local   smallint,
  goles_visita  smallint,
  primary key (equipo_id, deporstar_id)
);
create index liga_partidos_jornada_idx on public.liga_partidos (equipo_id, jornada_id);

alter table public.partidos add column liga_partido bigint;
create unique index partidos_liga_partido_idx on public.partidos (equipo_id, liga_partido) where liga_partido is not null;

alter table public.liga_torneos  enable row level security;
alter table public.liga_jornadas enable row level security;
alter table public.liga_partidos enable row level security;
revoke all on public.liga_torneos, public.liga_jornadas, public.liga_partidos from anon, authenticated;

-- Lee la página de una fecha. Cada partido es una tarjeta con: el día y la
-- hora ("sáb 31 oct 26 - 08:45H (2DA División Clausura)"), los dos equipos
-- (links a /equipo/...), al medio el resultado ("1 - 2") o la hora si no se
-- ha jugado, la cancha si se sabe, y el link "Ver más" con el número del
-- partido. Devuelve un arreglo; lo que no se entiende se salta.
create or replace function public.liga_desde_deporstar(p_html text)
returns jsonb language plpgsql immutable set search_path = public as $$
declare
  b text;
  v_out jsonb := '[]'::jsonb;
  v_id text;
  v_linea text;
  m text[];
  v_dia date;
  v_equipos text[];
  v_goles text[];
  v_cancha text;
  v_mes int;
begin
  if p_html is null then return v_out; end if;
  for b in select x from regexp_split_to_table(p_html, 'shadow-lg relative">') with ordinality as t(x, n) where n > 1 loop
    v_id := substring(b from '/torneo/[0-9]+/([0-9]+)/partido');
    continue when v_id is null;
    v_linea := substring(b from '<p[^>]*>([^<]*[0-9]{1,2}:[0-9]{2}H[^<]*)</p>');
    continue when v_linea is null;
    m := regexp_match(lower(v_linea), '([0-9]{1,2})\s+([a-zé]{3})[a-zé]*\.?\s+([0-9]{2,4})');
    continue when m is null;
    v_mes := array_position(array['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'], m[2]);
    continue when v_mes is null;
    begin
      v_dia := make_date(case when length(m[3]) = 2 then 2000 + m[3]::int else m[3]::int end, v_mes, m[1]::int);
    exception when others then continue;
    end;
    select array_agg(replace(replace(replace(replace(replace(trim(e[1]),
             '&#x27;', ''''), '&#39;', ''''), '&quot;', '"'), '&lt;', '<'), '&amp;', '&') order by n)
      into v_equipos
      from regexp_matches(b, 'href="/equipo/[^"]*"[^>]*>([^<]*)</a>', 'g') with ordinality as t(e, n);
    continue when coalesce(array_length(v_equipos, 1), 0) < 2;
    v_goles := regexp_match(b, '>\s*([0-9]{1,2})\s*-\s*([0-9]{1,2})\s*</span>');
    v_cancha := trim(substring(b from '>\s*(Cancha[^<]{0,40})<'));
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'id', v_id::bigint,
      'dia', v_dia,
      'hora', substring(v_linea from '([0-9]{1,2}:[0-9]{2})H'),
      'division', coalesce(trim(substring(v_linea from '\(([^)]*)\)')), ''),
      'local', left(v_equipos[1], 60),
      'visita', left(v_equipos[2], 60),
      'goles_local', v_goles[1]::int,
      'goles_visita', v_goles[2]::int,
      'cancha', nullif(left(v_cancha, 40), '')));
  end loop;
  return v_out;
end;
$$;

-- Trae lo nuevo de la liga para un plantel.
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
    select p_equipo, (e->>'id')::int, left(coalesce(nullif(trim(e->>'tag'), ''), 'Fecha'), 40)
      from jsonb_array_elements(v_lista) e
     where (e->>'id') ~ '^[0-9]{1,9}$'
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
    -- Una fecha queda cerrada cuando todos sus partidos tienen resultado, o
    -- cuando ya pasaron dos semanas (un partido suspendido no la deja abierta).
    update public.liga_jornadas lj
       set revisada_en = now(),
           cerrada = exists (select 1 from public.liga_partidos lp where lp.equipo_id = p_equipo and lp.jornada_id = j.jornada_id)
                 and not exists (select 1 from public.liga_partidos lp
                                  where lp.equipo_id = p_equipo and lp.jornada_id = j.jornada_id
                                    and lp.goles_local is null and lp.dia >= v_hoy - 14)
     where lj.equipo_id = p_equipo and lj.jornada_id = j.jornada_id;
  end loop;

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

-- Lo que ve la app: los planteles conectados y los partidos de la división
-- del Jara, en orden.
create or replace function public.liga_fechas()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'conectados', coalesce((
      select jsonb_agg(jsonb_build_object('equipo_id', t.equipo_id, 'equipo', e.nombre, 'revisada_en', t.revisada_en,
                                          'puedo_actualizar', public.puedo_anotar(t.equipo_id))
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

revoke execute on function public.liga_desde_deporstar(text) from public, anon;
revoke execute on function public.liga_refrescar(uuid, boolean) from public, anon;
revoke execute on function public.liga_fechas() from public, anon;
grant execute on function public.liga_refrescar(uuid, boolean) to authenticated;
grant execute on function public.liga_fechas() to authenticated;
