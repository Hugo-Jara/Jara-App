-- Jara App · 0016 · La multa corre desde las 5:00 del día del entrenamiento
--
-- Hasta ahora, quien se bajaba el día del entrenamiento pagaba multa a
-- cualquier hora de ese día, incluso de madrugada. Y como se podía bajar hasta
-- las 23:59, alguien podía entrenar, bajarse en la noche y deber solo la multa
-- en vez de la sesión.
--
-- Desde ahora (hora de Chile):
--   - Hasta las 5:00 del día del entrenamiento uno se baja sin multa.
--   - Desde las 5:00, quien se baja (o baja a su invitado) queda con la multa.
--   - Desde la hora de inicio ya no se puede bajar uno mismo: el entrenamiento
--     empezó. Si alguien no fue, quien administra la lista lo saca.
--
-- Cambia solo entrenamiento_bajar; mismos parámetros, así que la app actual
-- sigue funcionando mientras se sube la nueva.

-- La fecha y hora de ahora en Chile, para comparar con la del entrenamiento.
create or replace function public.ahora_chile()
returns timestamp language sql stable set search_path = public as $$
  select (now() at time zone 'America/Santiago')::timestamp;
$$;

-- Bajar a alguien de la lista. Las reglas de quién puede son las mismas de 0013.
--   - Uno mismo (o a su invitado), desde la hora de inicio: no se puede.
--   - Uno mismo (o a su invitado), desde las 5:00 del día y hay multa:
--       si no había pagado, queda debiendo la multa;
--       si ya había pagado, queda con su pago y no debe nada más.
--   - En cualquier otro caso sale de la lista como antes, salvo que tenga un
--     pago anotado: entonces primero hay que quitar el pago.
create or replace function public.entrenamiento_bajar(p_inscrito uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  i public.entrenamiento_inscritos;
  e public.entrenamientos;
  v_yo uuid := public.mi_persona_id();
  v_propio boolean;
begin
  select * into i from public.entrenamiento_inscritos where id = p_inscrito;
  if i.id is null then raise exception 'Esa inscripción no existe'; end if;
  e := public.entrenamiento_abierto(i.entrenamiento_id);
  select * into i from public.entrenamiento_inscritos where id = p_inscrito for update;
  if i.estado <> 'inscrito' then
    return;
  end if;
  v_propio := coalesce(i.persona_id = v_yo, false) or coalesce(i.invitado_por = v_yo, false);
  if not (v_propio or public.puedo_administrar_entrenamientos()) then
    raise exception 'Solo puedes bajarte tú o bajar a tus invitados';
  end if;
  if v_propio and e.hora_inicio is not null and public.ahora_chile() >= e.fecha + e.hora_inicio then
    raise exception 'El entrenamiento ya empezó; si no pudiste ir, avísale a quien administra la lista';
  end if;
  if v_propio and e.multa > 0 and public.ahora_chile() >= e.fecha + time '05:00' then
    update public.entrenamiento_inscritos
       set estado = 'baja_tarde', monto = case when pagado then monto else e.multa end
     where id = i.id;
  elsif public.entrenamiento_tiene_pagos(i.id) then
    raise exception 'Esa persona tiene un pago anotado; para sacarla de la lista, primero quita el pago';
  else
    delete from public.entrenamiento_inscritos where id = i.id;
  end if;
end;
$$;

revoke execute on function public.ahora_chile() from public, anon, authenticated;
