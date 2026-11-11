-- Jara App · 0049 · Subir comprobantes y boletas a una lista ya cerrada
--
-- Problema: los archivos de Compras solo se podían subir a la carpeta de una
-- lista ABIERTA (reglas de Storage de 0006 y 0017). Pero Compras muestra las
-- solicitudes de todas las listas no archivadas, abiertas o cerradas. Si una
-- compra quedó en una lista que después se cerró (o se cerró su tópico),
-- Hacienda la veía con el botón "Entregar con comprobante", pero Storage
-- rechazaba el archivo y la app decía "No se pudo subir el archivo".
-- Las funciones que guardan el comprobante y la boleta nunca pidieron que la
-- lista estuviera abierta: el bloqueo era solo de Storage.
--
-- Desde ahora se puede subir a la carpeta de una lista:
--   - abierta: igual que antes (con o sin cuenta);
--   - cerrada pero no archivada, de mi club:
--       · Hacienda, cualquier archivo (comprobante o boleta);
--       · quien pidió una compra con la plata ya entregada, su boleta.
-- Cotizaciones y solicitudes nuevas siguen yendo solo a listas abiertas: eso
-- lo revisan las funciones de la base, no Storage.

create or replace function public.puedo_subir_a_carpeta(p_carpeta text, p_bucket text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.pedido_carpeta_abierta(p_carpeta)
      or exists (
           select 1 from public.pedidos p
            where p.carpeta = p_carpeta
              and not p.archivado
              and p.club_id = public.mi_club_id()
              and (public.puedo_aprobar_compras()
                   or (p_bucket = 'pedidos'
                       and exists (select 1 from public.pedido_items i
                                    where i.pedido_id = p.id
                                      and i.persona_id = public.mi_persona_id()
                                      and i.estado = 'entregado'))));
$$;

revoke execute on function public.puedo_subir_a_carpeta(text, text) from public;
grant execute on function public.puedo_subir_a_carpeta(text, text) to anon, authenticated;

drop policy if exists "subir archivos a un pedido abierto" on storage.objects;
create policy "subir archivos a un pedido abierto" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'pedidos'
              and public.puedo_subir_a_carpeta((storage.foldername(name))[1], 'pedidos'));

drop policy if exists "subir comprobantes a un pedido abierto" on storage.objects;
create policy "subir comprobantes a un pedido abierto" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'comprobantes'
              and public.puedo_subir_a_carpeta((storage.foldername(name))[1], 'comprobantes'));
