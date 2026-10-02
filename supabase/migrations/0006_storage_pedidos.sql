-- Jara App · 0006 · Archivos de los pedidos de compra
--
-- Cotizaciones, referencias y boletas. Como a los pedidos se entra sin cuenta,
-- los archivos se sirven por dirección directa: cada uno queda en
--   <carpeta secreta del pedido>/<código al azar>-<nombre>
-- y solo lo abre quien tiene esa dirección, que la página entrega a quien
-- entró con el link del pedido. Nadie puede listar el contenido del bucket.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pedidos', 'pedidos', true, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'])
on conflict (id) do nothing;

-- Solo se puede subir a la carpeta de un pedido abierto. No hay regla de
-- lectura ni de borrado: sin ellas no se puede listar, reemplazar ni borrar.
create policy "subir archivos a un pedido abierto" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'pedidos'
              and public.pedido_carpeta_abierta((storage.foldername(name))[1]));
