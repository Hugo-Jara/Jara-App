-- Jara App · 0031 · Fotos de cada partido, enlazadas a su carpeta del Drive
--
-- Pedido del administrador (4/11): las fotos de los partidos ya están en el
-- Drive del fotógrafo de la liga, ordenadas por torneo, fecha y partido
-- ("Junior Clausura / Fecha 7 / Rival vs Hugo Jara Jr"). La app no copia las
-- fotos: guarda a qué carpeta corresponde cada partido y las muestra desde ahí.
--
--   - Un partido tiene a lo más una carpeta, y una carpeta es de un solo partido.
--   - Se guarda solo el id de la carpeta (el que va en el link) y su nombre,
--     para mostrarlo. Nada de datos personales.
--   - Lo ve todo el club. Lo enlaza o lo quita el encargado (capitán) del
--     plantel o un administrador (igual que editar el partido).
--   - El detector de la app propone la carpeta; una persona confirma. La base
--     no lee el Drive.
--
-- No toca las funciones de partidos (partidos_proximos y partidos_jugados): las
-- pantallas piden los enlaces aparte con fotos_enlaces().
--
-- Revisión: tabla y permisos nuevos. La revisa el administrador de la app.

create table public.partido_fotos (
  partido_id     uuid primary key references public.partidos(id) on delete cascade,
  carpeta_id     text not null unique check (carpeta_id ~ '^[A-Za-z0-9_-]{10,100}$'),
  carpeta_nombre text check (carpeta_nombre is null or length(carpeta_nombre) <= 200),
  enlazado_por   uuid references public.personas(id) on delete set null,
  enlazado_en    timestamptz not null default now()
);

alter table public.partido_fotos enable row level security;
revoke all on public.partido_fotos from anon, authenticated;

-- Los enlaces de los partidos del club, con si yo los puedo cambiar.
create or replace function public.fotos_enlaces()
returns table (partido_id uuid, carpeta_id text, carpeta_nombre text, puedo_cambiar boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if public.mi_persona_id() is null then
    raise exception 'Tu cuenta no está en la nómina del club';
  end if;
  return query
    select f.partido_id, f.carpeta_id, f.carpeta_nombre, public.soy_encargado(p.equipo_id)
      from public.partido_fotos f
      join public.partidos p on p.id = f.partido_id
     where p.club_id = public.mi_club_id();
end;
$$;

-- Busca el partido y revisa que yo pueda cambiar sus fotos.
create or replace function public.fotos_exigir(p_partido uuid)
returns void language plpgsql stable security definer set search_path = public as $$
declare
  v_equipo uuid;
begin
  select equipo_id into v_equipo from public.partidos
   where id = p_partido and club_id = public.mi_club_id();
  if v_equipo is null then
    raise exception 'No encontramos ese partido';
  end if;
  if not public.soy_encargado(v_equipo) then
    raise exception 'Solo el capitán del plantel o un administrador enlaza las fotos';
  end if;
end;
$$;

-- Enlaza (o cambia) la carpeta de fotos de un partido.
create or replace function public.fotos_enlazar(p_partido uuid, p_carpeta text, p_nombre text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_carpeta text := trim(coalesce(p_carpeta, ''));
  v_otro uuid;
begin
  perform public.fotos_exigir(p_partido);
  if v_carpeta !~ '^[A-Za-z0-9_-]{10,100}$' then
    raise exception 'Ese link no parece una carpeta del Drive';
  end if;
  select partido_id into v_otro from public.partido_fotos
   where carpeta_id = v_carpeta and partido_id <> p_partido;
  if v_otro is not null then
    raise exception 'Esa carpeta ya está enlazada a otro partido';
  end if;
  insert into public.partido_fotos (partido_id, carpeta_id, carpeta_nombre, enlazado_por)
  values (p_partido, v_carpeta, nullif(left(trim(coalesce(p_nombre, '')), 200), ''), public.mi_persona_id())
  on conflict (partido_id) do update
    set carpeta_id = excluded.carpeta_id, carpeta_nombre = excluded.carpeta_nombre,
        enlazado_por = excluded.enlazado_por, enlazado_en = now();
end;
$$;

-- Quita la carpeta de un partido (las fotos siguen en el Drive).
create or replace function public.fotos_desenlazar(p_partido uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.fotos_exigir(p_partido);
  delete from public.partido_fotos where partido_id = p_partido;
end;
$$;

revoke execute on function public.fotos_enlaces() from public, anon;
revoke execute on function public.fotos_exigir(uuid) from public, anon, authenticated;
revoke execute on function public.fotos_enlazar(uuid, text, text) from public, anon;
revoke execute on function public.fotos_desenlazar(uuid) from public, anon;
grant execute on function public.fotos_enlaces() to authenticated;
grant execute on function public.fotos_enlazar(uuid, text, text) to authenticated;
grant execute on function public.fotos_desenlazar(uuid) to authenticated;
