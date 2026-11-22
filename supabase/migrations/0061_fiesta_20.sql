-- Jara App · 0061 · Fotos y videos del carrete de los 20 años
--
-- Algo temporal: una semana para que la gente suba sus fotos y videos de la
-- fiesta de los 20 años y todos los vean en la app.
--   - Bucket privado 'fiesta-20': cada socio con sesión sube en su carpeta
--     (su persona_id/...). Todo el club con sesión ve. Cada uno borra lo suyo;
--     los administradores borran cualquier cosa.
--   - Tope por archivo: 50 MB (el máximo del plan gratis de Supabase). Las
--     fotos se achican en el celular antes de subir (unos 300-600 KB).
--   - Tope total: 600 MB entre todo (el plan gratis trae 1 GB de Storage para
--     toda la app). Al llegar al tope la app avisa y no deja subir más.
--   - Se cierra solo: desde el 1 de diciembre de 2026 (hora de Chile) ya no
--     se puede subir. Para cambiar la fecha, editar fiesta_abierta().
--   - Tabla fiesta_archivos: quién subió qué, para la galería y el tope.
--   - fiesta_guardar(...): anota lo que se acaba de subir (revisa carpeta,
--     fecha y tope).
--   - fiesta_listar(): la galería, más el espacio usado.
--   - fiesta_borrar(id): borra la fila y devuelve las rutas para que la app
--     borre los archivos.
--
-- Revisión: no toca plata ni permisos de otras cosas. La revisa el
-- administrador de la app.

create table public.fiesta_archivos (
  id         uuid primary key default gen_random_uuid(),
  club_id    uuid not null references public.clubes(id) on delete cascade,
  persona_id uuid not null references public.personas(id) on delete cascade,
  ruta       text not null unique,
  miniatura  text,
  tipo       text not null check (tipo in ('foto', 'video')),
  bytes      bigint not null check (bytes > 0),
  creado_en  timestamptz not null default now()
);
create index fiesta_archivos_club_idx on public.fiesta_archivos (club_id, creado_en desc);
alter table public.fiesta_archivos enable row level security;
-- Sin políticas ni grants: solo se lee y escribe por las funciones de abajo.

-- Hasta cuándo se puede subir (fin del domingo 30 de noviembre, hora de Chile).
create or replace function public.fiesta_abierta()
returns boolean language sql stable set search_path = public as $$
  select now() < timestamptz '2026-12-01 00:00:00-03';
$$;

-- Tope total de la galería, en bytes.
create or replace function public.fiesta_tope()
returns bigint language sql immutable as $$ select 600::bigint * 1024 * 1024 $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fiesta-20', 'fiesta-20', false, 52428800,
        array['image/jpeg', 'video/mp4', 'video/quicktime', 'video/webm', 'video/3gpp'])
on conflict (id) do nothing;

create policy "fiesta subir en mi carpeta" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'fiesta-20'
              and public.fiesta_abierta()
              and (storage.foldername(name))[1] = public.mi_persona_id()::text);

create policy "fiesta ver todo el club" on storage.objects
  for select to authenticated
  using (bucket_id = 'fiesta-20' and public.mi_persona_id() is not null);

create policy "fiesta borrar lo mio" on storage.objects
  for delete to authenticated
  using (bucket_id = 'fiesta-20'
         and ((storage.foldername(name))[1] = public.mi_persona_id()::text or public.soy_admin()));

-- Anota un archivo recién subido. p_miniatura es la foto chica (de la foto o
-- del primer cuadro del video); puede venir null.
create or replace function public.fiesta_guardar(p_ruta text, p_miniatura text, p_tipo text, p_bytes bigint)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_yo uuid := public.mi_persona_id();
  v_usado bigint;
  v_id uuid;
begin
  if v_yo is null then raise exception 'Tu cuenta no está en la nómina del club'; end if;
  if not public.fiesta_abierta() then raise exception 'Ya se cerró la subida de fotos de la fiesta'; end if;
  if p_tipo not in ('foto', 'video') then raise exception 'Tipo de archivo no válido'; end if;
  if p_bytes is null or p_bytes <= 0 or p_bytes > 52428800 then raise exception 'Ese archivo pesa más de 50 MB'; end if;
  if p_ruta is null or p_ruta not like v_yo::text || '/%' or p_ruta like '%..%'
     or (p_miniatura is not null and (p_miniatura not like v_yo::text || '/%' or p_miniatura like '%..%')) then
    raise exception 'Ese archivo no es tuyo';
  end if;
  -- Un candado para que dos subidas al mismo tiempo no se pasen del tope.
  perform pg_advisory_xact_lock(hashtext('fiesta-20'));
  select coalesce(sum(bytes), 0) into v_usado from public.fiesta_archivos;
  if v_usado + p_bytes > public.fiesta_tope() then
    raise exception 'Se llenó el espacio de la galería de la fiesta. Avísale a un administrador.';
  end if;
  insert into public.fiesta_archivos (club_id, persona_id, ruta, miniatura, tipo, bytes)
  values (public.mi_club_id(), v_yo, p_ruta, p_miniatura, p_tipo, p_bytes)
  returning id into v_id;
  return v_id;
end;
$$;

-- La galería (lo más nuevo primero) y cuánto espacio queda.
create or replace function public.fiesta_listar()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if public.mi_persona_id() is null then raise exception 'Tu cuenta no está en la nómina del club'; end if;
  return jsonb_build_object(
    'abierta', public.fiesta_abierta(),
    'usado', (select coalesce(sum(bytes), 0) from public.fiesta_archivos),
    'tope', public.fiesta_tope(),
    'archivos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', f.id, 'ruta', f.ruta, 'miniatura', f.miniatura, 'tipo', f.tipo, 'bytes', f.bytes,
               'creado_en', f.creado_en, 'persona_id', f.persona_id, 'nombre', p.nombre,
               'puedo_borrar', f.persona_id = public.mi_persona_id() or public.soy_admin())
             order by f.creado_en desc)
        from public.fiesta_archivos f
        join public.personas p on p.id = f.persona_id
       where f.club_id = public.mi_club_id()), '[]'::jsonb));
end;
$$;

-- Borra uno (lo mío, o cualquiera si soy administrador). Devuelve las rutas
-- de los archivos para que la app los saque del bucket.
create or replace function public.fiesta_borrar(p_id uuid)
returns text[] language plpgsql security definer set search_path = public as $$
declare
  f public.fiesta_archivos;
begin
  if public.mi_persona_id() is null then raise exception 'Tu cuenta no está en la nómina del club'; end if;
  select * into f from public.fiesta_archivos where id = p_id;
  if not found then return array[]::text[]; end if;
  if f.persona_id <> public.mi_persona_id() and not public.soy_admin() then
    raise exception 'Solo puedes borrar lo que subiste tú';
  end if;
  delete from public.fiesta_archivos where id = p_id;
  return array_remove(array[f.ruta, f.miniatura], null);
end;
$$;

revoke all on function public.fiesta_guardar(text, text, text, bigint), public.fiesta_listar(), public.fiesta_borrar(uuid) from public, anon;
grant execute on function public.fiesta_guardar(text, text, text, bigint), public.fiesta_listar(), public.fiesta_borrar(uuid) to authenticated;
