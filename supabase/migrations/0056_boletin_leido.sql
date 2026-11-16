-- 0056 · El Jara Informa: quién ya leyó cada edición.
--
-- Inicio muestra la edición nueva arriba de todo hasta que la persona la lee.
-- Después baja, bajo sus partidos y su entrenamiento. Cada edición nueva
-- vuelve a subir hasta que se lee. Se guarda en la base para que valga en
-- todos los dispositivos de la persona (celular, computador, la app instalada).
--
-- Solo agrega una tabla y dos funciones; no cambia nada de la 0050.

create table if not exists public.boletin_lecturas (
  persona_id uuid not null references public.personas(id) on delete cascade,
  edicion_id uuid not null references public.boletin_ediciones(id) on delete cascade,
  leida_en   timestamptz not null default now(),
  primary key (persona_id, edicion_id)
);

alter table public.boletin_lecturas enable row level security;
revoke all on public.boletin_lecturas from anon, authenticated;

-- ¿Ya leí esta edición? Falso si no existe o no es de mi club.
create or replace function public.boletin_leida(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.boletin_lecturas l
      join public.boletin_ediciones e on e.id = l.edicion_id
     where l.persona_id = public.mi_persona_id()
       and l.edicion_id = p_id
       and e.club_id = public.mi_club_id());
$$;

-- Marco que leí una edición publicada de mi club. Repetirlo no hace nada.
create or replace function public.boletin_marcar_leida(p_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_yo uuid := public.mi_persona_id();
begin
  if v_yo is null then return false; end if;
  if not exists (select 1 from public.boletin_ediciones e
                  where e.id = p_id and e.club_id = public.mi_club_id()
                    and e.estado = 'publicada') then
    return false;
  end if;
  insert into public.boletin_lecturas (persona_id, edicion_id)
  values (v_yo, p_id) on conflict do nothing;
  return true;
end;
$$;

revoke execute on function public.boletin_leida(uuid) from public, anon;
revoke execute on function public.boletin_marcar_leida(uuid) from public, anon;
grant execute on function public.boletin_leida(uuid) to authenticated;
grant execute on function public.boletin_marcar_leida(uuid) to authenticated;
