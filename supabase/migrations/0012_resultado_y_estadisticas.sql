-- Jara App · 0012 · Resultado de los partidos y estadísticas
--
-- Hasta ahora un partido desaparecía de la app al terminar su día y no había
-- dónde anotar cuánto salió. Esta migración agrega:
--   · el marcador de cada partido,
--   · por jugador y partido: goles, asistencias, tarjetas amarillas y rojas
--     (para armar las tablas de estadística del club),
--   · la lista de partidos ya jugados,
--   · un permiso personal para quien el club designe como encargado de subir
--     resultados y estadísticas (además del encargado del plantel y los administradores).
--
-- No cambia ninguna función de permisos existente ni toca las respuestas.

-- Permiso personal, como el de cobrar entrenamientos: lo da un administrador.
alter table public.personas add column anota_partidos boolean not null default false;

alter table public.partidos
  add column goles_favor  smallint check (goles_favor  between 0 and 99),
  add column goles_contra smallint check (goles_contra between 0 and 99),
  -- O están los dos o no hay ninguno.
  add constraint partidos_marcador_completo
    check ((goles_favor is null) = (goles_contra is null));

-- Las cifras de cada jugador en un partido. Los goles y las asistencias pueden
-- sumar menos que el marcador (un autogol del rival, alguien fuera de la nómina).
create table public.partido_estadisticas (
  partido_id   uuid not null references public.partidos(id) on delete cascade,
  persona_id   uuid not null references public.personas(id) on delete cascade,
  goles        smallint not null default 0 check (goles between 0 and 99),
  asistencias  smallint not null default 0 check (asistencias between 0 and 99),
  amarillas    smallint not null default 0 check (amarillas between 0 and 2),
  rojas        smallint not null default 0 check (rojas between 0 and 1),
  primary key (partido_id, persona_id),
  check (goles + asistencias + amarillas + rojas > 0)
);
create index partido_estadisticas_persona_idx on public.partido_estadisticas (persona_id);

alter table public.partido_estadisticas enable row level security;
revoke all on public.partido_estadisticas from anon, authenticated;

-- Quién anota resultados y goles de un plantel: su encargado, los
-- administradores y quienes tienen el permiso personal.
create or replace function public.puedo_anotar(p_equipo uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.soy_encargado(p_equipo)
      or exists (select 1 from public.personas p
                  where p.id = public.mi_persona_id() and p.anota_partidos);
$$;

-- Igual que antes, más el marcador, las estadísticas y si puedo anotar.
create or replace function public.partido_json(p public.partidos)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', p.id, 'equipo_id', p.equipo_id,
    'equipo', (select nombre from public.equipos where id = p.equipo_id),
    'rival', p.rival, 'torneo', p.torneo, 'fecha', p.fecha,
    'citacion', to_char(p.citacion, 'HH24:MI'), 'cancha', p.cancha, 'tercer_tiempo', p.tercer_tiempo,
    'goles_favor', p.goles_favor, 'goles_contra', p.goles_contra,
    'estadisticas', coalesce((
      select jsonb_agg(jsonb_build_object('persona_id', g.persona_id, 'nombre', pr.nombre, 'goles', g.goles,
                                          'asistencias', g.asistencias, 'amarillas', g.amarillas, 'rojas', g.rojas)
                       order by g.goles desc, g.asistencias desc, pr.nombre)
        from public.partido_estadisticas g join public.personas pr on pr.id = g.persona_id
       where g.partido_id = p.id), '[]'::jsonb),
    'es_mio', exists (select 1 from public.persona_equipos pe
                       where pe.persona_id = public.mi_persona_id() and pe.equipo_id = p.equipo_id),
    'puedo_editar', public.soy_encargado(p.equipo_id),
    'puedo_anotar', public.puedo_anotar(p.equipo_id),
    'plantel', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'nombre', s.nombre) order by s.nombre)
        from (select distinct pr.id, pr.nombre
                from public.persona_equipos pe join public.personas pr on pr.id = pe.persona_id
               where pe.equipo_id = p.equipo_id and pr.estado = 'activo') s), '[]'::jsonb),
    'respuestas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'persona_id', r.persona_id, 'nombre', pr.nombre, 'estado', r.estado,
               'nota', r.nota, 'tercer_tiempo', r.tercer_tiempo) order by r.actualizado_en)
        from public.partido_respuestas r join public.personas pr on pr.id = r.persona_id
       where r.partido_id = p.id), '[]'::jsonb));
$$;

-- Los últimos partidos jugados del club, del más reciente al más antiguo.
create or replace function public.partidos_jugados()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if public.mi_persona_id() is null then raise exception 'Tu cuenta no está en la nómina del club'; end if;
  return coalesce((
    select jsonb_agg(x order by x->>'fecha' desc, x->>'citacion' desc)
      from (select public.partido_json(p) as x from public.partidos p
             where p.club_id = public.mi_club_id() and p.fecha < public.hoy()
             order by p.fecha desc, p.citacion desc nulls last limit 30) s), '[]'::jsonb);
end;
$$;

-- Anotar o corregir el resultado y las cifras de cada jugador.
--   p_jugadores: [{"persona_id": "...", "goles": 2, "asistencias": 1, "amarillas": 0, "rojas": 0}, ...]
--   (puede venir vacío; lo que falte en cada jugador cuenta como 0)
-- Con p_favor y p_contra nulos borra el resultado y todas las cifras.
-- Se puede desde el día del partido en adelante.
create or replace function public.partido_resultado(
  p_partido uuid, p_favor int, p_contra int, p_jugadores jsonb default '[]')
returns void language plpgsql security definer set search_path = public as $$
declare
  p public.partidos;
  g jsonb;
  v_persona uuid;
  v_g int; v_a int; v_am int; v_r int;
  v_goles int := 0;
  v_asist int := 0;
  v_vistos uuid[] := '{}';
begin
  select * into p from public.partidos where id = p_partido and club_id = public.mi_club_id();
  if p.id is null then raise exception 'Ese partido no existe'; end if;
  if not public.puedo_anotar(p.equipo_id) then
    raise exception 'Solo quien anota los partidos puede poner el resultado';
  end if;
  if p.fecha > public.hoy() then raise exception 'Ese partido todavía no se juega'; end if;
  if (p_favor is null) <> (p_contra is null) then raise exception 'Faltan los goles de uno de los equipos'; end if;
  if p_favor < 0 or p_favor > 99 or p_contra < 0 or p_contra > 99 then raise exception 'Goles no válidos'; end if;

  delete from public.partido_estadisticas where partido_id = p.id;
  if p_favor is null then
    update public.partidos set goles_favor = null, goles_contra = null where id = p.id;
    return;
  end if;

  for g in select * from jsonb_array_elements(coalesce(p_jugadores, '[]'::jsonb)) loop
    v_persona := (g->>'persona_id')::uuid;
    v_g := coalesce((g->>'goles')::int, 0);
    v_a := coalesce((g->>'asistencias')::int, 0);
    v_am := coalesce((g->>'amarillas')::int, 0);
    v_r := coalesce((g->>'rojas')::int, 0);
    if v_g not between 0 and 99 or v_a not between 0 and 99 then raise exception 'Goles o asistencias no válidos'; end if;
    if v_am not between 0 and 2 then raise exception 'Una persona no puede tener más de 2 amarillas en un partido'; end if;
    if v_r not between 0 and 1 then raise exception 'Una persona no puede tener más de 1 roja en un partido'; end if;
    if v_g + v_a + v_am + v_r = 0 then continue; end if;   -- fila vacía: se ignora
    if v_persona = any (v_vistos) then raise exception 'Un jugador está repetido'; end if;
    if not exists (select 1 from public.personas where id = v_persona and club_id = p.club_id) then
      raise exception 'Ese jugador no está en la nómina del club';
    end if;
    v_vistos := v_vistos || v_persona;
    v_goles := v_goles + v_g;
    v_asist := v_asist + v_a;
    insert into public.partido_estadisticas (partido_id, persona_id, goles, asistencias, amarillas, rojas)
    values (p.id, v_persona, v_g, v_a, v_am, v_r);
  end loop;
  if v_goles > p_favor then raise exception 'Los goles de los jugadores suman más que el marcador'; end if;
  if v_asist > p_favor then raise exception 'Las asistencias suman más que los goles del equipo'; end if;

  update public.partidos set goles_favor = p_favor, goles_contra = p_contra where id = p.id;
end;
$$;

-- Las tablas de estadística del club (o de un plantel): goles, asistencias,
-- amarillas y rojas por jugador. p_anio vacío = todos los años. Todo el club
-- las ve; la app las ordena según la columna que se mire.
create or replace function public.estadisticas(p_equipo uuid default null, p_anio int default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if public.mi_persona_id() is null then raise exception 'Tu cuenta no está en la nómina del club'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('persona_id', t.persona_id, 'nombre', t.nombre, 'goles', t.goles,
                                        'asistencias', t.asistencias, 'amarillas', t.amarillas, 'rojas', t.rojas)
                     order by t.goles desc, t.asistencias desc, t.nombre)
      from (select g.persona_id, pr.nombre, sum(g.goles)::int as goles, sum(g.asistencias)::int as asistencias,
                   sum(g.amarillas)::int as amarillas, sum(g.rojas)::int as rojas
              from public.partido_estadisticas g
              join public.partidos p on p.id = g.partido_id
              join public.personas pr on pr.id = g.persona_id
             where p.club_id = public.mi_club_id()
               and (p_equipo is null or p.equipo_id = p_equipo)
               and (p_anio is null or extract(year from p.fecha) = p_anio)
             group by g.persona_id, pr.nombre) t), '[]'::jsonb);
end;
$$;

revoke execute on function public.puedo_anotar(uuid) from public, anon;
revoke execute on function public.partidos_jugados() from public, anon;
revoke execute on function public.partido_resultado(uuid, int, int, jsonb) from public, anon;
revoke execute on function public.estadisticas(uuid, int) from public, anon;
grant execute on function public.puedo_anotar(uuid) to authenticated;
grant execute on function public.partidos_jugados() to authenticated;
grant execute on function public.partido_resultado(uuid, int, int, jsonb) to authenticated;
grant execute on function public.estadisticas(uuid, int) to authenticated;
