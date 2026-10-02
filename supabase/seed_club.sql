-- Datos iniciales del Club Deportivo Hugo Jara: el club, sus tres equipos y
-- las áreas conocidas. Las personas se cargan aparte (tienen datos de contacto).

insert into public.clubes (nombre, slug, etiqueta_area)
values ('Club Deportivo Hugo Jara', 'hugo-jara', 'Ministerio')
on conflict (slug) do nothing;

insert into public.equipos (club_id, nombre, orden)
select c.id, e.nombre, e.orden
  from public.clubes c,
       (values ('Senior Jueves', 1), ('Senior Sábado', 2), ('Junior Sábado', 3)) as e(nombre, orden)
 where c.slug = 'hugo-jara'
on conflict (club_id, nombre) do nothing;

insert into public.areas (club_id, nombre, aprueba_compras, orden)
select c.id, a.nombre, a.aprueba, a.orden
  from public.clubes c,
       (values ('Ministerio de Hacienda', true, 1),
               ('Secretaría de Comunicaciones', false, 2),
               ('Ministerio del Deporte', false, 3),
               ('Cancillería, Secretaría y Burocracia', false, 4),
               ('Ministerio de Desarrollo Social', false, 5)) as a(nombre, aprueba, orden)
 where c.slug = 'hugo-jara'
on conflict (club_id, nombre) do nothing;
