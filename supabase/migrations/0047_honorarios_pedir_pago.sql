-- Jara App · 0047 · Fondo: pedir el pago de los honorarios del entrenador (Compras 3)
--
-- Hasta ahora las tres cuotas de honorarios (oct, nov y dic) estaban creadas,
-- pero nada avisaba a Hacienda cuando había que pagar una. Desde ahora:
--
--   1. El equipo del fondo sube la boleta de honorarios del mes, anota su N° y
--      su fecha, y aprieta "Pedir el pago a Hacienda".
--   2. Hacienda lo ve en Inicio ("Te toca pagar") y en Fondo > Honorarios.
--      Transfiere el líquido al entrenador y sube el comprobante: la cuota
--      queda pagada por transferencia del club.
--   3. La retención la paga el club en el F29 del mes siguiente. Ese respaldo
--      se sigue marcando como antes, en la lista de la cuota.
--
-- El monto de la cuota sigue siendo el bruto ($212.500): es lo que se rinde.
-- El líquido y la retención los calcula la app, solo para mostrarlos.
--
-- Quién: pedir y anular el pedido, quien puede cambiar el fondo (equipo del
-- fondo o Hacienda). Marcar como pagada, solo Hacienda de verdad (ninguna
-- cuenta de prueba). Un socio común no ve nada de esto.
--
-- Se puede correr una sola vez. Mueve plata: la revisan el administrador de
-- la app y Hacienda antes de aplicarla.

alter table public.fondo_gastos
  add column pago_pedido_en  timestamptz,
  add column pago_pedido_por uuid references public.personas(id) on delete set null;

-- Solo una cuota de honorarios de este club, sin rendir.
create or replace function public.fondo_honorario_buscar(p_gasto uuid)
returns public.fondo_gastos language plpgsql stable security definer set search_path = public as $$
declare
  g public.fondo_gastos := public.fondo_gasto_buscar(p_gasto);
begin
  if g.item <> 'personal' then raise exception 'Eso no es una cuota de honorarios'; end if;
  if g.rendicion is not null then raise exception 'Esa cuota ya está en una rendición presentada: no se puede cambiar'; end if;
  return g;
end;
$$;

-- 1. Pedir el pago (equipo del fondo). Deja anotados el N° y la fecha de la boleta.
create or replace function public.fondo_honorario_pedir(p_gasto uuid, p_documento text, p_fecha date)
returns void language plpgsql security definer set search_path = public as $$
declare
  g public.fondo_gastos := public.fondo_honorario_buscar(p_gasto);
begin
  if g.pago is not null then raise exception 'Esa cuota ya está pagada'; end if;
  if g.pago_pedido_en is not null then raise exception 'El pago de esa cuota ya está pedido'; end if;
  if length(trim(coalesce(p_documento, ''))) = 0 then raise exception 'Falta el N° de la boleta de honorarios'; end if;
  if length(p_documento) > 40 then raise exception 'El N° de boleta es demasiado largo'; end if;
  if p_fecha is null then raise exception 'Falta la fecha de la boleta'; end if;
  if p_fecha < date '2026-10-01' then
    raise exception 'La boleta es anterior al 1 de octubre: así no se puede rendir (art. 5)';
  end if;
  if p_fecha > current_date then raise exception 'La fecha de la boleta no puede ser futura'; end if;
  if not exists (select 1 from public.fondo_respaldos where gasto_id = g.id and tipo = 'boleta' and ruta is not null) then
    raise exception 'Primero sube la boleta de honorarios, para que Hacienda la vea antes de pagar';
  end if;
  update public.fondo_gastos
     set documento = trim(p_documento), fecha = p_fecha,
         pago_pedido_en = now(), pago_pedido_por = public.mi_persona_id(), actualizado_en = now()
   where id = g.id;
end;
$$;

-- Anular el pedido (si se pidió por error o con otra boleta). Solo antes de pagar.
create or replace function public.fondo_honorario_anular(p_gasto uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  g public.fondo_gastos := public.fondo_honorario_buscar(p_gasto);
begin
  if g.pago is not null then raise exception 'Esa cuota ya está pagada: no se anula el pedido'; end if;
  if g.pago_pedido_en is null then raise exception 'El pago de esa cuota no está pedido'; end if;
  update public.fondo_gastos set pago_pedido_en = null, pago_pedido_por = null, actualizado_en = now() where id = g.id;
end;
$$;

-- 2. Pagada (solo Hacienda de verdad): con el comprobante de la transferencia.
create or replace function public.fondo_honorario_pagado(p_gasto uuid, p_ruta text, p_nombre text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  g public.fondo_gastos := public.fondo_honorario_buscar(p_gasto);
begin
  perform public.prueba_no_puede('marcar pagos');
  if not public.puedo_aprobar_compras() then raise exception 'Solo Hacienda marca la cuota como pagada'; end if;
  if g.pago is not null then raise exception 'Esa cuota ya está pagada'; end if;
  if g.pago_pedido_en is null then raise exception 'Todavía nadie pidió el pago de esa cuota'; end if;
  if p_ruta is null or not exists (select 1 from storage.objects where bucket_id = 'fondo' and name = p_ruta) then
    raise exception 'Falta el comprobante de la transferencia';
  end if;
  update public.fondo_gastos set pago = 'transferencia', actualizado_en = now() where id = g.id;
  insert into public.fondo_respaldos (gasto_id, tipo, ruta, nombre, marcado_por)
  values (g.id, 'comprobante', p_ruta, coalesce(p_nombre, 'comprobante'), public.mi_persona_id())
  on conflict (gasto_id, tipo) do update
     set ruta = excluded.ruta, nombre = excluded.nombre, marcado_por = excluded.marcado_por, marcado_en = now();
end;
$$;

-- Los pedidos de pago de cada cuota, para la pestaña Honorarios (quien ve el fondo).
create or replace function public.fondo_honorarios_pedidos()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.fondo_exigir_ver();
  return coalesce((select jsonb_agg(jsonb_build_object(
            'id', g.id, 'pedido_en', g.pago_pedido_en, 'pedido_por', p.nombre) order by g.mes)
          from public.fondo_gastos g
          left join public.personas p on p.id = g.pago_pedido_por
         where g.club_id = public.mi_club_id() and g.item = 'personal' and not g.eliminado
           and g.pago_pedido_en is not null), '[]'::jsonb);
end;
$$;

-- Para Inicio: las cuotas pedidas que Hacienda todavía no paga. A cualquier
-- otra cuenta le devuelve una lista vacía, sin error.
create or replace function public.honorarios_por_pagar()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if public.mi_persona_id() is null or not public.puedo_aprobar_compras() then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
            'id', g.id, 'que', g.que, 'monto', g.monto, 'mes', g.mes, 'pedido_en', g.pago_pedido_en) order by g.mes)
          from public.fondo_gastos g
         where g.club_id = public.mi_club_id() and g.item = 'personal' and not g.eliminado
           and g.pago is null and g.pago_pedido_en is not null and g.rendicion is null), '[]'::jsonb);
end;
$$;

-- Permisos de las funciones
revoke execute on function public.fondo_honorario_buscar(uuid) from public, anon, authenticated;
revoke execute on function public.fondo_honorario_pedir(uuid, text, date) from public, anon;
revoke execute on function public.fondo_honorario_anular(uuid) from public, anon;
revoke execute on function public.fondo_honorario_pagado(uuid, text, text) from public, anon;
revoke execute on function public.fondo_honorarios_pedidos() from public, anon;
revoke execute on function public.honorarios_por_pagar() from public, anon;
grant execute on function public.fondo_honorario_pedir(uuid, text, date) to authenticated;
grant execute on function public.fondo_honorario_anular(uuid) to authenticated;
grant execute on function public.fondo_honorario_pagado(uuid, text, text) to authenticated;
grant execute on function public.fondo_honorarios_pedidos() to authenticated;
grant execute on function public.honorarios_por_pagar() to authenticated;
