-- Jara App · 0023 · Tesorería de cada plantel (Fase 5, primera versión)
--
-- Sale de la reunión con los tesoreros del 3/11. Cada plantel lleva su
-- tesorería en la app en vez de su planilla:
--
--   tes_cuotas      El plan de cobro del plantel en la temporada: una fila por
--                   cuota (inscripción, marzo, abril…) con su vencimiento y su
--                   monto. Lo edita el tesorero: cada plantel cobra distinto y
--                   el monto puede cambiar de un mes a otro.
--   tes_planes      Lo demás del plan: el % de aporte al club.
--   tes_jugadores   La condición de cada jugador en el plantel y temporada:
--                   normal, beca o descuento (%), exento ("galleta") o monto
--                   especial; deuda de la temporada anterior; contacto para
--                   cobrar y comentario.
--   tes_extras      Cargos sueltos (polera, asado, rifa) a uno o varios jugadores.
--   tes_pagos       Lo que pagó cada jugador. Un pago no se borra: se anula.
--   tes_movimientos La caja del plantel que no son cuotas: cuota a la liga o al
--                   club, entrenamientos, aporte, eventos. Pagado o programado.
--
-- Lo que se debe NO se guarda: se calcula en la app (cuotas del plan × la
-- condición del jugador + extras + deuda anterior − pagos), así un cambio de
-- monto se refleja al tiro y nunca hay dos cifras distintas.
--
-- Quién ve qué:
--   - Tesorero de un plantel (persona_equipos.rol = 'tesorero'): ve y edita
--     solo ese plantel.
--   - Administradores y Hacienda: ven y editan todos.
--   - Hacienda de prueba y tesorero de prueba (0022): ven, pero no cambian nada.
--   - Cada jugador: solo lo suyo, con mi_tesoreria().
-- Las tablas no se leen desde el navegador: todo pasa por funciones.
--
-- Compras no se toca: siguen ligadas a encargados y eventos, no a planteles.
--
-- Revisión: mueve plata y permisos. La revisan el administrador de la app y Hacienda.

-- ---------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------
create table public.tes_planes (
  equipo_id   uuid not null references public.equipos(id) on delete cascade,
  temporada   int  not null check (temporada between 2020 and 2100),
  aporte_pct  numeric(5,2) not null default 0 check (aporte_pct between 0 and 100),
  actualizado_en timestamptz not null default now(),
  primary key (equipo_id, temporada)
);

create table public.tes_cuotas (
  equipo_id  uuid not null references public.equipos(id) on delete cascade,
  temporada  int  not null check (temporada between 2020 and 2100),
  numero     int  not null check (numero between 0 and 24),
  nombre     text not null check (length(trim(nombre)) between 1 and 40),
  vence      date not null,
  monto      int  not null check (monto between 0 and 10000000),
  primary key (equipo_id, temporada, numero)
);

create table public.tes_jugadores (
  equipo_id       uuid not null references public.equipos(id) on delete cascade,
  temporada       int  not null check (temporada between 2020 and 2100),
  persona_id      uuid not null references public.personas(id) on delete cascade,
  activo          boolean not null default true,
  tipo            text not null default 'normal'
                  check (tipo in ('normal', 'beca', 'exento', 'especial')),
  descuento_pct   numeric(5,2) not null default 0 check (descuento_pct between 0 and 100),
  monto_especial  int check (monto_especial between 0 and 10000000),
  deuda_anterior  int not null default 0 check (deuda_anterior between 0 and 10000000),
  telefono        text check (length(telefono) <= 30),
  correo          text check (length(correo) <= 120),
  comentario      text check (length(comentario) <= 300),
  actualizado_en  timestamptz not null default now(),
  primary key (equipo_id, temporada, persona_id),
  constraint especial_con_monto check (tipo <> 'especial' or monto_especial is not null)
);
create index tes_jugadores_persona_idx on public.tes_jugadores (persona_id);

create table public.tes_extras (
  id          bigint generated always as identity primary key,
  equipo_id   uuid not null references public.equipos(id) on delete cascade,
  temporada   int  not null,
  persona_id  uuid not null references public.personas(id) on delete cascade,
  concepto    text not null check (length(trim(concepto)) between 1 and 80),
  monto       int  not null check (monto between 1 and 10000000),
  vence       date not null,
  creado_por  uuid references public.personas(id) on delete set null,
  creado_en   timestamptz not null default now()
);
create index tes_extras_idx on public.tes_extras (equipo_id, temporada);

create table public.tes_pagos (
  id             bigint generated always as identity primary key,
  equipo_id      uuid not null references public.equipos(id) on delete cascade,
  temporada      int  not null,
  persona_id     uuid not null references public.personas(id) on delete cascade,
  monto          int  not null check (monto between 1 and 10000000),
  fecha          date not null,
  medio          text not null check (medio in ('transferencia', 'efectivo', 'app', 'planilla', 'otro')),
  nota           text check (length(nota) <= 200),
  registrado_por uuid references public.personas(id) on delete set null,
  creado_en      timestamptz not null default now(),
  anulado_por    uuid references public.personas(id) on delete set null,
  anulado_en     timestamptz
);
create index tes_pagos_idx on public.tes_pagos (equipo_id, temporada);
create index tes_pagos_persona_idx on public.tes_pagos (persona_id);

create table public.tes_movimientos (
  id             bigint generated always as identity primary key,
  equipo_id      uuid not null references public.equipos(id) on delete cascade,
  temporada      int  not null,
  fecha          date not null,
  tipo           text not null check (tipo in ('ingreso', 'egreso')),
  categoria      text not null check (categoria in ('liga', 'club', 'entrenamiento', 'evento', 'uniformes', 'otro')),
  motivo         text not null check (length(trim(motivo)) between 1 and 120),
  monto          int  not null check (monto between 1 and 100000000),
  programado     boolean not null default false,
  registrado_por uuid references public.personas(id) on delete set null,
  creado_en      timestamptz not null default now()
);
create index tes_movimientos_idx on public.tes_movimientos (equipo_id, temporada);

alter table public.tes_planes      enable row level security;
alter table public.tes_cuotas      enable row level security;
alter table public.tes_jugadores   enable row level security;
alter table public.tes_extras      enable row level security;
alter table public.tes_pagos       enable row level security;
alter table public.tes_movimientos enable row level security;
revoke all on public.tes_planes, public.tes_cuotas, public.tes_jugadores, public.tes_extras,
              public.tes_pagos, public.tes_movimientos from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------------------------
create or replace function public.tes_soy_tesorero_de(p_equipo uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.persona_equipos pe
                  where pe.persona_id = public.mi_persona_id()
                    and pe.equipo_id = p_equipo and pe.rol = 'tesorero');
$$;

create or replace function public.tes_puedo_ver(p_equipo uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.equipos e where e.id = p_equipo and e.club_id = public.mi_club_id())
     and (public.puedo_mirar_hacienda() or public.tes_soy_tesorero_de(p_equipo));
$$;

-- puedo_aprobar_compras() ya deja fuera a Hacienda de prueba (0022).
create or replace function public.tes_puedo_editar(p_equipo uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.equipos e where e.id = p_equipo and e.club_id = public.mi_club_id())
     and not public.soy_cuenta_de_prueba()
     and (public.puedo_aprobar_compras() or public.tes_soy_tesorero_de(p_equipo));
$$;

create or replace function public.tes_exigir(p_equipo uuid)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not public.tes_puedo_editar(p_equipo) then
    if public.tes_puedo_ver(p_equipo) then
      raise exception 'Puedes mirar la tesorería de este plantel, pero no cambiarla';
    end if;
    raise exception 'Solo el tesorero del plantel, Hacienda o un administrador pueden hacer esto';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Leer
-- ---------------------------------------------------------------------------
-- Planteles que puedo ver, y si puedo editarlos. Vacío = no veo Tesorería.
create or replace function public.tes_planteles()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'nombre', e.nombre,
                                               'editar', public.tes_puedo_editar(e.id))
                            order by e.orden, e.nombre), '[]'::jsonb)
    from public.equipos e
   where e.club_id = public.mi_club_id() and public.tes_puedo_ver(e.id);
$$;

-- Todo lo de un plantel en una temporada. Los jugadores son los del plantel
-- (persona_equipos, rol jugador) más los que el tesorero sumó a mano.
create or replace function public.tes_ver(p_equipo uuid, p_temporada int)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.tes_puedo_ver(p_equipo) then
    raise exception 'Solo el tesorero del plantel, Hacienda o un administrador pueden ver esto';
  end if;
  return jsonb_build_object(
    'editar', public.tes_puedo_editar(p_equipo),
    'aporte_pct', coalesce((select aporte_pct from public.tes_planes where equipo_id = p_equipo and temporada = p_temporada), 0),
    'cuotas', coalesce((select jsonb_agg(jsonb_build_object('numero', numero, 'nombre', nombre, 'vence', vence, 'monto', monto) order by numero)
                          from public.tes_cuotas where equipo_id = p_equipo and temporada = p_temporada), '[]'::jsonb),
    'jugadores', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id, 'nombre', p.nombre,
               'en_plantel', exists (select 1 from public.persona_equipos pe where pe.persona_id = p.id and pe.equipo_id = p_equipo and pe.rol = 'jugador'),
               'activo', coalesce(tj.activo, true),
               'tipo', coalesce(tj.tipo, 'normal'),
               'descuento_pct', coalesce(tj.descuento_pct, 0),
               'monto_especial', tj.monto_especial,
               'deuda_anterior', coalesce(tj.deuda_anterior, 0),
               'telefono', coalesce(tj.telefono, pc.telefono),
               'correo', coalesce(tj.correo, pc.email),
               'comentario', tj.comentario,
               'con_cuenta', p.user_id is not null) order by p.nombre)
        from public.personas p
        left join public.tes_jugadores tj on tj.persona_id = p.id and tj.equipo_id = p_equipo and tj.temporada = p_temporada
        left join public.persona_contactos pc on pc.persona_id = p.id
       where p.estado <> 'inactivo'
         and (tj.persona_id is not null
              or exists (select 1 from public.persona_equipos pe where pe.persona_id = p.id and pe.equipo_id = p_equipo and pe.rol = 'jugador'))), '[]'::jsonb),
    'extras', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'persona', persona_id, 'concepto', concepto, 'monto', monto, 'vence', vence) order by vence, id)
                          from public.tes_extras where equipo_id = p_equipo and temporada = p_temporada), '[]'::jsonb),
    'pagos', coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'persona', g.persona_id, 'monto', g.monto, 'fecha', g.fecha,
                                                           'medio', g.medio, 'nota', g.nota, 'anulado', g.anulado_en is not null,
                                                           'registro', (select nombre from public.personas where id = g.registrado_por))
                                        order by g.fecha desc, g.id desc)
                         from public.tes_pagos g where g.equipo_id = p_equipo and g.temporada = p_temporada), '[]'::jsonb),
    'movimientos', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'fecha', fecha, 'tipo', tipo, 'categoria', categoria,
                                                                 'motivo', motivo, 'monto', monto, 'programado', programado)
                                              order by fecha desc, id desc)
                               from public.tes_movimientos where equipo_id = p_equipo and temporada = p_temporada), '[]'::jsonb));
end;
$$;

-- Para sumar a la tesorería a alguien de la nómina que no figura en el plantel.
create or replace function public.tes_buscar_personas(p_equipo uuid, p_texto text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.tes_exigir(p_equipo);
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'nombre', nombre) order by nombre)
                     from (select id, nombre from public.personas
                            where club_id = public.mi_club_id() and estado <> 'inactivo'
                              and nombre ilike '%' || coalesce(trim(p_texto), '') || '%'
                            order by nombre limit 20) s), '[]'::jsonb);
end;
$$;

-- Lo mío, para "Mi cuota": cada plantel en que juego o figuro en la tesorería,
-- con su plan, mi condición, mis extras y mis pagos. Nada de otros jugadores.
create or replace function public.mi_tesoreria(p_temporada int)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_yo uuid := public.mi_persona_id();
begin
  if v_yo is null then raise exception 'Tu cuenta no está en la nómina del club'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'equipo', e.id, 'nombre', e.nombre,
             'cuotas', coalesce((select jsonb_agg(jsonb_build_object('numero', numero, 'nombre', nombre, 'vence', vence, 'monto', monto) order by numero)
                                   from public.tes_cuotas c where c.equipo_id = e.id and c.temporada = p_temporada), '[]'::jsonb),
             'jugador', (select jsonb_build_object('id', v_yo, 'activo', coalesce(tj.activo, true), 'tipo', coalesce(tj.tipo, 'normal'),
                                                   'descuento_pct', coalesce(tj.descuento_pct, 0), 'monto_especial', tj.monto_especial,
                                                   'deuda_anterior', coalesce(tj.deuda_anterior, 0))
                           from (select 1) x
                           left join public.tes_jugadores tj on tj.equipo_id = e.id and tj.temporada = p_temporada and tj.persona_id = v_yo),
             'extras', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'persona', persona_id, 'concepto', concepto, 'monto', monto, 'vence', vence) order by vence, id)
                                   from public.tes_extras x where x.equipo_id = e.id and x.temporada = p_temporada and x.persona_id = v_yo), '[]'::jsonb),
             'pagos', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'persona', persona_id, 'monto', monto, 'fecha', fecha, 'medio', medio,
                                                                    'anulado', anulado_en is not null) order by fecha desc, id desc)
                                  from public.tes_pagos g where g.equipo_id = e.id and g.temporada = p_temporada and g.persona_id = v_yo), '[]'::jsonb))
           order by e.orden, e.nombre)
      from public.equipos e
     where e.club_id = public.mi_club_id()
       and exists (select 1 from public.tes_cuotas c where c.equipo_id = e.id and c.temporada = p_temporada)
       and (exists (select 1 from public.tes_jugadores tj where tj.equipo_id = e.id and tj.temporada = p_temporada and tj.persona_id = v_yo)
            or exists (select 1 from public.persona_equipos pe where pe.equipo_id = e.id and pe.persona_id = v_yo and pe.rol = 'jugador'))), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- Cambiar
-- ---------------------------------------------------------------------------
-- Reemplaza el plan de cuotas completo: [{numero, nombre, vence, monto}, …].
create or replace function public.tes_guardar_plan(p_equipo uuid, p_temporada int, p_cuotas jsonb, p_aporte_pct numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.tes_exigir(p_equipo);
  if jsonb_typeof(p_cuotas) <> 'array' then raise exception 'El plan de cuotas no viene bien'; end if;
  if jsonb_array_length(p_cuotas) > 25 then raise exception 'Máximo 25 cuotas por temporada'; end if;
  insert into public.tes_planes (equipo_id, temporada, aporte_pct) values (p_equipo, p_temporada, coalesce(p_aporte_pct, 0))
    on conflict (equipo_id, temporada) do update set aporte_pct = excluded.aporte_pct, actualizado_en = now();
  delete from public.tes_cuotas where equipo_id = p_equipo and temporada = p_temporada;
  insert into public.tes_cuotas (equipo_id, temporada, numero, nombre, vence, monto)
  select p_equipo, p_temporada, (c->>'numero')::int, trim(c->>'nombre'), (c->>'vence')::date, (c->>'monto')::int
    from jsonb_array_elements(p_cuotas) c;
end;
$$;

-- Condición y contacto de un jugador. p_datos: {activo, tipo, descuento_pct,
-- monto_especial, deuda_anterior, telefono, correo, comentario}. El correo de
-- acá es solo para cobrar: no cambia con qué correo entra la persona a la app.
create or replace function public.tes_guardar_jugador(p_equipo uuid, p_temporada int, p_persona uuid, p_datos jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_tipo text := coalesce(p_datos->>'tipo', 'normal');
begin
  perform public.tes_exigir(p_equipo);
  if not exists (select 1 from public.personas where id = p_persona and club_id = public.mi_club_id()) then
    raise exception 'Esa persona no está en la nómina del club';
  end if;
  insert into public.tes_jugadores as t (equipo_id, temporada, persona_id, activo, tipo, descuento_pct, monto_especial,
                                         deuda_anterior, telefono, correo, comentario)
  values (p_equipo, p_temporada, p_persona,
          coalesce((p_datos->>'activo')::boolean, true), v_tipo,
          case when v_tipo in ('normal', 'beca') then coalesce((p_datos->>'descuento_pct')::numeric, 0) else 0 end,
          case when v_tipo = 'especial' then (p_datos->>'monto_especial')::int end,
          coalesce((p_datos->>'deuda_anterior')::int, 0),
          nullif(trim(p_datos->>'telefono'), ''), nullif(lower(trim(p_datos->>'correo')), ''),
          nullif(trim(p_datos->>'comentario'), ''))
  on conflict (equipo_id, temporada, persona_id) do update set
    activo = excluded.activo, tipo = excluded.tipo, descuento_pct = excluded.descuento_pct,
    monto_especial = excluded.monto_especial, deuda_anterior = excluded.deuda_anterior,
    telefono = excluded.telefono, correo = excluded.correo, comentario = excluded.comentario,
    actualizado_en = now();
end;
$$;

create or replace function public.tes_registrar_pago(p_equipo uuid, p_temporada int, p_persona uuid, p_monto int,
                                                     p_fecha date, p_medio text, p_nota text)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_id bigint;
begin
  perform public.tes_exigir(p_equipo);
  if not exists (select 1 from public.personas where id = p_persona and club_id = public.mi_club_id()) then
    raise exception 'Esa persona no está en la nómina del club';
  end if;
  if p_monto is null or p_monto <= 0 then raise exception 'El monto tiene que ser mayor que cero'; end if;
  if p_fecha is null or p_fecha > current_date + 1 then raise exception 'La fecha del pago no puede ser futura'; end if;
  -- Quien paga queda en la tesorería del plantel aunque no esté en persona_equipos.
  insert into public.tes_jugadores (equipo_id, temporada, persona_id) values (p_equipo, p_temporada, p_persona)
    on conflict do nothing;
  insert into public.tes_pagos (equipo_id, temporada, persona_id, monto, fecha, medio, nota, registrado_por)
  values (p_equipo, p_temporada, p_persona, p_monto, p_fecha, p_medio, nullif(trim(p_nota), ''), public.mi_persona_id())
  returning id into v_id;
  return v_id;
end;
$$;

-- Un pago no se borra: queda anulado, con quién y cuándo.
create or replace function public.tes_anular_pago(p_pago bigint)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_equipo uuid;
begin
  select equipo_id into v_equipo from public.tes_pagos where id = p_pago and anulado_en is null;
  if v_equipo is null then raise exception 'Ese pago no existe o ya estaba anulado'; end if;
  perform public.tes_exigir(v_equipo);
  update public.tes_pagos set anulado_en = now(), anulado_por = public.mi_persona_id() where id = p_pago;
end;
$$;

-- Un mismo cargo extra (polera, asado…) a varios jugadores de una vez.
create or replace function public.tes_cargar_extra(p_equipo uuid, p_temporada int, p_personas uuid[],
                                                   p_concepto text, p_monto int, p_vence date)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_n int;
begin
  perform public.tes_exigir(p_equipo);
  if coalesce(cardinality(p_personas), 0) = 0 then raise exception 'Elige al menos un jugador'; end if;
  if exists (select 1 from unnest(p_personas) x(id)
              where not exists (select 1 from public.personas p where p.id = x.id and p.club_id = public.mi_club_id())) then
    raise exception 'Hay personas que no están en la nómina del club';
  end if;
  insert into public.tes_jugadores (equipo_id, temporada, persona_id)
  select p_equipo, p_temporada, x from unnest(p_personas) x on conflict do nothing;
  insert into public.tes_extras (equipo_id, temporada, persona_id, concepto, monto, vence, creado_por)
  select p_equipo, p_temporada, x, trim(p_concepto), p_monto, p_vence, public.mi_persona_id()
    from (select distinct unnest(p_personas) x) s;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

create or replace function public.tes_quitar_extra(p_extra bigint)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_equipo uuid;
begin
  select equipo_id into v_equipo from public.tes_extras where id = p_extra;
  if v_equipo is null then raise exception 'Ese cargo no existe'; end if;
  perform public.tes_exigir(v_equipo);
  delete from public.tes_extras where id = p_extra;
end;
$$;

-- Crea (p_id null) o corrige un movimiento de caja.
create or replace function public.tes_guardar_movimiento(p_equipo uuid, p_temporada int, p_id bigint, p_fecha date, p_tipo text,
                                                         p_categoria text, p_motivo text, p_monto int, p_programado boolean)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_id bigint := p_id;
begin
  perform public.tes_exigir(p_equipo);
  if v_id is null then
    insert into public.tes_movimientos (equipo_id, temporada, fecha, tipo, categoria, motivo, monto, programado, registrado_por)
    values (p_equipo, p_temporada, p_fecha, p_tipo, p_categoria, trim(p_motivo), p_monto, coalesce(p_programado, false), public.mi_persona_id())
    returning id into v_id;
  else
    update public.tes_movimientos
       set fecha = p_fecha, tipo = p_tipo, categoria = p_categoria, motivo = trim(p_motivo), monto = p_monto,
           programado = coalesce(p_programado, false)
     where id = v_id and equipo_id = p_equipo;
    if not found then raise exception 'Ese movimiento no es de este plantel'; end if;
  end if;
  return v_id;
end;
$$;

create or replace function public.tes_quitar_movimiento(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_equipo uuid;
begin
  select equipo_id into v_equipo from public.tes_movimientos where id = p_id;
  if v_equipo is null then raise exception 'Ese movimiento no existe'; end if;
  perform public.tes_exigir(v_equipo);
  delete from public.tes_movimientos where id = p_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Permisos de las funciones
-- ---------------------------------------------------------------------------
revoke execute on function public.tes_soy_tesorero_de(uuid) from public, anon, authenticated;
revoke execute on function public.tes_puedo_ver(uuid) from public, anon, authenticated;
revoke execute on function public.tes_puedo_editar(uuid) from public, anon, authenticated;
revoke execute on function public.tes_exigir(uuid) from public, anon, authenticated;

revoke execute on function public.tes_planteles() from public, anon;
revoke execute on function public.tes_ver(uuid, int) from public, anon;
revoke execute on function public.tes_buscar_personas(uuid, text) from public, anon;
revoke execute on function public.mi_tesoreria(int) from public, anon;
revoke execute on function public.tes_guardar_plan(uuid, int, jsonb, numeric) from public, anon;
revoke execute on function public.tes_guardar_jugador(uuid, int, uuid, jsonb) from public, anon;
revoke execute on function public.tes_registrar_pago(uuid, int, uuid, int, date, text, text) from public, anon;
revoke execute on function public.tes_anular_pago(bigint) from public, anon;
revoke execute on function public.tes_cargar_extra(uuid, int, uuid[], text, int, date) from public, anon;
revoke execute on function public.tes_quitar_extra(bigint) from public, anon;
revoke execute on function public.tes_guardar_movimiento(uuid, int, bigint, date, text, text, text, int, boolean) from public, anon;
revoke execute on function public.tes_quitar_movimiento(bigint) from public, anon;

grant execute on function public.tes_planteles() to authenticated;
grant execute on function public.tes_ver(uuid, int) to authenticated;
grant execute on function public.tes_buscar_personas(uuid, text) to authenticated;
grant execute on function public.mi_tesoreria(int) to authenticated;
grant execute on function public.tes_guardar_plan(uuid, int, jsonb, numeric) to authenticated;
grant execute on function public.tes_guardar_jugador(uuid, int, uuid, jsonb) to authenticated;
grant execute on function public.tes_registrar_pago(uuid, int, uuid, int, date, text, text) to authenticated;
grant execute on function public.tes_anular_pago(bigint) to authenticated;
grant execute on function public.tes_cargar_extra(uuid, int, uuid[], text, int, date) to authenticated;
grant execute on function public.tes_quitar_extra(bigint) to authenticated;
grant execute on function public.tes_guardar_movimiento(uuid, int, bigint, date, text, text, text, int, boolean) to authenticated;
grant execute on function public.tes_quitar_movimiento(bigint) to authenticated;
