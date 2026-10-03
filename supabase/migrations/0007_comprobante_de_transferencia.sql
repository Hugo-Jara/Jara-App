-- Jara App · 0007 · Comprobante de transferencia en los pedidos de compra
--
-- Cuando Hacienda deposita la plata de una compra puede adjuntar el
-- comprobante de la transferencia. Así cada compra queda con su cadena
-- completa de respaldo: cotización → comprobante del depósito → boleta.
--
-- El comprobante es opcional (la plata también se puede entregar en efectivo)
-- y se puede agregar o cambiar después.
--
-- Quién lo ve: todos los que tienen el link ven QUE hay comprobante; el
-- archivo mismo solo se abre desde el link de Hacienda, porque trae datos
-- bancarios de quien recibió la plata.

alter table public.pedido_items
  add column comprobante_ruta   text,
  add column comprobante_nombre text;

-- Devuelve el pedido completo. Sirve con cualquiera de los dos códigos.
create or replace function public.pedido_ver(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v public.pedidos;
  v_hacienda boolean;
begin
  select * into v from public.pedidos where token = p_token or token_hacienda = p_token;
  if v.id is null then
    raise exception 'Este link no es válido';
  end if;
  v_hacienda := (v.token_hacienda = p_token);
  return jsonb_build_object(
    'nombre', v.nombre,
    'abierto', v.abierto,
    'es_hacienda', v_hacienda,
    'carpeta', v.carpeta,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', i.id, 'quien', i.quien, 'que', i.que, 'monto', i.monto,
               'cotizacion_ruta', i.cotizacion_ruta, 'cotizacion_nombre', i.cotizacion_nombre,
               'referencia', i.referencia,
               'referencia_ruta', i.referencia_ruta, 'referencia_nombre', i.referencia_nombre,
               'estado', i.estado, 'comentario', i.comentario,
               'boleta_ruta', i.boleta_ruta, 'boleta_nombre', i.boleta_nombre,
               'con_comprobante', i.comprobante_ruta is not null,
               -- El archivo del comprobante solo viaja al link de Hacienda.
               'comprobante_ruta', case when v_hacienda then i.comprobante_ruta end,
               'comprobante_nombre', case when v_hacienda then i.comprobante_nombre end,
               'creado_en', i.creado_en) order by i.creado_en)
        from public.pedido_items i where i.pedido_id = v.id), '[]'::jsonb));
end;
$$;

-- Hacienda adjunta el comprobante de la transferencia.
--   · En una compra aprobada: además la deja como "plata entregada".
--   · En una compra con la plata ya entregada: lo agrega o lo reemplaza.
create or replace function public.pedido_comprobante(p_token text, p_item uuid, p_ruta text, p_nombre text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.pedidos;
  v_item public.pedido_items;
  v_nuevo text;
begin
  select * into v from public.pedidos where token_hacienda = p_token;
  if v.id is null then raise exception 'Solo Hacienda puede subir el comprobante'; end if;
  select * into v_item from public.pedido_items where id = p_item and pedido_id = v.id;
  if v_item.id is null then raise exception 'Esa compra no está en este pedido'; end if;
  if v_item.estado not in ('aprobado', 'entregado', 'respaldado') then
    raise exception 'El comprobante se sube cuando la compra está aprobada';
  end if;
  if p_ruta is null or p_ruta not like v.carpeta || '/%' then
    raise exception 'Falta el archivo del comprobante';
  end if;

  v_nuevo := case when v_item.estado = 'aprobado' then 'entregado' else v_item.estado end;
  update public.pedido_items
     set estado = v_nuevo,
         comprobante_ruta = p_ruta, comprobante_nombre = coalesce(p_nombre, 'comprobante'),
         actualizado_en = now()
   where id = p_item;
  insert into public.pedido_item_eventos (item_id, de_estado, a_estado, por, comentario)
  values (p_item, v_item.estado, v_nuevo, 'hacienda',
          case when v_item.comprobante_ruta is null
               then 'Comprobante de transferencia adjunto'
               else 'Comprobante de transferencia reemplazado' end);
end;
$$;

revoke execute on function public.pedido_comprobante(text, uuid, text, text) from public;
grant execute on function public.pedido_comprobante(text, uuid, text, text) to anon, authenticated;
