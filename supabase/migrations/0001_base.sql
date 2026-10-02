-- Jara App · 0001 · Base del club: personas, roles, equipos y áreas (ministerios)
--
-- Un solo club por ahora, pero cada tabla cuelga de `clubes` para poder
-- replicar la app en otros clubes sin rehacer la base.

-- ---------------------------------------------------------------------------
-- Club
-- ---------------------------------------------------------------------------
create table public.clubes (
  id             uuid primary key default gen_random_uuid(),
  nombre         text not null,
  slug           text not null unique,
  -- Cómo llama este club a sus áreas internas: "Ministerio", "Comisión", "Área"…
  etiqueta_area  text not null default 'Ministerio',
  creado_en      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Personas (la nómina). Existen antes de que la persona entre a la app:
-- se cargan con su correo y se enlazan a su cuenta la primera vez que ingresa.
-- ---------------------------------------------------------------------------
create table public.personas (
  id         uuid primary key default gen_random_uuid(),
  club_id    uuid not null references public.clubes(id) on delete cascade,
  user_id    uuid unique references auth.users(id) on delete set null,
  nombre     text not null,
  estado     text not null default 'activo'
             check (estado in ('activo', 'ex_jugador', 'inactivo')),
  es_admin   boolean not null default false,
  creado_en  timestamptz not null default now()
);
create index personas_club_idx on public.personas (club_id);

-- Datos de contacto aparte: el nombre lo ve todo el club, el correo y el
-- teléfono solo la propia persona y los administradores.
create table public.persona_contactos (
  persona_id  uuid primary key references public.personas(id) on delete cascade,
  email       text,
  telefono    text,
  constraint email_en_minusculas check (email is null or email = lower(email))
);
create unique index persona_contactos_email_idx
  on public.persona_contactos (email) where email is not null;

-- ---------------------------------------------------------------------------
-- Equipos (los planteles de tesorería) y áreas (ministerios, secretarías)
-- ---------------------------------------------------------------------------
create table public.equipos (
  id       uuid primary key default gen_random_uuid(),
  club_id  uuid not null references public.clubes(id) on delete cascade,
  nombre   text not null,
  orden    int not null default 0,
  unique (club_id, nombre)
);

create table public.persona_equipos (
  persona_id  uuid not null references public.personas(id) on delete cascade,
  equipo_id   uuid not null references public.equipos(id) on delete cascade,
  rol         text not null default 'jugador'
              check (rol in ('jugador', 'encargado', 'tesorero')),
  primary key (persona_id, equipo_id, rol)
);

create table public.areas (
  id               uuid primary key default gen_random_uuid(),
  club_id          uuid not null references public.clubes(id) on delete cascade,
  nombre           text not null,
  descripcion      text,
  -- El área que aprueba las compras del club (Hacienda).
  aprueba_compras  boolean not null default false,
  orden            int not null default 0,
  unique (club_id, nombre)
);

create table public.persona_areas (
  persona_id  uuid not null references public.personas(id) on delete cascade,
  area_id     uuid not null references public.areas(id) on delete cascade,
  rol         text not null default 'integrante'
              check (rol in ('ministro', 'integrante')),
  primary key (persona_id, area_id)
);

-- ---------------------------------------------------------------------------
-- Funciones de identidad. SECURITY DEFINER para poder usarlas dentro de las
-- políticas sin que estas se llamen a sí mismas.
-- ---------------------------------------------------------------------------
create or replace function public.mi_persona_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.personas where user_id = auth.uid() and estado <> 'inactivo';
$$;

create or replace function public.mi_club_id()
returns uuid language sql stable security definer set search_path = public as $$
  select club_id from public.personas where user_id = auth.uid() and estado <> 'inactivo';
$$;

create or replace function public.soy_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select es_admin from public.personas where user_id = auth.uid() and estado <> 'inactivo'),
    false);
$$;

create or replace function public.puedo_aprobar_compras()
returns boolean language sql stable security definer set search_path = public as $$
  select public.soy_admin() or exists (
    select 1
      from public.persona_areas pa
      join public.areas a on a.id = pa.area_id
     where pa.persona_id = public.mi_persona_id()
       and pa.rol = 'ministro'
       and a.aprueba_compras
  );
$$;

-- Enlaza la cuenta recién ingresada con su fila de la nómina, por correo.
-- La app la llama después de cada ingreso. Devuelve el id de la persona, o
-- null si el correo no está en la nómina.
create or replace function public.vincular_persona()
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_email    text := lower(auth.jwt() ->> 'email');
  v_persona  uuid;
begin
  if auth.uid() is null then
    return null;
  end if;

  select id into v_persona from public.personas where user_id = auth.uid();
  if v_persona is not null then
    return v_persona;
  end if;

  update public.personas p
     set user_id = auth.uid()
    from public.persona_contactos c
   where c.persona_id = p.id
     and c.email = v_email
     and p.user_id is null
     and p.estado <> 'inactivo'
  returning p.id into v_persona;

  return v_persona;
end;
$$;

-- ---------------------------------------------------------------------------
-- Permisos por fila
-- ---------------------------------------------------------------------------
alter table public.clubes            enable row level security;
alter table public.personas          enable row level security;
alter table public.persona_contactos enable row level security;
alter table public.equipos           enable row level security;
alter table public.persona_equipos   enable row level security;
alter table public.areas             enable row level security;
alter table public.persona_areas     enable row level security;

-- Todo el club ve la estructura; solo los administradores la modifican.
create policy "el club ve su club" on public.clubes
  for select to authenticated using (id = public.mi_club_id());
create policy "admin edita el club" on public.clubes
  for update to authenticated using (id = public.mi_club_id() and public.soy_admin())
  with check (id = public.mi_club_id() and public.soy_admin());

create policy "el club ve su nómina" on public.personas
  for select to authenticated using (club_id = public.mi_club_id());
create policy "admin administra la nómina" on public.personas
  for all to authenticated using (club_id = public.mi_club_id() and public.soy_admin())
  with check (club_id = public.mi_club_id() and public.soy_admin());

create policy "cada uno ve su contacto" on public.persona_contactos
  for select to authenticated
  using (persona_id = public.mi_persona_id() or public.soy_admin());
create policy "cada uno edita su teléfono" on public.persona_contactos
  for update to authenticated
  using (persona_id = public.mi_persona_id())
  with check (persona_id = public.mi_persona_id());
create policy "admin administra contactos" on public.persona_contactos
  for all to authenticated
  using (public.soy_admin() and exists (
    select 1 from public.personas p
     where p.id = persona_id and p.club_id = public.mi_club_id()))
  with check (public.soy_admin() and exists (
    select 1 from public.personas p
     where p.id = persona_id and p.club_id = public.mi_club_id()));

create policy "el club ve sus equipos" on public.equipos
  for select to authenticated using (club_id = public.mi_club_id());
create policy "admin administra equipos" on public.equipos
  for all to authenticated using (club_id = public.mi_club_id() and public.soy_admin())
  with check (club_id = public.mi_club_id() and public.soy_admin());

create policy "el club ve quién juega dónde" on public.persona_equipos
  for select to authenticated using (exists (
    select 1 from public.equipos e
     where e.id = equipo_id and e.club_id = public.mi_club_id()));
create policy "admin administra planteles" on public.persona_equipos
  for all to authenticated
  using (public.soy_admin() and exists (
    select 1 from public.equipos e
     where e.id = equipo_id and e.club_id = public.mi_club_id()))
  with check (public.soy_admin() and exists (
    select 1 from public.equipos e
     where e.id = equipo_id and e.club_id = public.mi_club_id()));

create policy "el club ve sus áreas" on public.areas
  for select to authenticated using (club_id = public.mi_club_id());
create policy "admin administra áreas" on public.areas
  for all to authenticated using (club_id = public.mi_club_id() and public.soy_admin())
  with check (club_id = public.mi_club_id() and public.soy_admin());

create policy "el club ve quién está en cada área" on public.persona_areas
  for select to authenticated using (exists (
    select 1 from public.areas a
     where a.id = area_id and a.club_id = public.mi_club_id()));
create policy "admin administra integrantes de áreas" on public.persona_areas
  for all to authenticated
  using (public.soy_admin() and exists (
    select 1 from public.areas a
     where a.id = area_id and a.club_id = public.mi_club_id()))
  with check (public.soy_admin() and exists (
    select 1 from public.areas a
     where a.id = area_id and a.club_id = public.mi_club_id()));

-- El correo de la nómina no se cambia desde la app: es lo que decide quién
-- entra. Una persona solo puede corregir su teléfono.
create or replace function public.proteger_email_contacto()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.email is distinct from old.email and not public.soy_admin() then
    raise exception 'Solo un administrador puede cambiar el correo de la nómina';
  end if;
  return new;
end;
$$;
create trigger proteger_email_contacto
  before update on public.persona_contactos
  for each row execute function public.proteger_email_contacto();

-- Nadie entra sin cuenta: se quita todo acceso al rol anónimo.
revoke all on all tables in schema public from anon;
grant select, insert, update, delete on
  public.clubes, public.personas, public.persona_contactos, public.equipos,
  public.persona_equipos, public.areas, public.persona_areas
  to authenticated;

revoke execute on function public.mi_persona_id()          from public, anon;
revoke execute on function public.mi_club_id()             from public, anon;
revoke execute on function public.soy_admin()              from public, anon;
revoke execute on function public.puedo_aprobar_compras()  from public, anon;
revoke execute on function public.vincular_persona()       from public, anon;
grant execute on function public.mi_persona_id()           to authenticated;
grant execute on function public.mi_club_id()              to authenticated;
grant execute on function public.soy_admin()               to authenticated;
grant execute on function public.puedo_aprobar_compras()   to authenticated;
grant execute on function public.vincular_persona()        to authenticated;
