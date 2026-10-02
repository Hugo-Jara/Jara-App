-- Jara App · 0003 · Archivos de cotizaciones y boletas
--
-- Bucket privado "compras". Cada archivo se guarda como
--   <id de la solicitud>/<nombre único>
-- y lo puede ver o subir quien puede ver la solicitud (quien la pidió y Hacienda).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('compras', 'compras', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

create policy "ver archivos de solicitudes visibles" on storage.objects
  for select to authenticated
  using (bucket_id = 'compras' and exists (
    select 1 from public.solicitudes_compra s
     where s.id::text = (storage.foldername(name))[1]));

create policy "subir archivos a solicitudes visibles" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'compras' and exists (
    select 1 from public.solicitudes_compra s
     where s.id::text = (storage.foldername(name))[1]));
