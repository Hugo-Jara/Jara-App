-- Jara App · 0025 · Partidos jugados (PJ) en las estadísticas
--
-- Pedido del administrador (4/11): todo el que juega un partido por el Jara
-- tiene que aparecer en la tabla de estadísticas, aunque no haya hecho goles,
-- con su número de partidos jugados (PJ). Y poder filtrar la tabla por
-- categoría (varios planteles juntos, por ejemplo "Senior").
--
-- Qué agrega:
--   · partido_jugadores: quiénes jugaron cada partido. La marca quien anota el
--     resultado; parte con los que dijeron "voy".
--   · partido_resultado recibe la lista (p_jugaron). Si no viene (la app
--     anterior), se toman los que dijeron "voy". Quien tiene cifras en el
--     partido (goles, asistencias, tarjetas) siempre cuenta como que jugó.
--   · partido_json trae 'jugaron' (ids).
--   · estadisticas devuelve 'pj' y acepta varios planteles a la vez (p_equipos).
--   · Los partidos que ya tienen resultado se rellenan con "voy" + quienes
--     tienen cifras.
--
-- No cambia permisos: anota quien ya anotaba (puedo_anotar) y todo el club ve
-- la tabla. Revisión: la revisa el administrador de la app antes de correrla.

create table public.partido_jugadores (
  partido_id  uuid not null references public.partidos(id) on delete cascade,
  persona_id  uuid not null references public.personas(id) on delete cascade,
  primary key (partido_id, persona_id)
);
create index partido_jugadores_persona_idx on public.partido_jugadores (persona_id);

alter table public.partido_jugadores enable row level security;
revoke all on public.partido_jugadores from anon, authenticated;

-- Relleno: los partidos con resultado ya anotado.
insert into public.partido_jugadores (partido_id, persona_id)
select r.partido_id, r.persona_id
  from public.partido_respuestas r join public.partidos p on p.id = r.partido_id
 where r.estado = 'voy' and p.goles_favor is not null
union
select g.partido_id, g.persona_id from public.partido_estadisticas g
on conflict do nothing;

-- Igual que en 0014, más 'jugaron'.
create or replace function public.partido_json(p public.partidos)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', p.id, 'equipo_id', p.equipo_id,
    'equipo', (select nombre from public.equipos where id = p.equipo_id),
    'rival', p.rival, 'torneo', p.torneo, 'fecha', p.fecha,
    'citacion', to_char(p.citacion, 'HH24:MI'), 'hora_inicio', to_char(p.hora_inicio, 'HH24:MI'), 'cancha', p.cancha, 'tercer_tiempo', p.tercer_tiempo,
    'goles_favor', p.goles_favor, 'goles_contra', p.goles_contra,
    'estadisticas', coalesce((
      select jsonb_agg(jsonb_build_object('persona_id', g.persona_id, 'nombre', pr.nombre, 'goles', g.goles,
                                          'asistencias', g.asistencias, 'amarillas', g.amarillas, 'rojas', g.rojas)
                       order by g.goles desc, g.asistencias desc, pr.nombre)
        from public.partido_estadisticas g join public.personas pr on pr.id = g.persona_id
       where g.partido_id = p.id), '[]'::jsonb),
    'jugaron', coalesce((
      select jsonb_agg(j.persona_id) from public.partido_jugadores j where j.partido_id = p.id), '[]'::jsonb),
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

-- Se reemplaza la de 0012 (otra firma) por la que recibe quiénes jugaron.
drop function public.partido_resultado(uuid, int, int, jsonb);

-- Anotar o corregir el resultado, las cifras de cada jugador y quiénes jugaron.
--   p_jugadores: [{"persona_id": "...", "goles": 2, "asistencias": 1, "amarillas": 0, "rojas": 0}, ...]
--   p_jugaron:   ["persona_id", ...]; nulo = los que dijeron "voy".
-- Con p_favor y p_contra nulos borra el resultado, las cifras y quiénes jugaron.
create or replace function public.partido_resultado(
  p_partido uuid, p_favor int, p_contra int, p_jugadores jsonb default '[]', p_jugaron jsonb default null)
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
  if p_jugaron is not null and jsonb_typeof(p_jugaron) <> 'array' then raise exception 'La lista de quiénes jugaron no es válida'; end if;

  delete from public.partido_estadisticas where partido_id = p.id;
  delete from public.partido_jugadores where partido_id = p.id;
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

  -- Quiénes jugaron: la lista que viene (o los "voy") más quienes tienen cifras.
  if p_jugaron is null then
    insert into public.partido_jugadores (partido_id, persona_id)
    select p.id, r.persona_id from public.partido_respuestas r where r.partido_id = p.id and r.estado = 'voy'
    on conflict do nothing;
  else
    for g in select * from jsonb_array_elements(p_jugaron) loop
      v_persona := (g #>> '{}')::uuid;
      if not exists (select 1 from public.personas where id = v_persona and club_id = p.club_id) then
        raise exception 'Ese jugador no está en la nómina del club';
      end if;
      insert into public.partido_jugadores (partido_id, persona_id) values (p.id, v_persona) on conflict do nothing;
    end loop;
  end if;
  insert into public.partido_jugadores (partido_id, persona_id)
  select p.id, x from unnest(v_vistos) x
  on conflict do nothing;

  update public.partidos set goles_favor = p_favor, goles_contra = p_contra where id = p.id;
end;
$$;

-- Se reemplaza la de 0012 por una que suma PJ y filtra por varios planteles.
drop function public.estadisticas(uuid, int);

-- La tabla del club (o de uno o varios planteles): PJ, goles, asistencias,
-- amarillas y rojas por jugador. Aparece todo el que jugó al menos un partido
-- con resultado, aunque no tenga cifras. p_anio vacío = todos los años.
create or replace function public.estadisticas(
  p_equipo uuid default null, p_anio int default null, p_equipos uuid[] default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if public.mi_persona_id() is null then raise exception 'Tu cuenta no está en la nómina del club'; end if;
  return coalesce((
    with ps as (
      select p.id from public.partidos p
       where p.club_id = public.mi_club_id()
         and p.goles_favor is not null
         and (p_equipo is null or p.equipo_id = p_equipo)
         and (p_equipos is null or p.equipo_id = any (p_equipos))
         and (p_anio is null or extract(year from p.fecha) = p_anio)
    ), filas as (
      select j.partido_id, j.persona_id, 0 as goles, 0 as asistencias, 0 as amarillas, 0 as rojas
        from public.partido_jugadores j where j.partido_id in (select id from ps)
      union all
      select g.partido_id, g.persona_id, g.goles, g.asistencias, g.amarillas, g.rojas
        from public.partido_estadisticas g where g.partido_id in (select id from ps)
    )
    select jsonb_agg(jsonb_build_object('persona_id', t.persona_id, 'nombre', t.nombre, 'pj', t.pj, 'goles', t.goles,
                                        'asistencias', t.asistencias, 'amarillas', t.amarillas, 'rojas', t.rojas)
                     order by t.goles desc, t.asistencias desc, t.nombre)
      from (select f.persona_id, pr.nombre, count(distinct f.partido_id)::int as pj,
                   sum(f.goles)::int as goles, sum(f.asistencias)::int as asistencias,
                   sum(f.amarillas)::int as amarillas, sum(f.rojas)::int as rojas
              from filas f join public.personas pr on pr.id = f.persona_id
             group by f.persona_id, pr.nombre) t), '[]'::jsonb);
end;
$$;

revoke execute on function public.partido_resultado(uuid, int, int, jsonb, jsonb) from public, anon;
revoke execute on function public.estadisticas(uuid, int, uuid[]) from public, anon;
grant execute on function public.partido_resultado(uuid, int, int, jsonb, jsonb) to authenticated;
grant execute on function public.estadisticas(uuid, int, uuid[]) to authenticated;
