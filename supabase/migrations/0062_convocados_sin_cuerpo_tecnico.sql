-- Jara App · 0062 · Convocados: sin cuerpo técnico y un solo arquero
--
-- En "Partidos de la semana" el número de los que van tiene que ser el de
-- jugadores reales: el DT, el ayudante y quien está en el plantel sin jugar
-- no cuentan aunque pongan "voy", y si van dos arqueros cuentan como uno.
-- Siguen apareciendo en la lista; solo cambia el conteo (lo hace la app).
--
--   - personas.no_juega: está en el plantel pero no juega (por ejemplo, el
--     encargado de los entrenamientos). Lo prende el administrador por SQL.
--     No da ningún permiso.
--   - partido_json: cada respuesta trae dos datos más:
--       'tecnico': cuerpo técnico (personas.cuerpo_tecnico, o DT/Ayudante en
--                  su perfil) o no_juega.
--       'arquero': tiene "Arquero" como posición en su perfil.
--     El resto queda igual que en 0025.
--
-- Revisión: no toca plata ni permisos. La revisa el administrador de la app.

alter table public.personas add column if not exists no_juega boolean not null default false;

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
               'nota', r.nota, 'tercer_tiempo', r.tercer_tiempo,
               'tecnico', (pr.cuerpo_tecnico or pr.no_juega or coalesce(f.posicion in ('dt', 'ayudante'), false)),
               'arquero', coalesce(f.posicion = 'arquero', false)) order by r.actualizado_en)
        from public.partido_respuestas r join public.personas pr on pr.id = r.persona_id
        left join public.perfiles f on f.persona_id = r.persona_id
       where r.partido_id = p.id), '[]'::jsonb));
$$;
