-- Jara App · 0015 · Los pagos de entrenamiento no se pierden
--
-- Hasta ahora un pago marcado se podía borrar sin querer:
--   - quien pagaba y se bajaba el mismo día quedaba con la multa por pagar y
--     sin el registro de que había pagado;
--   - si se volvía a inscribir, quedaba debiendo la sesión completa otra vez;
--   - quien se bajaba antes del día desaparecía de la lista, con su pago;
--   - se podía eliminar la lista de un entrenamiento pasado, con todos sus
--     pagos y deudas;
--   - al desmarcar un pago no quedaba quién lo había marcado ni cuándo.
--
-- Cómo se cobra en el club: uno se inscribe, entrena y después (ese día o
-- los siguientes) quien cobra marca quién pagó. La multa es solo para quien se
-- baja el mismo día.
--
-- Desde ahora:
--   - Los pagos se marcan desde el día del entrenamiento, no antes.
--   - Un pago marcado no lo borra nadie más que quien cobra (desmarcándolo).
--     Bajarse o volver a inscribirse ya no lo toca. Si alguien ya pagó y se
--     baja ese mismo día, no paga multa encima.
--   - A quien tiene un pago anotado no se le saca de la lista: primero hay que
--     quitar el pago.
--   - Cada vez que se marca o desmarca un pago queda anotado en la bitácora
--     entrenamiento_pagos: qué, cuánto, quién y cuándo. Esa bitácora no se
--     borra ni se edita desde la app.
--   - No se puede eliminar ni editar la lista de un entrenamiento que ya pasó,
--     ni eliminar una lista que ya tiene pagos anotados.
--
-- Las funciones mantienen sus nombres y parámetros, así que la app actual
-- sigue funcionando mientras se sube la nueva.

-- Bitácora de pagos: una fila por cada vez que alguien marca o desmarca.
-- Mientras una inscripción tenga movimientos, no se puede borrar.
create table public.entrenamiento_pagos (
  id           bigint generated always as identity primary key,
  inscrito_id  uuid not null references public.entrenamiento_inscritos(id) on delete restrict,
  pagado       boolean not null,  -- true: marcó el pago; false: lo desmarcó
  monto        integer not null,
  por          uuid references public.personas(id) on delete set null,
  nota         text,
  creado_en    timestamptz not null default now()
);
create index entrenamiento_pagos_inscrito_idx on public.entrenamiento_pagos (inscrito_id);

alter table public.entrenamiento_pagos enable row level security;
revoke all on public.entrenamiento_pagos from anon, authenticated;

-- Los pagos que ya estaban marcados entran a la bitácora como punto de partida.
insert into public.entrenamiento_pagos (inscrito_id, pagado, monto, por, nota)
select id, true, monto, pago_marcado_por, 'Ya estaba marcado al crear la bitácora'
  from public.entrenamiento_inscritos
 where pagado;

-- ¿Esta inscripción tuvo algún movimiento de pago?
create or replace function public.entrenamiento_tiene_pagos(p_inscrito uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.entrenamiento_pagos where inscrito_id = p_inscrito);
$$;

-- Volver a inscribirse ya no borra un pago: si ya había pagado, sigue pagado
-- con el mismo monto.
create or replace function public.entrenamiento_inscribirme(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  e public.entrenamientos := public.entrenamiento_abierto(p_id);
  v_yo uuid := public.mi_persona_id();
begin
  if exists (select 1 from public.entrenamiento_inscritos
              where entrenamiento_id = e.id and persona_id = v_yo and estado = 'inscrito') then
    return;
  end if;
  if public.entrenamiento_cupos_libres(e) <= 0 then raise exception 'La lista está completa'; end if;
  insert into public.entrenamiento_inscritos (entrenamiento_id, persona_id, monto)
  values (e.id, v_yo, public.entrenamiento_precio(e, v_yo))
  on conflict (entrenamiento_id, persona_id) where persona_id is not null do update
     set estado = 'inscrito',
         monto = case when entrenamiento_inscritos.pagado then entrenamiento_inscritos.monto else excluded.monto end;
end;
$$;

-- Bajar a alguien de la lista. Las reglas de quién puede son las mismas de 0013.
--   - Se baja solo (o baja a su invitado) el mismo día y hay multa:
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
begin
  select * into i from public.entrenamiento_inscritos where id = p_inscrito;
  if i.id is null then raise exception 'Esa inscripción no existe'; end if;
  e := public.entrenamiento_abierto(i.entrenamiento_id);
  select * into i from public.entrenamiento_inscritos where id = p_inscrito for update;
  if i.estado <> 'inscrito' then
    return;
  end if;
  if not (coalesce(i.persona_id = v_yo, false) or coalesce(i.invitado_por = v_yo, false) or public.puedo_administrar_entrenamientos()) then
    raise exception 'Solo puedes bajarte tú o bajar a tus invitados';
  end if;
  if e.fecha = public.hoy() and e.multa > 0 and (coalesce(i.persona_id = v_yo, false) or coalesce(i.invitado_por = v_yo, false)) then
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

-- Marcar o desmarcar un pago, desde el día del entrenamiento en adelante.
-- Cada cambio queda en la bitácora. Apretar dos veces no anota dos veces.
create or replace function public.entrenamiento_pago(p_inscrito uuid, p_pagado boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  i public.entrenamiento_inscritos;
  v_fecha date;
  v_pagado boolean := coalesce(p_pagado, false);
begin
  if not public.puedo_cobrar() then
    raise exception 'Solo los tesoreros y quienes cobran el entrenamiento marcan los pagos';
  end if;
  select i2.* into i
    from public.entrenamiento_inscritos i2 join public.entrenamientos e on e.id = i2.entrenamiento_id
   where i2.id = p_inscrito and e.club_id = public.mi_club_id()
     for update of i2;
  if i.id is null then raise exception 'Esa inscripción no existe'; end if;
  select fecha into v_fecha from public.entrenamientos where id = i.entrenamiento_id;
  if v_fecha > public.hoy() then
    raise exception 'Los pagos se marcan desde el día del entrenamiento';
  end if;
  if i.pagado = v_pagado then
    return;
  end if;
  update public.entrenamiento_inscritos
     set pagado = v_pagado,
         pago_marcado_por = case when v_pagado then public.mi_persona_id() end
   where id = i.id;
  insert into public.entrenamiento_pagos (inscrito_id, pagado, monto, por)
  values (i.id, v_pagado, i.monto, public.mi_persona_id());
end;
$$;

-- Igual que en 0013, pero no se puede cambiar un entrenamiento que ya pasó.
create or replace function public.entrenamiento_guardar(
  p_id uuid, p_fecha date, p_hora_inicio time, p_hora_fin time, p_lugar text, p_cupo integer,
  p_precio_junior integer, p_precio_senior integer, p_precio_invitado integer, p_multa integer default 0)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if not public.puedo_administrar_entrenamientos() then
    raise exception 'Solo quienes administran los entrenamientos abren las listas';
  end if;
  if p_fecha is null then raise exception 'Falta la fecha'; end if;
  if p_cupo is null or p_cupo <= 0 then raise exception 'El cupo tiene que ser mayor que cero'; end if;

  if p_id is null then
    insert into public.entrenamientos
      (club_id, fecha, hora_inicio, hora_fin, lugar, cupo, precio_junior, precio_senior, precio_invitado, multa, creado_por)
    values (public.mi_club_id(), p_fecha, p_hora_inicio, p_hora_fin, nullif(trim(p_lugar), ''), p_cupo,
            coalesce(p_precio_junior, 0), coalesce(p_precio_senior, 0), coalesce(p_precio_invitado, 0),
            coalesce(p_multa, 0), public.mi_persona_id())
    returning id into v_id;
  else
    if exists (select 1 from public.entrenamientos
                where id = p_id and club_id = public.mi_club_id() and fecha < public.hoy()) then
      raise exception 'Ese entrenamiento ya pasó; su lista queda como está';
    end if;
    update public.entrenamientos
       set fecha = p_fecha, hora_inicio = p_hora_inicio, hora_fin = p_hora_fin,
           lugar = nullif(trim(p_lugar), ''), cupo = p_cupo,
           precio_junior = coalesce(p_precio_junior, 0), precio_senior = coalesce(p_precio_senior, 0),
           precio_invitado = coalesce(p_precio_invitado, 0), multa = coalesce(p_multa, 0)
     where id = p_id and club_id = public.mi_club_id()
    returning id into v_id;
    if v_id is null then raise exception 'Ese entrenamiento no existe'; end if;
  end if;
  return v_id;
end;
$$;

-- Eliminar una lista: solo si todavía no pasa y nadie tiene pagos anotados.
create or replace function public.entrenamiento_eliminar(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  e public.entrenamientos;
begin
  if not public.puedo_administrar_entrenamientos() then
    raise exception 'Solo quienes administran los entrenamientos eliminan una lista';
  end if;
  select * into e from public.entrenamientos where id = p_id and club_id = public.mi_club_id() for update;
  if e.id is null then return; end if;
  if e.fecha < public.hoy() then
    raise exception 'Ese entrenamiento ya pasó; su lista queda guardada con sus pagos y deudas';
  end if;
  if exists (select 1 from public.entrenamiento_pagos g
               join public.entrenamiento_inscritos i on i.id = g.inscrito_id
              where i.entrenamiento_id = e.id) then
    raise exception 'Esta lista ya tiene pagos anotados; no se puede eliminar';
  end if;
  delete from public.entrenamientos where id = e.id;
end;
$$;

revoke execute on function public.entrenamiento_tiene_pagos(uuid) from public, anon, authenticated;
