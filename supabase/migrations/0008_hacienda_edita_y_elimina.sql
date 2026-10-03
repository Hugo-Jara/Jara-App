-- Jara App · 0008 · Hacienda puede editar y eliminar compras de un pedido
--
-- Editar: corrige el nombre, la glosa o el monto de una compra, en cualquier
-- estado. El cambio queda anotado en el historial con el valor anterior.
--
-- Eliminar: la compra deja de verse y de sumar, pero no se borra de la base
-- ni se pierden sus archivos. Queda como un estado más ('eliminado'), así el
-- historial dice quién la sacó y desde qué estado, y se puede recuperar.

alter table public.pedido_items drop constraint pedido_items_estado_check;
alter table public.pedido_items add constraint pedido_items_estado_check
  check (estado in ('pendiente', 'aprobado', 'devuelto', 'entregado', 'respaldado', 'eliminado'));

-- Devuelve el pedido completo, sin las compras eliminadas.
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
        from public.pedido_items i
       where i.pedido_id = v.id and i.estado <> 'eliminado'), '[]'::jsonb));
end;
$$;

-- Hacienda corrige el nombre, la glosa o el monto de una compra.
create or replace function public.pedido_editar(
  p_token text, p_item uuid, p_quien text, p_que text, p_monto integer)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.pedidos;
  v_item public.pedido_items;
  v_cambios text[] := '{}';
begin
  select * into v from public.pedidos where token_hacienda = p_token;
  if v.id is null then raise exception 'Solo Hacienda puede editar una compra'; end if;
  select * into v_item from public.pedido_items
   where id = p_item and pedido_id = v.id and estado <> 'eliminado';
  if v_item.id is null then raise exception 'Esa compra no está en este pedido'; end if;
  if coalesce(length(trim(p_quien)), 0) = 0 then raise exception 'Falta el nombre de quien compra'; end if;
  if coalesce(length(trim(p_que)), 0) = 0 then raise exception 'Falta decir qué se compra'; end if;
  if p_monto is null or p_monto <= 0 then raise exception 'El monto tiene que ser mayor que cero'; end if;

  if trim(p_quien) <> v_item.quien then
    v_cambios := v_cambios || format('nombre: %s → %s', v_item.quien, trim(p_quien));
  end if;
  if trim(p_que) <> v_item.que then
    v_cambios := v_cambios || format('glosa: %s → %s', v_item.que, trim(p_que));
  end if;
  if p_monto <> v_item.monto then
    v_cambios := v_cambios || format('monto: %s → %s', v_item.monto, p_monto);
  end if;
  if cardinality(v_cambios) = 0 then
    return;                          -- no cambió nada: no se anota nada
  end if;

  update public.pedido_items
     set quien = trim(p_quien), que = trim(p_que), monto = p_monto, actualizado_en = now()
   where id = p_item;
  insert into public.pedido_item_eventos (item_id, de_estado, a_estado, por, comentario)
  values (p_item, v_item.estado, v_item.estado, 'hacienda',
          'Editado por Hacienda · ' || array_to_string(v_cambios, ' · '));
end;
$$;

-- Hacienda saca una compra del pedido. No se borra: queda como 'eliminado'.
create or replace function public.pedido_eliminar(p_token text, p_item uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.pedidos;
  v_item public.pedido_items;
begin
  select * into v from public.pedidos where token_hacienda = p_token;
  if v.id is null then raise exception 'Solo Hacienda puede eliminar una compra'; end if;
  select * into v_item from public.pedido_items
   where id = p_item and pedido_id = v.id and estado <> 'eliminado';
  if v_item.id is null then raise exception 'Esa compra no está en este pedido'; end if;

  update public.pedido_items set estado = 'eliminado', actualizado_en = now() where id = p_item;
  insert into public.pedido_item_eventos (item_id, de_estado, a_estado, por, comentario)
  values (p_item, v_item.estado, 'eliminado', 'hacienda', 'Eliminado por Hacienda');
end;
$$;

revoke execute on function public.pedido_editar(text, uuid, text, text, integer) from public;
revoke execute on function public.pedido_eliminar(text, uuid) from public;
grant execute on function public.pedido_editar(text, uuid, text, text, integer) to anon, authenticated;
grant execute on function public.pedido_eliminar(text, uuid) to anon, authenticated;
