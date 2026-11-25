-- B3 · Avisos de Comunicaciones y lecturas por socio y versión.
create table public.avisos (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubes(id),
  equipo_id uuid references public.equipos(id),
  autor_id uuid references public.personas(id) on delete set null,
  autor_nombre text not null,
  titulo text not null check (char_length(btrim(titulo)) between 1 and 100),
  mensaje text not null check (char_length(btrim(mensaje)) between 1 and 500),
  tipo text not null check (tipo in ('informativo', 'suspension', 'horario', 'recordatorio', 'importante')),
  publicado_en timestamptz not null,
  vence_en timestamptz check (vence_en > publicado_en and isfinite(vence_en)),
  modificado_en timestamptz,
  retirado_en timestamptz,
  version integer not null default 1 check (version > 0)
);

create index avisos_club_publicacion_idx on public.avisos (club_id, publicado_en desc);

create table public.aviso_lecturas (
  aviso_id uuid not null references public.avisos(id),
  persona_id uuid not null references public.personas(id) on delete cascade,
  version integer not null check (version > 0),
  leido_en timestamptz not null default now(),
  primary key (aviso_id, persona_id, version)
);

alter table public.avisos enable row level security;
alter table public.aviso_lecturas enable row level security;
revoke all on public.avisos, public.aviso_lecturas from public, anon, authenticated;

create function public.avisos_puedo_gestionar()
returns boolean language sql stable set search_path = public as $$
  select not public.soy_cuenta_de_prueba() and exists (
    select 1 from public.personas p
     where p.id = public.mi_persona_id() and p.edita_comunicaciones
  );
$$;

-- Usa los UUID del catálogo del club. La tilde en Sénior es opcional.
create function public.avisos_planteles()
returns setof public.equipos language sql stable set search_path = public as $$
  select e.* from public.equipos e
   where e.club_id = public.mi_club_id()
     and translate(lower(btrim(e.nombre)), 'éá', 'ea')
         in ('senior sabado', 'senior jueves', 'junior sabado');
$$;

create function public.aviso_estado(a public.avisos)
returns text language sql stable set search_path = public as $$
  select case when a.retirado_en is not null then 'retirado'
              when a.vence_en <= statement_timestamp() then 'vencido'
              else 'vigente' end;
$$;

create function public.aviso_visible(a public.avisos)
returns boolean language sql stable set search_path = public as $$
  select public.mi_persona_id() is not null
     and a.club_id = public.mi_club_id()
     and public.aviso_estado(a) = 'vigente'
     and (a.equipo_id is null or exists (
       select 1 from public.persona_equipos pe
        where pe.persona_id = public.mi_persona_id() and pe.equipo_id = a.equipo_id
     ));
$$;

create function public.aviso_json(a public.avisos, p_leido boolean)
returns jsonb language sql stable set search_path = public as $$
  select jsonb_build_object(
    'id', a.id, 'titulo', a.titulo, 'mensaje', a.mensaje, 'tipo', a.tipo,
    'equipo_id', a.equipo_id, 'equipo', (select nombre from public.equipos where id = a.equipo_id), 'autor', a.autor_nombre,
    'publicado_en', a.publicado_en, 'vence_en', a.vence_en,
    'modificado_en', a.modificado_en, 'retirado_en', a.retirado_en,
    'estado', public.aviso_estado(a), 'version', a.version, 'leido', p_leido
  );
$$;

create function public.avisos_vigentes()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(public.aviso_json(a, l.aviso_id is not null)
                            order by a.publicado_en desc, a.id), '[]'::jsonb)
    from public.avisos a
    left join public.aviso_lecturas l on l.aviso_id = a.id
      and l.persona_id = public.mi_persona_id() and l.version = a.version
   where a.club_id = public.mi_club_id() and public.aviso_visible(a);
$$;

create function public.aviso_abrir(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_aviso public.avisos;
begin
  -- Comparte el bloqueo con otros lectores. Una edición o retiro espera al
  -- registro de la lectura, así queda asociada a la versión que se devuelve.
  select a.* into v_aviso from public.avisos a
   where a.id = p_id and a.club_id = public.mi_club_id() and public.aviso_visible(a)
   for share;
  if not found then return null; end if;

  insert into public.aviso_lecturas (aviso_id, persona_id, version)
  values (v_aviso.id, public.mi_persona_id(), v_aviso.version)
  on conflict do nothing;
  return public.aviso_json(v_aviso, true);
end;
$$;

create function public.aviso_publicar(p_titulo text, p_mensaje text, p_tipo text,
                                     p_equipo_id uuid, p_vigencia text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_publicado timestamptz := statement_timestamp();
  v_vence timestamptz;
  v_id uuid;
begin
  if not public.avisos_puedo_gestionar() then
    raise exception 'Solo Comunicaciones puede gestionar avisos' using errcode = '42501';
  end if;
  if p_equipo_id is not null and not exists (select 1 from public.avisos_planteles() where id = p_equipo_id) then
    raise exception 'Elige un plantel de tu club';
  end if;
  case p_vigencia
    when '24h' then v_vence := v_publicado + interval '24 hours';
    when '3d' then v_vence := v_publicado + interval '72 hours';
    when '7d' then v_vence := v_publicado + interval '168 hours';
    when 'manual' then v_vence := null;
    else raise exception 'Elige una vigencia válida';
  end case;
  insert into public.avisos (club_id, equipo_id, autor_id, autor_nombre, titulo, mensaje, tipo, publicado_en, vence_en)
  select p.club_id, p_equipo_id, p.id, p.nombre, btrim(p_titulo),
         btrim(p_mensaje), p_tipo, v_publicado, v_vence
    from public.personas p where p.id = public.mi_persona_id()
  returning id into v_id;
  return v_id;
end;
$$;

create function public.aviso_editar(p_id uuid, p_titulo text, p_mensaje text, p_tipo text,
                                   p_equipo_id uuid, p_cambiar_vencimiento boolean,
                                   p_vence_en timestamptz, p_renotificar boolean,
                                   p_modificado_en timestamptz)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if not public.avisos_puedo_gestionar() then
    raise exception 'Solo Comunicaciones puede gestionar avisos' using errcode = '42501';
  end if;
  if p_equipo_id is not null and not exists (select 1 from public.avisos_planteles() where id = p_equipo_id) then
    raise exception 'Elige un plantel de tu club';
  end if;
  if p_cambiar_vencimiento and p_vence_en is not null
     and (not isfinite(p_vence_en) or p_vence_en <= statement_timestamp()) then
    raise exception 'El vencimiento debe ser una fecha futura';
  end if;
  update public.avisos
     set titulo = btrim(p_titulo), mensaje = btrim(p_mensaje), tipo = p_tipo, equipo_id = p_equipo_id,
         vence_en = case when p_cambiar_vencimiento then p_vence_en else vence_en end,
         version = version + case when p_renotificar then 1 else 0 end,
         modificado_en = clock_timestamp()
   where id = p_id and club_id = public.mi_club_id() and retirado_en is null
     and modificado_en is not distinct from p_modificado_en
  returning id into v_id;
  if not found then
    raise exception 'El aviso no está disponible o cambió. Cierra el editor y revisa el historial.';
  end if;
  return v_id;
end;
$$;

create function public.aviso_retirar(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.avisos_puedo_gestionar() then
    raise exception 'Solo Comunicaciones puede gestionar avisos' using errcode = '42501';
  end if;
  update public.avisos
     set retirado_en = statement_timestamp(), modificado_en = clock_timestamp()
   where id = p_id and club_id = public.mi_club_id() and retirado_en is null;
end;
$$;

create function public.avisos_historial(p_estado text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.avisos_puedo_gestionar() then
    raise exception 'Solo Comunicaciones puede consultar el historial' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'planteles', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'nombre', e.nombre) order by e.orden, e.nombre)
                            from public.avisos_planteles() e), '[]'::jsonb),
    'avisos', coalesce((select jsonb_agg(public.aviso_json(a, false) order by a.publicado_en desc, a.id)
                         from public.avisos a where a.club_id = public.mi_club_id()
                          and (p_estado is null or public.aviso_estado(a) = p_estado)), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.avisos_puedo_gestionar(), public.avisos_planteles(),
  public.aviso_estado(public.avisos), public.aviso_visible(public.avisos),
  public.aviso_json(public.avisos, boolean) from public, anon, authenticated;
revoke execute on function public.avisos_vigentes(), public.aviso_abrir(uuid),
  public.aviso_publicar(text, text, text, uuid, text),
  public.aviso_editar(uuid, text, text, text, uuid, boolean, timestamptz, boolean, timestamptz),
  public.aviso_retirar(uuid), public.avisos_historial(text) from public, anon, authenticated;
grant execute on function public.avisos_vigentes(), public.aviso_abrir(uuid),
  public.aviso_publicar(text, text, text, uuid, text),
  public.aviso_editar(uuid, text, text, text, uuid, boolean, timestamptz, boolean, timestamptz),
  public.aviso_retirar(uuid), public.avisos_historial(text) to authenticated;
