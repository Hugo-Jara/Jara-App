-- Jara App · 0014 · Hora de inicio del partido
--
-- Hasta ahora el partido tenía solo la hora de citación (a la que hay que
-- llegar). Se suma la hora en que parte el partido, opcional.
--
-- Cambia partido_guardar: agrega un parámetro al final, con valor por omisión,
-- así que la app anterior sigue funcionando mientras se sube la nueva.

alter table public.partidos add column hora_inicio time;

-- Igual que antes, más la hora de inicio.
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

-- Se reemplaza la función anterior (otra firma) por la que recibe la hora de inicio.
drop function public.partido_guardar(uuid, uuid, text, date, time, text, text, text);

create or replace function public.partido_guardar(
  p_id uuid, p_equipo uuid, p_rival text, p_fecha date,
  p_citacion time default null, p_cancha text default null,
  p_torneo text default null, p_tercer_tiempo text default null, p_hora_inicio time default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if not exists (select 1 from public.equipos where id = p_equipo and club_id = public.mi_club_id())
     or not public.soy_encargado(p_equipo) then
    raise exception 'Solo el encargado del plantel puede programar sus partidos';
  end if;
  if coalesce(length(trim(p_rival)), 0) = 0 then raise exception 'Falta el rival'; end if;
  if p_fecha is null then raise exception 'Falta la fecha'; end if;

  if p_id is null then
    insert into public.partidos (club_id, equipo_id, rival, torneo, fecha, citacion, hora_inicio, cancha, tercer_tiempo, creado_por)
    values (public.mi_club_id(), p_equipo, trim(p_rival), nullif(trim(p_torneo), ''), p_fecha, p_citacion, p_hora_inicio,
            nullif(trim(p_cancha), ''), nullif(trim(p_tercer_tiempo), ''), public.mi_persona_id())
    returning id into v_id;
  else
    -- El plantel de un partido no se cambia: las respuestas son de ese plantel.
    update public.partidos
       set rival = trim(p_rival), torneo = nullif(trim(p_torneo), ''), fecha = p_fecha, citacion = p_citacion, hora_inicio = p_hora_inicio,
           cancha = nullif(trim(p_cancha), ''), tercer_tiempo = nullif(trim(p_tercer_tiempo), '')
     where id = p_id and equipo_id = p_equipo and club_id = public.mi_club_id()
    returning id into v_id;
    if v_id is null then raise exception 'Ese partido no existe'; end if;
  end if;
  return v_id;
end;
$$;

revoke execute on function public.partido_guardar(uuid, uuid, text, date, time, text, text, text, time) from public, anon;
grant execute on function public.partido_guardar(uuid, uuid, text, date, time, text, text, text, time) to authenticated;
