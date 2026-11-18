-- Jara App · 0059 · Buscarme en las fotos con una selfie
--
-- Hasta ahora (0042) la búsqueda usaba siempre la foto de perfil. Hay quienes
-- ponen una foto de espalda (por el número), de su jugador favorito o con más
-- gente: así la búsqueda no los encuentra, o busca a otra persona. Ahora,
-- quien activó la búsqueda puede subir una selfie solo para buscarse:
--   - Bucket privado 'caras-selfie': cada uno sube, ve y borra solo la suya.
--     Nadie más del club la ve; la tarea de GitHub la lee con la clave secreta.
--   - caras_personas.selfie_ruta: si hay selfie, la huella sale de ella; si
--     no, de la foto de perfil (como antes). Cambiar o quitar la selfie hace
--     que la huella se saque de nuevo.
--   - caras_selfie_guardar(p_ruta): guarda la selfie nueva (o la quita con
--     null) y devuelve la ruta anterior para que la app borre el archivo.
--   - caras_trabajo: la foto con que se busca y de qué bucket viene.
--   - caras_mi_estado: dice también 'con_selfie'.
--   - caras_activar: ya no exige foto de perfil (quien no tiene, sube una
--     selfie después de activar). Lo demás igual que en 0042.
--
-- Revisión: datos biométricos (siempre con el permiso de la persona). No toca
-- plata. La revisa el administrador de la app.

alter table public.caras_personas add column selfie_ruta text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('caras-selfie', 'caras-selfie', false, 2097152, array['image/jpeg'])
on conflict (id) do nothing;

create policy "subir mi selfie" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'caras-selfie'
              and (storage.foldername(name))[1] = public.mi_persona_id()::text);

create policy "ver mi selfie" on storage.objects
  for select to authenticated
  using (bucket_id = 'caras-selfie'
         and (storage.foldername(name))[1] = public.mi_persona_id()::text);

create policy "borrar mi selfie" on storage.objects
  for delete to authenticated
  using (bucket_id = 'caras-selfie'
         and (storage.foldername(name))[1] = public.mi_persona_id()::text);

-- Guarda (o quita, con null) mi selfie. Devuelve la ruta anterior.
create or replace function public.caras_selfie_guardar(p_ruta text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_yo uuid := public.mi_persona_id();
  v_antes text;
begin
  if v_yo is null then raise exception 'Tu cuenta no está en la nómina del club'; end if;
  if p_ruta is not null and (p_ruta not like v_yo::text || '/%' or p_ruta like '%..%') then
    raise exception 'Esa foto no es tuya';
  end if;
  select selfie_ruta into v_antes from public.caras_personas where persona_id = v_yo for update;
  if not found then raise exception 'Primero activa "Buscarme en las fotos"'; end if;
  update public.caras_personas set selfie_ruta = p_ruta where persona_id = v_yo;
  return v_antes;
end;
$$;

-- Igual que en 0045, más 'con_selfie' y 'selfie_ruta'. La foto que vale para
-- la búsqueda es la selfie si hay, si no la de perfil.
create or replace function public.caras_mi_estado()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  c public.caras_personas;
  v_foto text;
begin
  if public.mi_persona_id() is null then raise exception 'Tu cuenta no está en la nómina del club'; end if;
  select foto_ruta into v_foto from public.perfiles where persona_id = public.mi_persona_id();
  select * into c from public.caras_personas where persona_id = public.mi_persona_id();
  return jsonb_build_object(
    'activa', c.persona_id is not null,
    'tiene_foto', v_foto is not null,
    'con_selfie', c.selfie_ruta is not null,
    'selfie_ruta', c.selfie_ruta,
    'estado', c.estado,
    'muestra', coalesce(c.muestra, false),
    'aceptada_en', c.aceptada_en,
    'revisada_en', c.revisada_en,
    'foto_cambio', c.persona_id is not null and c.foto_ruta is distinct from coalesce(c.selfie_ruta, v_foto),
    'encontradas', (select count(*) from public.caras_hallazgos h
                     where h.persona_id = c.persona_id and not h.oculta
                       and exists (select 1 from public.fotos_archivos a where a.archivo_id = h.archivo_id)));
end;
$$;

-- Igual que en 0042, pero la foto es la selfie si hay (con su bucket).
create or replace function public.caras_trabajo()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'personas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'persona_id', c.persona_id, 'club_id', c.club_id,
               'foto_ruta', x.ruta, 'bucket', x.bucket, 'huella', c.huella, 'estado', c.estado,
               'sacar_huella', x.ruta is not null and (c.huella is null or c.foto_ruta is distinct from x.ruta),
               'sin_foto', x.ruta is null,
               'completa', c.revisada_en is not null and c.foto_ruta is not distinct from x.ruta))
        from public.caras_personas c
        left join public.perfiles f on f.persona_id = c.persona_id
        cross join lateral (select coalesce(c.selfie_ruta, f.foto_ruta) as ruta,
                                   case when c.selfie_ruta is not null then 'caras-selfie' else 'fotos-perfil' end as bucket) x),
      '[]'::jsonb),
    'archivos', coalesce((
      select jsonb_agg(jsonb_build_object('archivo_id', a.archivo_id, 'club_id', k.club_id,
                                          'revisada', exists (select 1 from public.caras_archivos r where r.archivo_id = a.archivo_id)))
        from public.fotos_archivos a
        join public.fotos_carpetas k on k.carpeta_id = a.carpeta_id), '[]'::jsonb),
    'llaves', coalesce((
      select jsonb_object_agg(club_id, llave) from public.fotos_drive where llave is not null), '{}'::jsonb));
$$;

-- Igual que en 0042, sin exigir foto de perfil.
create or replace function public.caras_activar(p_mayor boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_yo  uuid := public.mi_persona_id();
  v_nac date;
begin
  if v_yo is null then raise exception 'Tu cuenta no está en la nómina del club'; end if;
  if public.soy_cuenta_de_prueba() then raise exception 'La cuenta de prueba no puede activar esto'; end if;
  if not coalesce(p_mayor, false) then raise exception 'Buscarte en las fotos es solo para mayores de 18'; end if;
  select nacimiento into v_nac from public.perfiles where persona_id = v_yo;
  if v_nac is not null and v_nac > current_date - interval '18 years' then
    raise exception 'Buscarte en las fotos es solo para mayores de 18';
  end if;
  insert into public.caras_personas (persona_id, club_id)
  values (v_yo, public.mi_club_id())
  on conflict (persona_id) do nothing;
end;
$$;

revoke all on function public.caras_selfie_guardar(text) from public, anon;
grant execute on function public.caras_selfie_guardar(text) to authenticated;
revoke all on function public.caras_trabajo() from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.caras_trabajo() to service_role;
  end if;
end $$;
