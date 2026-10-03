-- Jara App · 0011 · Entrenamientos: lista con cupos, pago por sesión y deudas
--
-- El entrenamiento es de todo el club. Un encargado abre la lista con su cupo
-- y sus precios; cada persona se inscribe y puede sumar invitados ("galletas").
-- El precio se fija al inscribirse: junior, senior o invitado. Quien se baja el
-- mismo día queda debiendo la multa. Lo que no se pagó de sesiones pasadas
-- aparece en "Deben".
--
-- Los pagos quedan a la vista de todo el club; los marcan los tesoreros, los
-- administradores y las personas a las que el club les dio ese permiso (por
-- ejemplo quien administra la cancha).

-- Permiso personal para marcar pagos de entrenamiento.
alter table public.personas add column cobra_entrenamientos boolean not null default false;

create table public.entrenamientos (
  id               uuid primary key default gen_random_uuid(),
  club_id          uuid not null references public.clubes(id) on delete cascade,
  fecha            date not null,
  hora_inicio      time,
  hora_fin         time,
  lugar            text,
  cupo             integer not null check (cupo > 0),
  precio_junior    integer not null default 0 check (precio_junior >= 0),
  precio_senior    integer not null default 0 check (precio_senior >= 0),
  precio_invitado  integer not null default 0 check (precio_invitado >= 0),
  -- Lo que se cobra a quien se baja el mismo día. 0 = sin multa.
  multa            integer not null default 0 check (multa >= 0),
  creado_por       uuid references public.personas(id) on delete set null,
  creado_en        timestamptz not null default now()
);
create index entrenamientos_club_fecha_idx on public.entrenamientos (club_id, fecha);

create table public.entrenamiento_inscritos (
  id                uuid primary key default gen_random_uuid(),
  entrenamiento_id  uuid not null references public.entrenamientos(id) on delete cascade,
  -- Una persona del club, o un invitado que alguien del club anotó.
  persona_id        uuid references public.personas(id) on delete cascade,
  invitado_nombre   text,
  invitado_por      uuid references public.personas(id) on delete set null,
  estado            text not null default 'inscrito' check (estado in ('inscrito', 'baja_tarde')),
  monto             integer not null check (monto >= 0),
  pagado            boolean not null default false,
  pago_marcado_por  uuid references public.personas(id) on delete set null,
  creado_en         timestamptz not null default now(),
  constraint persona_o_invitado check (
    (persona_id is not null and invitado_nombre is null)
    or (persona_id is null and length(trim(invitado_nombre)) > 0))
);
create unique index entrenamiento_una_vez_idx
  on public.entrenamiento_inscritos (entrenamiento_id, persona_id) where persona_id is not null;
create index entrenamiento_inscritos_idx on public.entrenamiento_inscritos (entrenamiento_id);

alter table public.entrenamientos          enable row level security;
alter table public.entrenamiento_inscritos enable row level security;
revoke all on public.entrenamientos, public.entrenamiento_inscritos from anon, authenticated;

-- Quién marca pagos: administradores, tesoreros de cualquier plantel y quienes
-- tienen el permiso personal.
create or replace function public.puedo_cobrar()
returns boolean language sql stable security definer set search_path = public as $$
  select public.soy_admin()
      or exists (select 1 from public.personas p
                  where p.id = public.mi_persona_id() and p.cobra_entrenamientos)
      or exists (select 1 from public.persona_equipos pe
                  where pe.persona_id = public.mi_persona_id() and pe.rol = 'tesorero');
$$;

-- Cuánto paga una persona: senior si juega en algún plantel senior, junior si
-- solo juega en junior, e invitado si no está en ningún plantel.
create or replace function public.entrenamiento_precio(e public.entrenamientos, p_persona uuid)
returns integer language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from public.persona_equipos pe join public.equipos q on q.id = pe.equipo_id
                  where pe.persona_id = p_persona and q.categoria = 'senior') then e.precio_senior
    when exists (select 1 from public.persona_equipos pe join public.equipos q on q.id = pe.equipo_id
                  where pe.persona_id = p_persona and q.categoria = 'junior') then e.precio_junior
    else e.precio_invitado end;
$$;

create or replace function public.entrenamiento_json(e public.entrenamientos)
returns jsonb language sql stable security definer set search_path = public as $$
  with filas as (
    select i.*, coalesce(p.nombre, i.invitado_nombre) as nombre,
           (select nombre from public.personas where id = i.invitado_por) as invita
      from public.entrenamiento_inscritos i left join public.personas p on p.id = i.persona_id
     where i.entrenamiento_id = e.id)
  select jsonb_build_object(
    'id', e.id, 'fecha', e.fecha,
    'hora_inicio', to_char(e.hora_inicio, 'HH24:MI'), 'hora_fin', to_char(e.hora_fin, 'HH24:MI'),
    'lugar', e.lugar, 'cupo', e.cupo,
    'precio_junior', e.precio_junior, 'precio_senior', e.precio_senior,
    'precio_invitado', e.precio_invitado, 'multa', e.multa,
    'mi_precio', public.entrenamiento_precio(e, public.mi_persona_id()),
    'inscritos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', f.id, 'persona_id', f.persona_id, 'nombre', f.nombre,
               'invitado', f.persona_id is null, 'invitado_por', f.invita,
               'es_mio', coalesce(f.persona_id = public.mi_persona_id(), false)
                         or coalesce(f.invitado_por = public.mi_persona_id(), false),
               'monto', f.monto, 'pagado', f.pagado) order by f.creado_en)
        from filas f where f.estado = 'inscrito'), '[]'::jsonb),
    'bajas_tarde', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', f.id, 'persona_id', f.persona_id, 'nombre', f.nombre,
               'monto', f.monto, 'pagado', f.pagado) order by f.creado_en)
        from filas f where f.estado = 'baja_tarde'), '[]'::jsonb));
$$;

-- El próximo entrenamiento abierto (hoy incluido), lo que quedó sin pagar de
-- los anteriores y qué puede hacer quien llama.
create or replace function public.entrenamiento_actual()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  e public.entrenamientos;
begin
  if public.mi_persona_id() is null then raise exception 'Tu cuenta no está en la nómina del club'; end if;
  select * into e from public.entrenamientos
   where club_id = public.mi_club_id() and fecha >= public.hoy()
   order by fecha, hora_inicio limit 1;
  return jsonb_build_object(
    'entrenamiento', case when e.id is not null then public.entrenamiento_json(e) end,
    'puedo_administrar', public.soy_encargado_de_alguno(),
    'puedo_cobrar', public.puedo_cobrar(),
    'deben', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', i.id, 'nombre', coalesce(p.nombre, i.invitado_nombre), 'fecha', a.fecha,
               'monto', i.monto, 'multa', i.estado = 'baja_tarde') order by a.fecha, i.creado_en)
        from public.entrenamiento_inscritos i
        join public.entrenamientos a on a.id = i.entrenamiento_id
        left join public.personas p on p.id = i.persona_id
       where a.club_id = public.mi_club_id() and a.fecha < public.hoy()
         and not i.pagado and i.monto > 0), '[]'::jsonb));
end;
$$;

-- Busca el entrenamiento y lo bloquea mientras se modifica la lista, para que
-- dos personas no se queden con el último cupo.
create or replace function public.entrenamiento_abierto(p_id uuid)
returns public.entrenamientos language plpgsql security definer set search_path = public as $$
declare
  e public.entrenamientos;
begin
  if public.mi_persona_id() is null then raise exception 'Tu cuenta no está en la nómina del club'; end if;
  select * into e from public.entrenamientos
   where id = p_id and club_id = public.mi_club_id() for update;
  if e.id is null then raise exception 'Ese entrenamiento no existe'; end if;
  if e.fecha < public.hoy() then raise exception 'Ese entrenamiento ya pasó'; end if;
  return e;
end;
$$;

create or replace function public.entrenamiento_cupos_libres(e public.entrenamientos)
returns integer language sql stable security definer set search_path = public as $$
  select e.cupo - (select count(*)::int from public.entrenamiento_inscritos
                    where entrenamiento_id = e.id and estado = 'inscrito');
$$;

create or replace function public.entrenamiento_inscribirme(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  e public.entrenamientos := public.entrenamiento_abierto(p_id);
  v_yo uuid := public.mi_persona_id();
begin
  if exists (select 1 from public.entrenamiento_inscritos
              where entrenamiento_id = e.id and persona_id = v_yo and estado = 'inscrito') then
    return;
  end if;
  if public.entrenamiento_cupos_libres(e) <= 0 then raise exception 'La lista está completa'; end if;
  insert into public.entrenamiento_inscritos (entrenamiento_id, persona_id, monto)
  values (e.id, v_yo, public.entrenamiento_precio(e, v_yo))
  on conflict (entrenamiento_id, persona_id) where persona_id is not null do update
     set estado = 'inscrito', monto = excluded.monto, pagado = false, pago_marcado_por = null;
end;
$$;

-- Sumar un invitado a la lista, a nombre de quien lo anota.
create or replace function public.entrenamiento_invitar(p_id uuid, p_nombre text)
returns void language plpgsql security definer set search_path = public as $$
declare
  e public.entrenamientos := public.entrenamiento_abierto(p_id);
begin
  if coalesce(length(trim(p_nombre)), 0) < 2 then raise exception 'Escribe el nombre del invitado'; end if;
  if public.entrenamiento_cupos_libres(e) <= 0 then raise exception 'La lista está completa'; end if;
  insert into public.entrenamiento_inscritos (entrenamiento_id, invitado_nombre, invitado_por, monto)
  values (e.id, trim(p_nombre), public.mi_persona_id(), e.precio_invitado);
end;
$$;

-- Bajar a alguien de la lista: uno mismo, su invitado, o un encargado a
-- cualquiera. Quien se baja (o baja a su invitado) el mismo día del
-- entrenamiento queda debiendo la multa; si lo saca un encargado, no.
create or replace function public.entrenamiento_bajar(p_inscrito uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  i public.entrenamiento_inscritos;
  e public.entrenamientos;
  v_yo uuid := public.mi_persona_id();
begin
  select * into i from public.entrenamiento_inscritos where id = p_inscrito;
  if i.id is null then raise exception 'Esa inscripción no existe'; end if;
  e := public.entrenamiento_abierto(i.entrenamiento_id);
  if i.estado <> 'inscrito' then
    return;
  end if;
  if not (coalesce(i.persona_id = v_yo, false) or coalesce(i.invitado_por = v_yo, false) or public.soy_encargado_de_alguno()) then
    raise exception 'Solo puedes bajarte tú o bajar a tus invitados';
  end if;
  if e.fecha = public.hoy() and e.multa > 0 and (coalesce(i.persona_id = v_yo, false) or coalesce(i.invitado_por = v_yo, false)) then
    update public.entrenamiento_inscritos
       set estado = 'baja_tarde', monto = e.multa, pagado = false, pago_marcado_por = null
     where id = i.id;
  else
    delete from public.entrenamiento_inscritos where id = i.id;
  end if;
end;
$$;

-- Marcar (o desmarcar) un pago, también de entrenamientos pasados.
create or replace function public.entrenamiento_pago(p_inscrito uuid, p_pagado boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.puedo_cobrar() then
    raise exception 'Solo los tesoreros y quienes cobran el entrenamiento marcan los pagos';
  end if;
  update public.entrenamiento_inscritos i
     set pagado = coalesce(p_pagado, false),
         pago_marcado_por = case when p_pagado then public.mi_persona_id() end
    from public.entrenamientos e
   where i.id = p_inscrito and e.id = i.entrenamiento_id and e.club_id = public.mi_club_id();
  if not found then raise exception 'Esa inscripción no existe'; end if;
end;
$$;

-- Abrir o corregir una lista de entrenamiento: encargados y administradores.
create or replace function public.entrenamiento_guardar(
  p_id uuid, p_fecha date, p_hora_inicio time, p_hora_fin time, p_lugar text, p_cupo integer,
  p_precio_junior integer, p_precio_senior integer, p_precio_invitado integer, p_multa integer default 0)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if not public.soy_encargado_de_alguno() then
    raise exception 'Solo los encargados abren las listas de entrenamiento';
  end if;
  if p_fecha is null then raise exception 'Falta la fecha'; end if;
  if p_cupo is null or p_cupo <= 0 then raise exception 'El cupo tiene que ser mayor que cero'; end if;

  if p_id is null then
    insert into public.entrenamientos
      (club_id, fecha, hora_inicio, hora_fin, lugar, cupo, precio_junior, precio_senior, precio_invitado, multa, creado_por)
    values (public.mi_club_id(), p_fecha, p_hora_inicio, p_hora_fin, nullif(trim(p_lugar), ''), p_cupo,
            coalesce(p_precio_junior, 0), coalesce(p_precio_senior, 0), coalesce(p_precio_invitado, 0),
            coalesce(p_multa, 0), public.mi_persona_id())
    returning id into v_id;
  else
    update public.entrenamientos
       set fecha = p_fecha, hora_inicio = p_hora_inicio, hora_fin = p_hora_fin,
           lugar = nullif(trim(p_lugar), ''), cupo = p_cupo,
           precio_junior = coalesce(p_precio_junior, 0), precio_senior = coalesce(p_precio_senior, 0),
           precio_invitado = coalesce(p_precio_invitado, 0), multa = coalesce(p_multa, 0)
     where id = p_id and club_id = public.mi_club_id()
    returning id into v_id;
    if v_id is null then raise exception 'Ese entrenamiento no existe'; end if;
  end if;
  return v_id;
end;
$$;

create or replace function public.entrenamiento_eliminar(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.soy_encargado_de_alguno() then
    raise exception 'Solo los encargados eliminan una lista de entrenamiento';
  end if;
  delete from public.entrenamientos where id = p_id and club_id = public.mi_club_id();
end;
$$;

revoke execute on function public.puedo_cobrar() from public, anon;
revoke execute on function public.entrenamiento_precio(public.entrenamientos, uuid) from public, anon, authenticated;
revoke execute on function public.entrenamiento_json(public.entrenamientos) from public, anon, authenticated;
revoke execute on function public.entrenamiento_abierto(uuid) from public, anon, authenticated;
revoke execute on function public.entrenamiento_cupos_libres(public.entrenamientos) from public, anon, authenticated;
revoke execute on function public.entrenamiento_actual() from public, anon;
revoke execute on function public.entrenamiento_inscribirme(uuid) from public, anon;
revoke execute on function public.entrenamiento_invitar(uuid, text) from public, anon;
revoke execute on function public.entrenamiento_bajar(uuid) from public, anon;
revoke execute on function public.entrenamiento_pago(uuid, boolean) from public, anon;
revoke execute on function public.entrenamiento_guardar(uuid, date, time, time, text, integer, integer, integer, integer, integer) from public, anon;
revoke execute on function public.entrenamiento_eliminar(uuid) from public, anon;
grant execute on function public.puedo_cobrar() to authenticated;
grant execute on function public.entrenamiento_actual() to authenticated;
grant execute on function public.entrenamiento_inscribirme(uuid) to authenticated;
grant execute on function public.entrenamiento_invitar(uuid, text) to authenticated;
grant execute on function public.entrenamiento_bajar(uuid) to authenticated;
grant execute on function public.entrenamiento_pago(uuid, boolean) to authenticated;
grant execute on function public.entrenamiento_guardar(uuid, date, time, time, text, integer, integer, integer, integer, integer) to authenticated;
grant execute on function public.entrenamiento_eliminar(uuid) to authenticated;
