-- Jara App · 0050 · El Jara Informa: publicar, retirar y eliminar ediciones
--
-- Hasta ahora el boletín se armaba y se guardaba solo en el navegador de quien
-- edita. Desde esta migración las ediciones viven en la base:
--
--   - Tabla `boletin_ediciones`: número, título, estado y el contenido editable
--     (el mismo JSON del respaldo, con las fotos como rutas del bucket).
--   - Bucket privado `boletin`, con una carpeta por edición:
--       <edición>/fotos/<archivo>         fotos del borrador
--       <edición>/v<versión>/pagina-NN.png  páginas de cada publicación
--
-- Quién hace qué (revisado aquí, no en la app):
--   - Gestionan ediciones (crear, guardar, subir, publicar, retirar, eliminar):
--     Comunicaciones (`edita_comunicaciones`) y administradores (`es_admin`).
--   - Los socios de la nómina ven solo lo publicado de su club: las páginas de
--     la versión publicada y las fotos de la copia publicada.
--
-- Publicar nunca deja una edición a medias: la app sube primero todas las
-- páginas a una carpeta de versión NUEVA y recién entonces llama a
-- `boletin_publicar`, que revisa que estén todas antes de cambiar el estado.
-- Lo que ven los socios (`contenido_publicado`, versión publicada) solo cambia
-- en ese paso, así que guardar un borrador no toca la edición a la vista.
--
-- Eliminar: solo borradores o retiradas, escribiendo su número. La app borra
-- primero los archivos de la carpeta y después llama a `boletin_eliminar`.

-- ---------------------------------------------------------------------------
-- Quién gestiona el boletín
-- ---------------------------------------------------------------------------
create or replace function public.gestiona_boletin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select es_admin or edita_comunicaciones
       from public.personas where user_id = auth.uid() and estado <> 'inactivo'),
    false);
$$;

-- ---------------------------------------------------------------------------
-- Ediciones
-- ---------------------------------------------------------------------------
create table public.boletin_ediciones (
  id                  uuid primary key default gen_random_uuid(),
  club_id             uuid not null references public.clubes(id),
  numero              int  not null check (numero between 1 and 9999),
  titulo              text not null default '' check (char_length(titulo) <= 200),
  resumen             text not null default '' check (char_length(resumen) <= 1000),
  fecha_edicion       text not null default '' check (char_length(fecha_edicion) <= 60),
  origen              text not null default 'editor' check (origen in ('editor', 'historica')),
  estado              text not null default 'borrador' check (estado in ('borrador', 'publicada', 'retirada')),
  contenido           jsonb,
  contenido_publicado jsonb,
  version             int  not null default 0 check (version >= 0),
  paginas             int  not null default 0 check (paginas between 0 and 40),
  creada_por          uuid references public.personas(id),
  creada_en           timestamptz not null default now(),
  actualizada_por     uuid references public.personas(id),
  actualizada_en      timestamptz not null default now(),
  publicada_por       uuid references public.personas(id),
  publicada_en        timestamptz,
  retirada_en         timestamptz,
  unique (club_id, numero),
  check (origen = 'editor' or contenido is null)
);

alter table public.boletin_ediciones enable row level security;
revoke all on public.boletin_ediciones from anon, authenticated;

-- La edición es de mi club (para las funciones y las reglas del bucket).
create or replace function public.boletin_de_mi_club(p_carpeta text)
returns public.boletin_ediciones language sql stable security definer set search_path = public as $$
  select e.* from public.boletin_ediciones e
   where e.id::text = p_carpeta and e.club_id = public.mi_club_id();
$$;

-- ---------------------------------------------------------------------------
-- Bucket privado
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('boletin', 'boletin', false, 10485760, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

-- ¿Puedo ver este archivo? Gestores: todo lo de su club. Socios: solo las
-- páginas de la versión publicada y las fotos de una edición publicada.
create or replace function public.boletin_puedo_ver(p_nombre text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  e public.boletin_ediciones;
  partes text[] := string_to_array(p_nombre, '/');
begin
  e := public.boletin_de_mi_club(partes[1]);
  if e.id is null or public.mi_persona_id() is null then return false; end if;
  if public.gestiona_boletin() then return true; end if;
  return e.estado = 'publicada'
     and (partes[2] = 'v' || e.version or partes[2] = 'fotos');
end;
$$;

-- ¿Puedo subir, cambiar o borrar este archivo? Solo gestores, solo en
-- carpetas de su club con la forma esperada, y nunca en la carpeta de la
-- versión que está a la vista de los socios.
create or replace function public.boletin_puedo_escribir(p_nombre text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  e public.boletin_ediciones;
  partes text[] := string_to_array(p_nombre, '/');
begin
  if not public.gestiona_boletin() or array_length(partes, 1) <> 3 then return false; end if;
  e := public.boletin_de_mi_club(partes[1]);
  if e.id is null then return false; end if;
  if partes[2] = 'fotos' then return e.origen = 'editor'; end if;
  if partes[2] !~ '^v[1-9][0-9]{0,3}$' then return false; end if;
  return not (e.estado = 'publicada' and partes[2] = 'v' || e.version);
end;
$$;

revoke execute on function public.gestiona_boletin() from public, anon;
revoke execute on function public.boletin_de_mi_club(text) from public, anon, authenticated;
revoke execute on function public.boletin_puedo_ver(text) from public, anon;
revoke execute on function public.boletin_puedo_escribir(text) from public, anon;
grant execute on function public.gestiona_boletin() to authenticated;
grant execute on function public.boletin_puedo_ver(text) to authenticated;
grant execute on function public.boletin_puedo_escribir(text) to authenticated;

create policy "boletin: ver" on storage.objects
  for select to authenticated
  using (bucket_id = 'boletin' and public.boletin_puedo_ver(name));

create policy "boletin: subir" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'boletin' and public.boletin_puedo_escribir(name));

create policy "boletin: reemplazar" on storage.objects
  for update to authenticated
  using (bucket_id = 'boletin' and public.boletin_puedo_escribir(name))
  with check (bucket_id = 'boletin' and public.boletin_puedo_escribir(name));

create policy "boletin: borrar" on storage.objects
  for delete to authenticated
  using (bucket_id = 'boletin' and public.boletin_puedo_escribir(name));

-- ---------------------------------------------------------------------------
-- Funciones de la app
-- ---------------------------------------------------------------------------

-- Ficha de una edición para el catálogo (sin el contenido).
create or replace function public.boletin_ficha(e public.boletin_ediciones)
returns jsonb language sql stable set search_path = public as $$
  select jsonb_build_object(
    'id', e.id, 'numero', e.numero, 'titulo', e.titulo, 'resumen', e.resumen,
    'fecha_edicion', e.fecha_edicion, 'origen', e.origen, 'estado', e.estado,
    'version', e.version, 'paginas', e.paginas,
    'carpeta', case when e.version > 0 then e.id || '/v' || e.version end,
    'publicada_en', e.publicada_en, 'actualizada_en', e.actualizada_en);
$$;

-- Catálogo: socios ven lo publicado; gestores, además, borradores y retiradas.
create or replace function public.boletin_catalogo()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_gestor boolean := public.gestiona_boletin();
begin
  if public.mi_persona_id() is null then raise exception 'Necesitas una cuenta del club'; end if;
  return coalesce((
    select jsonb_agg(public.boletin_ficha(e) order by e.numero desc)
      from public.boletin_ediciones e
     where e.club_id = public.mi_club_id()
       and (v_gestor or e.estado = 'publicada')), '[]'::jsonb);
end;
$$;

-- Última edición publicada (tarjeta de Inicio). Null si no hay ninguna.
create or replace function public.boletin_ultima()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if public.mi_persona_id() is null then return null; end if;
  return (select public.boletin_ficha(e) from public.boletin_ediciones e
           where e.club_id = public.mi_club_id() and e.estado = 'publicada'
           order by e.numero desc limit 1);
end;
$$;

-- Una edición con su contenido. Socios: solo publicada, con la copia publicada.
-- Gestores: también el borrador editable.
create or replace function public.boletin_edicion(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare e public.boletin_ediciones;
begin
  e := public.boletin_de_mi_club(p_id::text);
  if e.id is null or public.mi_persona_id() is null
     or (e.estado <> 'publicada' and not public.gestiona_boletin()) then
    raise exception 'Esta edición no está disponible';
  end if;
  return public.boletin_ficha(e)
    || jsonb_build_object('contenido_publicado', e.contenido_publicado)
    || case when public.gestiona_boletin() then jsonb_build_object('contenido', e.contenido) else '{}'::jsonb end;
end;
$$;

-- Comunes a las funciones que cambian algo.
create or replace function public.boletin_exigir(p_id uuid)
returns public.boletin_ediciones language plpgsql security definer set search_path = public as $$
declare e public.boletin_ediciones;
begin
  if not public.gestiona_boletin() then raise exception 'Solo Comunicaciones puede gestionar el boletín'; end if;
  select * into e from public.boletin_ediciones
   where id = p_id and club_id = public.mi_club_id() for update;
  if e.id is null then raise exception 'No encontramos esa edición'; end if;
  return e;
end;
$$;

create or replace function public.boletin_numero_libre(p_numero int, p_id uuid)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if exists (select 1 from public.boletin_ediciones
              where club_id = public.mi_club_id() and numero = p_numero and id <> p_id) then
    raise exception 'Ya existe El Jara Informa N°%', p_numero;
  end if;
end;
$$;

-- Crea o actualiza el borrador editable. Nunca cambia lo que ven los socios:
-- eso pasa solo al publicar. p_id lo genera la app para poder subir las
-- fotos a su carpeta antes de guardar.
create or replace function public.boletin_guardar(p_id uuid, p_numero int, p_titulo text,
  p_resumen text, p_fecha text, p_contenido jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare e public.boletin_ediciones;
begin
  if not public.gestiona_boletin() then raise exception 'Solo Comunicaciones puede gestionar el boletín'; end if;
  if p_id is null then raise exception 'Falta el identificador de la edición'; end if;
  if p_contenido is null or jsonb_typeof(p_contenido) <> 'object' then raise exception 'El contenido no es válido'; end if;
  if octet_length(p_contenido::text) > 1000000 then
    raise exception 'El contenido es demasiado grande. Las fotos deben subirse aparte';
  end if;
  perform public.boletin_numero_libre(p_numero, p_id);
  if exists (select 1 from public.boletin_ediciones where id = p_id) then
    e := public.boletin_exigir(p_id);
    if e.origen <> 'editor' then raise exception 'Una edición anterior subida en PNG no se edita'; end if;
    update public.boletin_ediciones
       set numero = p_numero, titulo = coalesce(p_titulo, ''), resumen = coalesce(p_resumen, ''),
           fecha_edicion = coalesce(p_fecha, ''), contenido = p_contenido,
           actualizada_por = public.mi_persona_id(), actualizada_en = now()
     where id = p_id returning * into e;
  else
    insert into public.boletin_ediciones (id, club_id, numero, titulo, resumen, fecha_edicion, contenido,
                                          creada_por, actualizada_por)
    values (p_id, public.mi_club_id(), p_numero, coalesce(p_titulo, ''), coalesce(p_resumen, ''),
            coalesce(p_fecha, ''), p_contenido, public.mi_persona_id(), public.mi_persona_id())
    returning * into e;
  end if;
  return public.boletin_ficha(e);
end;
$$;

-- Registra una edición anterior (solo PNG). Queda en borrador hasta que la app
-- suba sus páginas a <id>/v1/ y llame a boletin_publicar(id, 1, páginas).
create or replace function public.boletin_crear_historica(p_id uuid, p_numero int, p_titulo text,
  p_resumen text, p_fecha text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare e public.boletin_ediciones;
begin
  if not public.gestiona_boletin() then raise exception 'Solo Comunicaciones puede gestionar el boletín'; end if;
  if p_id is null then raise exception 'Falta el identificador de la edición'; end if;
  if exists (select 1 from public.boletin_ediciones where id = p_id) then raise exception 'Esa edición ya existe'; end if;
  perform public.boletin_numero_libre(p_numero, p_id);
  insert into public.boletin_ediciones (id, club_id, numero, titulo, resumen, fecha_edicion, origen,
                                        creada_por, actualizada_por)
  values (p_id, public.mi_club_id(), p_numero, coalesce(p_titulo, ''), coalesce(p_resumen, ''),
          coalesce(p_fecha, ''), 'historica', public.mi_persona_id(), public.mi_persona_id())
  returning * into e;
  return public.boletin_ficha(e);
end;
$$;

-- Publica (o republica) una versión cuyas páginas ya están TODAS subidas en
-- <id>/v<versión>/pagina-01.png ... pagina-NN.png. Si falta alguna no cambia
-- nada. Devuelve la versión anterior para que la app borre esa carpeta.
create or replace function public.boletin_publicar(p_id uuid, p_version int, p_paginas int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  e public.boletin_ediciones;
  v_anterior int;
  v_faltan int;
begin
  e := public.boletin_exigir(p_id);
  if p_version is null or p_version <= e.version or p_version > 9999 then
    raise exception 'La versión debe ser mayor que la publicada (%)', e.version;
  end if;
  if p_paginas is null or p_paginas not between 1 and 40 then raise exception 'Una edición tiene entre 1 y 40 páginas'; end if;
  if e.origen = 'editor' and e.contenido is null then raise exception 'Guarda el borrador antes de publicar'; end if;
  select count(*) into v_faltan
    from generate_series(1, p_paginas) n
   where not exists (select 1 from storage.objects o
                      where o.bucket_id = 'boletin'
                        and o.name = p_id || '/v' || p_version || '/pagina-' || lpad(n::text, 2, '0') || '.png');
  if v_faltan > 0 then
    raise exception 'Faltan % de % páginas por subir. La edición no se publicó', v_faltan, p_paginas;
  end if;
  v_anterior := e.version;
  update public.boletin_ediciones
     set estado = 'publicada', version = p_version, paginas = p_paginas,
         contenido_publicado = e.contenido,
         publicada_por = public.mi_persona_id(), publicada_en = now(), retirada_en = null,
         actualizada_por = public.mi_persona_id(), actualizada_en = now()
   where id = p_id returning * into e;
  return public.boletin_ficha(e) || jsonb_build_object('version_anterior', nullif(v_anterior, 0));
end;
$$;

-- Deja de mostrarla a los socios. Conserva el contenido para corregir y
-- volver a publicar.
create or replace function public.boletin_retirar(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare e public.boletin_ediciones;
begin
  e := public.boletin_exigir(p_id);
  if e.estado <> 'publicada' then raise exception 'Esta edición no está publicada'; end if;
  update public.boletin_ediciones
     set estado = 'retirada', retirada_en = now(),
         actualizada_por = public.mi_persona_id(), actualizada_en = now()
   where id = p_id returning * into e;
  return public.boletin_ficha(e);
end;
$$;

-- Elimina para siempre un borrador o una edición retirada. Se confirma
-- escribiendo su número. Los archivos los borra la app antes de llamar aquí.
create or replace function public.boletin_eliminar(p_id uuid, p_numero_confirmado int)
returns void language plpgsql security definer set search_path = public as $$
declare e public.boletin_ediciones;
begin
  e := public.boletin_exigir(p_id);
  if e.estado = 'publicada' then raise exception 'Primero retira la edición; después puedes eliminarla'; end if;
  if p_numero_confirmado is distinct from e.numero then
    raise exception 'Para eliminar escribe el número de la edición (%)', e.numero;
  end if;
  delete from public.boletin_ediciones where id = p_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Permisos de las funciones
-- ---------------------------------------------------------------------------
revoke execute on function public.boletin_ficha(public.boletin_ediciones) from public, anon, authenticated;
revoke execute on function public.boletin_exigir(uuid) from public, anon, authenticated;
revoke execute on function public.boletin_numero_libre(int, uuid) from public, anon, authenticated;
revoke execute on function public.boletin_catalogo() from public, anon;
revoke execute on function public.boletin_ultima() from public, anon;
revoke execute on function public.boletin_edicion(uuid) from public, anon;
revoke execute on function public.boletin_guardar(uuid, int, text, text, text, jsonb) from public, anon;
revoke execute on function public.boletin_crear_historica(uuid, int, text, text, text) from public, anon;
revoke execute on function public.boletin_publicar(uuid, int, int) from public, anon;
revoke execute on function public.boletin_retirar(uuid) from public, anon;
revoke execute on function public.boletin_eliminar(uuid, int) from public, anon;
grant execute on function public.boletin_catalogo() to authenticated;
grant execute on function public.boletin_ultima() to authenticated;
grant execute on function public.boletin_edicion(uuid) to authenticated;
grant execute on function public.boletin_guardar(uuid, int, text, text, text, jsonb) to authenticated;
grant execute on function public.boletin_crear_historica(uuid, int, text, text, text) to authenticated;
grant execute on function public.boletin_publicar(uuid, int, int) to authenticated;
grant execute on function public.boletin_retirar(uuid) to authenticated;
grant execute on function public.boletin_eliminar(uuid, int) to authenticated;
