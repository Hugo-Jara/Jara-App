-- Jara App · 0030 · Instagram en el perfil del jugador
--
-- Pedido del administrador (4/11): cada jugador puede poner su usuario de
-- Instagram en su perfil, y el resto del club lo ve como un enlace a su cuenta.
--
--   - Se guarda solo el usuario (sin @ ni dirección): letras, números, punto y
--     guion bajo, hasta 30, como pide Instagram. Si el jugador pega el link
--     completo o el @, la base lo limpia.
--   - Lo cambia solo el propio jugador (no el tesorero ni el encargado).
--   - Lo ve todo el club, igual que la foto y el dorsal.
--
-- No se conecta con la cuenta de Instagram (eso pediría permisos de Meta y una
-- app aprobada): es un enlace que abre su perfil.
--
-- Revisión: toca datos personales. La revisa el administrador de la app.

alter table public.perfiles add column instagram text
  check (instagram is null or instagram ~ '^[a-z0-9._]{1,30}$');

-- Deja solo el usuario: quita espacios, @, y el https://instagram.com/ del link.
create or replace function public.instagram_limpiar(p text)
returns text language sql immutable as $$
  select nullif(lower(regexp_replace(regexp_replace(trim(coalesce(p, '')),
           '^(https?://)?(www\.)?(instagram\.com|instagr\.am)/', '', 'i'), '^@|[/?].*$', '', 'g')), '');
$$;

create or replace function public.perfil_instagram_guardar(p_instagram text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_yo   uuid := public.mi_persona_id();
  v_user text := public.instagram_limpiar(p_instagram);
begin
  if v_yo is null then raise exception 'Tu cuenta no está en la nómina del club'; end if;
  if v_user is not null and v_user !~ '^[a-z0-9._]{1,30}$' then
    raise exception 'Ese usuario de Instagram no parece válido (solo letras, números, punto y guion bajo)';
  end if;
  insert into public.perfiles (persona_id) values (v_yo) on conflict (persona_id) do nothing;
  update public.perfiles set instagram = v_user, actualizado_en = now() where persona_id = v_yo;
  return v_user;
end;
$$;

-- Igual que en 0028, más 'instagram'.
create or replace function public.perfil_ver(p_persona uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_id     uuid := coalesce(p_persona, public.mi_persona_id());
  v_propio boolean := v_id = public.mi_persona_id();
  p        public.personas;
  f        public.perfiles;
  c        public.persona_contactos;
begin
  if public.mi_persona_id() is null then raise exception 'Tu cuenta no está en la nómina del club'; end if;
  select * into p from public.personas where id = v_id and club_id = public.mi_club_id() and estado <> 'inactivo';
  if p.id is null then raise exception 'No encontramos a esa persona en el club'; end if;
  select * into f from public.perfiles where persona_id = v_id;
  if v_propio then select * into c from public.persona_contactos where persona_id = v_id; end if;

  return jsonb_build_object(
    'id', p.id, 'nombre', p.nombre, 'apodo', p.apodo, 'estado', p.estado,
    'propio', v_propio,
    'puedo_cargar', v_propio or public.perfil_puedo_cargar(v_id),
    'instagram', f.instagram,
    'foto_ruta', f.foto_ruta, 'posicion', f.posicion, 'pie', f.pie,
    'cumple', to_char(f.nacimiento, 'MM-DD'),
    'nacimiento', case when v_propio then f.nacimiento end,
    'muestra_fisico', coalesce(f.muestra_fisico, false),
    'estatura_cm', case when v_propio or f.muestra_fisico then f.estatura_cm end,
    'peso_kg', case when v_propio or f.muestra_fisico then f.peso_kg end,
    'telefono', case when v_propio then c.telefono end,
    'correo', case when v_propio then c.email end,
    'planteles', coalesce((
      select jsonb_agg(jsonb_build_object('id', e.id, 'nombre', e.nombre, 'dorsal', d.numero) order by e.orden, e.nombre)
        from public.equipos e
        left join public.dorsales d on d.equipo_id = e.id and d.persona_id = v_id
       where exists (select 1 from public.persona_equipos pe
                      where pe.persona_id = v_id and pe.equipo_id = e.id and pe.rol = 'jugador')), '[]'::jsonb));
end;
$$;

revoke execute on function public.instagram_limpiar(text) from public, anon;
revoke execute on function public.perfil_instagram_guardar(text) from public, anon;
grant execute on function public.instagram_limpiar(text) to authenticated;
grant execute on function public.perfil_instagram_guardar(text) to authenticated;
