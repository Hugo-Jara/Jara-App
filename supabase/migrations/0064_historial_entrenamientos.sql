-- Jara App · 0064 · Historial de entrenamientos
--
-- Pedido de quien lleva Entrenamiento: que quede registro de quiénes fueron a
-- cada entrenamiento. Las listas pasadas ya quedaban guardadas en la base
-- (no se pueden eliminar una vez que pasan, ver 0015), pero la app solo
-- mostraba la próxima. Esta migración agrega una sola función de lectura:
--
--   - entrenamientos_historial(): todos los entrenamientos que ya pasaron
--     (antes de hoy), del más nuevo al más viejo, cada uno con quiénes
--     fueron (gente del club e invitados) y quiénes se bajaron el mismo día.
--     Con eso la app arma el historial y cuántas veces fue cada jugador.
--
-- "Fue" = quedó en la lista como inscrito. Quien se bajó el mismo día no
-- cuenta como asistente (aparece aparte).
--
-- La ven solo los administradores y quien tiene el permiso
-- 'administra_entrenamientos' (los mismos que abren las listas).
-- No crea tablas, no cambia datos y no muestra montos ni pagos: la plata de
-- entrenamientos queda para un paso posterior.
--
-- Revisión: solo lectura. No cambia permisos existentes ni toca plata.

create or replace function public.entrenamientos_historial()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if public.mi_persona_id() is null then raise exception 'Tu cuenta no está en la nómina del club'; end if;
  if not public.puedo_administrar_entrenamientos() then
    raise exception 'Solo quienes administran los entrenamientos ven el historial';
  end if;
  return jsonb_build_object(
    'sesiones', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', e.id, 'fecha', e.fecha,
               'hora_inicio', to_char(e.hora_inicio, 'HH24:MI'), 'hora_fin', to_char(e.hora_fin, 'HH24:MI'),
               'lugar', e.lugar, 'cupo', e.cupo,
               'asistentes', coalesce((
                 select jsonb_agg(jsonb_build_object(
                          'persona_id', i.persona_id,
                          'nombre', coalesce(p.nombre, i.invitado_nombre),
                          'invitado', i.persona_id is null,
                          'invitado_por', (select nombre from public.personas where id = i.invitado_por))
                          order by coalesce(p.nombre, i.invitado_nombre))
                   from public.entrenamiento_inscritos i
                   left join public.personas p on p.id = i.persona_id
                  where i.entrenamiento_id = e.id and i.estado = 'inscrito'), '[]'::jsonb),
               'bajas_tarde', coalesce((
                 select jsonb_agg(jsonb_build_object(
                          'persona_id', i.persona_id,
                          'nombre', coalesce(p.nombre, i.invitado_nombre))
                          order by coalesce(p.nombre, i.invitado_nombre))
                   from public.entrenamiento_inscritos i
                   left join public.personas p on p.id = i.persona_id
                  where i.entrenamiento_id = e.id and i.estado = 'baja_tarde'), '[]'::jsonb))
             order by e.fecha desc, e.hora_inicio desc nulls last)
        from public.entrenamientos e
       where e.club_id = public.mi_club_id() and e.fecha < public.hoy()), '[]'::jsonb));
end;
$$;

revoke execute on function public.entrenamientos_historial() from public, anon;
grant execute on function public.entrenamientos_historial() to authenticated;
