-- Jara App · 0010 · Partidos y asistencia
--
-- Reemplaza la lista que se arma copiando y pegando en WhatsApp. El encargado
-- del plantel crea el partido; cada jugador de ese plantel responde voy, duda
-- o baja, con un comentario y si se queda al tercer tiempo. Quien juega en dos
-- planteles ve los partidos de los dos.
--
-- Todo el club puede mirar las listas; solo se responde en los partidos del
-- plantel propio.

create table public.partidos (
  id             uuid primary key default gen_random_uuid(),
  club_id        uuid not null references public.clubes(id) on delete cascade,
  equipo_id      uuid not null references public.equipos(id) on delete cascade,
  rival          text not null check (length(trim(rival)) > 0),
  torneo         text,
  fecha          date not null,
  citacion       time,
  cancha         text,
  -- Qué hay después del partido ("Asado después del partido"). Vacío = nada.
  tercer_tiempo  text,
  creado_por     uuid references public.personas(id) on delete set null,
  creado_en      timestamptz not null default now()
);
create index partidos_club_fecha_idx on public.partidos (club_id, fecha);

create table public.partido_respuestas (
  partido_id      uuid not null references public.partidos(id) on delete cascade,
  persona_id      uuid not null references public.personas(id) on delete cascade,
  estado          text not null check (estado in ('voy', 'duda', 'baja')),
  nota            text check (nota is null or length(nota) <= 80),
  tercer_tiempo   boolean not null default false,
  actualizado_en  timestamptz not null default now(),
  primary key (partido_id, persona_id)
);

alter table public.partidos           enable row level security;
alter table public.partido_respuestas enable row level security;
revoke all on public.partidos, public.partido_respuestas from anon, authenticated;

-- El día de hoy en Chile: un partido sigue "próximo" hasta que termina su día.
create or replace function public.hoy()
returns date language sql stable set search_path = public as $$
  select (now() at time zone 'America/Santiago')::date;
$$;

-- Un partido con su lista completa, visto por quien llama.
create or replace function public.partido_json(p public.partidos)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', p.id, 'equipo_id', p.equipo_id,
    'equipo', (select nombre from public.equipos where id = p.equipo_id),
    'rival', p.rival, 'torneo', p.torneo, 'fecha', p.fecha,
    'citacion', to_char(p.citacion, 'HH24:MI'), 'cancha', p.cancha, 'tercer_tiempo', p.tercer_tiempo,
    'es_mio', exists (select 1 from public.persona_equipos pe
                       where pe.persona_id = public.mi_persona_id() and pe.equipo_id = p.equipo_id),
    'puedo_editar', public.soy_encargado(p.equipo_id),
    -- El plantel completo, para saber quién falta por responder.
    'plantel', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'nombre', s.nombre) order by s.nombre)
        from (select distinct pr.id, pr.nombre
                from public.persona_equipos pe join public.personas pr on pr.id = pe.persona_id
               where pe.equipo_id = p.equipo_id and pr.estado = 'activo') s), '[]'::jsonb),
    'respuestas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'persona_id', r.persona_id, 'nombre', pr.nombre, 'estado', r.estado,
               'nota', r.nota, 'tercer_tiempo', r.tercer_tiempo) order by r.actualizado_en)
        from public.partido_respuestas r join public.personas pr on pr.id = r.persona_id
       where r.partido_id = p.id), '[]'::jsonb));
$$;

-- Los partidos que vienen en el club: primero los de mis planteles.
create or replace function public.partidos_proximos()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if public.mi_persona_id() is null then raise exception 'Tu cuenta no está en la nómina del club'; end if;
  return coalesce((
    select jsonb_agg(x order by not (x->>'es_mio')::boolean, x->>'fecha', x->>'citacion')
      from (select public.partido_json(p) as x from public.partidos p
             where p.club_id = public.mi_club_id() and p.fecha >= public.hoy()) s), '[]'::jsonb);
end;
$$;

-- Responder (o quitar la respuesta, con p_estado vacío) en un partido de mi plantel.
create or replace function public.partido_responder(
  p_partido uuid, p_estado text, p_nota text default null, p_tercer_tiempo boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare
  p public.partidos;
  v_yo uuid := public.mi_persona_id();
begin
  select * into p from public.partidos where id = p_partido and club_id = public.mi_club_id();
  if p.id is null then raise exception 'Ese partido no existe'; end if;
  if not exists (select 1 from public.persona_equipos where persona_id = v_yo and equipo_id = p.equipo_id) then
    raise exception 'Ese partido es de otro plantel';
  end if;
  if p.fecha < public.hoy() then raise exception 'Ese partido ya se jugó'; end if;

  if p_estado is null then
    delete from public.partido_respuestas where partido_id = p.id and persona_id = v_yo;
    return;
  end if;
  if p_estado not in ('voy', 'duda', 'baja') then raise exception 'Respuesta no válida'; end if;
  insert into public.partido_respuestas (partido_id, persona_id, estado, nota, tercer_tiempo)
  values (p.id, v_yo, p_estado, nullif(left(trim(p_nota), 80), ''),
          p_estado = 'voy' and coalesce(p_tercer_tiempo, false) and p.tercer_tiempo is not null)
  on conflict (partido_id, persona_id) do update
     set estado = excluded.estado, nota = excluded.nota,
         tercer_tiempo = excluded.tercer_tiempo, actualizado_en = now();
end;
$$;

-- Crear o corregir un partido: el encargado del plantel o un administrador.
create or replace function public.partido_guardar(
  p_id uuid, p_equipo uuid, p_rival text, p_fecha date,
  p_citacion time default null, p_cancha text default null,
  p_torneo text default null, p_tercer_tiempo text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if not exists (select 1 from public.equipos where id = p_equipo and club_id = public.mi_club_id())
     or not public.soy_encargado(p_equipo) then
    raise exception 'Solo el encargado del plantel puede programar sus partidos';
  end if;
  if coalesce(length(trim(p_rival)), 0) = 0 then raise exception 'Falta el rival'; end if;
  if p_fecha is null then raise exception 'Falta la fecha'; end if;

  if p_id is null then
    insert into public.partidos (club_id, equipo_id, rival, torneo, fecha, citacion, cancha, tercer_tiempo, creado_por)
    values (public.mi_club_id(), p_equipo, trim(p_rival), nullif(trim(p_torneo), ''), p_fecha, p_citacion,
            nullif(trim(p_cancha), ''), nullif(trim(p_tercer_tiempo), ''), public.mi_persona_id())
    returning id into v_id;
  else
    -- El plantel de un partido no se cambia: las respuestas son de ese plantel.
    update public.partidos
       set rival = trim(p_rival), torneo = nullif(trim(p_torneo), ''), fecha = p_fecha, citacion = p_citacion,
           cancha = nullif(trim(p_cancha), ''), tercer_tiempo = nullif(trim(p_tercer_tiempo), '')
     where id = p_id and equipo_id = p_equipo and club_id = public.mi_club_id()
    returning id into v_id;
    if v_id is null then raise exception 'Ese partido no existe'; end if;
  end if;
  return v_id;
end;
$$;

create or replace function public.partido_eliminar(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  p public.partidos;
begin
  select * into p from public.partidos where id = p_id and club_id = public.mi_club_id();
  if p.id is null or not public.soy_encargado(p.equipo_id) then
    raise exception 'Solo el encargado del plantel puede eliminar sus partidos';
  end if;
  delete from public.partidos where id = p.id;
end;
$$;

revoke execute on function public.hoy() from public, anon;
revoke execute on function public.partido_json(public.partidos) from public, anon, authenticated;
revoke execute on function public.partidos_proximos() from public, anon;
revoke execute on function public.partido_responder(uuid, text, text, boolean) from public, anon;
revoke execute on function public.partido_guardar(uuid, uuid, text, date, time, text, text, text) from public, anon;
revoke execute on function public.partido_eliminar(uuid) from public, anon;
grant execute on function public.hoy() to authenticated;
grant execute on function public.partidos_proximos() to authenticated;
grant execute on function public.partido_responder(uuid, text, text, boolean) to authenticated;
grant execute on function public.partido_guardar(uuid, uuid, text, date, time, text, text, text) to authenticated;
grant execute on function public.partido_eliminar(uuid) to authenticated;
