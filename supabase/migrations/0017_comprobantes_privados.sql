-- Jara App · 0017 · Comprobantes de transferencia en un lugar privado
--
-- Hasta ahora los comprobantes quedaban en el bucket público 'pedidos': quien
-- tuviera la dirección del archivo lo abría sin cuenta y para siempre. Un
-- comprobante trae nombre, RUT, banco y cuenta de quien recibió la plata.
--
-- Desde ahora:
--   - Los comprobantes van al bucket privado 'comprobantes'.
--   - Se siguen subiendo con el link de Hacienda, igual que antes.
--   - Para verlos hay que haber entrado a la Jara App con una cuenta que
--     pueda: administradores, ministro de Hacienda, tesoreros de plantel y
--     quienes tengan el permiso personal 've_comprobantes' (por ejemplo, el
--     presidente). La app pide una dirección que dura 10 minutos.
--   - Quién puede verlos lo decide una sola función, puedo_ver_comprobantes().
--     Cuando exista el módulo del fondo, se cambia solo esa función.
--
-- El permiso personal se da en Supabase: Table Editor > personas > ve_comprobantes.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('comprobantes', 'comprobantes', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'])
on conflict (id) do nothing;

alter table public.personas add column ve_comprobantes boolean not null default false;

-- ¿Puedo ver los comprobantes de transferencia?
create or replace function public.puedo_ver_comprobantes()
returns boolean language sql stable security definer set search_path = public as $$
  select public.puedo_aprobar_compras()
      or exists (select 1 from public.personas p
                  where p.id = public.mi_persona_id() and p.ve_comprobantes)
      or exists (select 1 from public.persona_equipos pe
                  where pe.persona_id = public.mi_persona_id() and pe.rol = 'tesorero');
$$;

-- Subir: igual que en 'pedidos', solo a la carpeta de un pedido abierto.
create policy "subir comprobantes a un pedido abierto" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'comprobantes'
              and public.pedido_carpeta_abierta((storage.foldername(name))[1]));

-- Ver: solo quien puede, con su cuenta. Sin esta regla nadie más lo abre.
create policy "ver comprobantes con permiso" on storage.objects
  for select to authenticated
  using (bucket_id = 'comprobantes' and public.puedo_ver_comprobantes());

-- Igual que en 0008, pero la ruta del comprobante también llega a quien puede
-- verlo con su cuenta, y se avisa si quien mira puede abrirlo.
create or replace function public.pedido_ver(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v public.pedidos;
  v_hacienda boolean;
  v_ve boolean := public.puedo_ver_comprobantes();
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
    'puedo_ver_comprobantes', v_ve,
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
               'comprobante_ruta', case when v_hacienda or v_ve then i.comprobante_ruta end,
               'comprobante_nombre', case when v_hacienda or v_ve then i.comprobante_nombre end,
               'creado_en', i.creado_en) order by i.creado_en)
        from public.pedido_items i
       where i.pedido_id = v.id and i.estado <> 'eliminado'), '[]'::jsonb));
end;
$$;

-- Igual que en 0007, pero el archivo tiene que estar en el bucket privado.
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
  if p_ruta is null or p_ruta not like v.carpeta || '/%'
     or not exists (select 1 from storage.objects where bucket_id = 'comprobantes' and name = p_ruta) then
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

-- Los comprobantes que quedaron en el bucket público se desenlazan (hoy hay
-- uno solo, de prueba). El archivo mismo se borra a mano en Supabase:
-- Storage > pedidos.
insert into public.pedido_item_eventos (item_id, de_estado, a_estado, por, comentario)
select id, estado, estado, 'hacienda', 'Comprobante quitado: estaba en un lugar público'
  from public.pedido_items i
 where comprobante_ruta is not null
   and not exists (select 1 from storage.objects o where o.bucket_id = 'comprobantes' and o.name = i.comprobante_ruta);
update public.pedido_items i
   set comprobante_ruta = null, comprobante_nombre = null
 where comprobante_ruta is not null
   and not exists (select 1 from storage.objects o where o.bucket_id = 'comprobantes' and o.name = i.comprobante_ruta);

revoke execute on function public.puedo_ver_comprobantes() from public, anon;
grant execute on function public.puedo_ver_comprobantes() to authenticated;
