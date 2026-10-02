-- Jara App · 0002 · Cotizaciones: solicitudes de compra con aprobación de Hacienda
--
-- Flujo:  borrador → enviada → aprobada → comprada → cerrada
--                      ↓  ↑
--                    devuelta (con motivo; el solicitante corrige y reenvía)
--
-- Las reglas viven en la base, no en la pantalla: una solicitud no se puede
-- enviar sin cotización adjunta ni marcar como comprada sin boleta, aunque
-- alguien se salte la app.

create sequence public.solicitud_compra_codigo_seq;

create table public.solicitudes_compra (
  id                uuid primary key default gen_random_uuid(),
  club_id           uuid not null references public.clubes(id) on delete cascade,
  codigo            text not null unique
                    default ('SC-' || lpad(nextval('public.solicitud_compra_codigo_seq')::text, 3, '0')),
  solicitante_id    uuid not null references public.personas(id),
  area_id           uuid references public.areas(id) on delete set null,
  -- Qué se quiere comprar y para qué actividad.
  descripcion       text not null check (length(trim(descripcion)) > 0),
  actividad         text not null check (length(trim(actividad)) > 0),
  monto             integer not null check (monto > 0),          -- pesos chilenos
  proveedor         text,
  -- Link del producto o dato de contacto del proveedor.
  referencia        text not null check (length(trim(referencia)) > 0),
  fecha_necesaria   date not null,
  estado            text not null default 'borrador'
                    check (estado in ('borrador', 'enviada', 'devuelta', 'aprobada', 'comprada', 'cerrada')),
  motivo_devolucion text,
  resuelta_por      uuid references public.personas(id),
  resuelta_en       timestamptz,
  creado_en         timestamptz not null default now(),
  actualizado_en    timestamptz not null default now()
);
create index solicitudes_compra_club_estado_idx on public.solicitudes_compra (club_id, estado);
create index solicitudes_compra_solicitante_idx on public.solicitudes_compra (solicitante_id);

create table public.solicitud_adjuntos (
  id             uuid primary key default gen_random_uuid(),
  solicitud_id   uuid not null references public.solicitudes_compra(id) on delete cascade,
  tipo           text not null check (tipo in ('cotizacion', 'boleta')),
  ruta           text not null,           -- ruta del archivo en Storage (bucket "compras")
  nombre_archivo text not null,
  subido_por     uuid not null references public.personas(id),
  creado_en      timestamptz not null default now()
);
create index solicitud_adjuntos_solicitud_idx on public.solicitud_adjuntos (solicitud_id);

-- Historial: quién movió la solicitud, de qué estado a cuál y cuándo.
create table public.solicitud_eventos (
  id            bigint generated always as identity primary key,
  solicitud_id  uuid not null references public.solicitudes_compra(id) on delete cascade,
  de_estado     text,
  a_estado      text not null,
  persona_id    uuid references public.personas(id),
  comentario    text,
  creado_en     timestamptz not null default now()
);
create index solicitud_eventos_solicitud_idx on public.solicitud_eventos (solicitud_id);

-- ---------------------------------------------------------------------------
-- Reglas del flujo
-- ---------------------------------------------------------------------------
create or replace function public.solicitud_antes_de_insertar()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    return new;                      -- carga administrativa, sin sesión de usuario
  end if;
  if public.mi_persona_id() is null then
    raise exception 'Tu cuenta no está en la nómina del club';
  end if;
  new.solicitante_id    := public.mi_persona_id();
  new.club_id           := public.mi_club_id();
  new.estado            := 'borrador';
  new.motivo_devolucion := null;
  new.resuelta_por      := null;
  new.resuelta_en       := null;
  return new;
end;
$$;
create trigger solicitud_antes_de_insertar
  before insert on public.solicitudes_compra
  for each row execute function public.solicitud_antes_de_insertar();

create or replace function public.solicitud_antes_de_actualizar()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_yo           uuid    := public.mi_persona_id();
  v_solicitante  boolean := (v_yo = old.solicitante_id);
  v_aprobador    boolean := public.puedo_aprobar_compras();
  v_contenido_cambia boolean :=
       new.descripcion     is distinct from old.descripcion
    or new.actividad       is distinct from old.actividad
    or new.monto           is distinct from old.monto
    or new.proveedor       is distinct from old.proveedor
    or new.referencia      is distinct from old.referencia
    or new.fecha_necesaria is distinct from old.fecha_necesaria
    or new.area_id         is distinct from old.area_id;
begin
  new.actualizado_en := now();

  if auth.uid() is null then
    return new;                      -- mantención administrativa
  end if;

  -- Campos que nadie cambia desde la app.
  if new.solicitante_id is distinct from old.solicitante_id
     or new.club_id is distinct from old.club_id
     or new.codigo  is distinct from old.codigo then
    raise exception 'No se puede cambiar el solicitante, el club ni el código';
  end if;

  -- El contenido solo lo edita quien pidió, y solo antes de enviar o tras una devolución.
  if v_contenido_cambia and not (v_solicitante and old.estado in ('borrador', 'devuelta')) then
    raise exception 'La solicitud ya fue enviada y no se puede modificar';
  end if;

  if new.estado = old.estado then
    if new.motivo_devolucion is distinct from old.motivo_devolucion
       or new.resuelta_por   is distinct from old.resuelta_por
       or new.resuelta_en    is distinct from old.resuelta_en then
      raise exception 'Esos campos solo cambian junto con el estado';
    end if;
    return new;
  end if;

  -- Transiciones permitidas
  if old.estado in ('borrador', 'devuelta') and new.estado = 'enviada' then
    if not v_solicitante then
      raise exception 'Solo quien creó la solicitud puede enviarla';
    end if;
    if not exists (select 1 from public.solicitud_adjuntos
                    where solicitud_id = new.id and tipo = 'cotizacion') then
      raise exception 'Falta adjuntar la cotización';
    end if;
    new.motivo_devolucion := null;
    new.resuelta_por := null;
    new.resuelta_en  := null;

  elsif old.estado = 'enviada' and new.estado = 'aprobada' then
    if not v_aprobador then
      raise exception 'Solo Hacienda puede aprobar una compra';
    end if;
    new.motivo_devolucion := null;
    new.resuelta_por := v_yo;
    new.resuelta_en  := now();

  elsif old.estado = 'enviada' and new.estado = 'devuelta' then
    if not v_aprobador then
      raise exception 'Solo Hacienda puede devolver una solicitud';
    end if;
    if new.motivo_devolucion is null or length(trim(new.motivo_devolucion)) = 0 then
      raise exception 'Hay que escribir el motivo de la devolución';
    end if;
    new.resuelta_por := v_yo;
    new.resuelta_en  := now();

  elsif old.estado = 'aprobada' and new.estado = 'comprada' then
    if not (v_solicitante or v_aprobador) then
      raise exception 'Solo quien pidió la compra o Hacienda puede marcarla como comprada';
    end if;
    if not exists (select 1 from public.solicitud_adjuntos
                    where solicitud_id = new.id and tipo = 'boleta') then
      raise exception 'Falta subir la boleta';
    end if;

  elsif old.estado = 'comprada' and new.estado = 'cerrada' then
    if not v_aprobador then
      raise exception 'Solo Hacienda puede cerrar una compra';
    end if;

  else
    raise exception 'No se puede pasar de "%" a "%"', old.estado, new.estado;
  end if;

  return new;
end;
$$;
create trigger solicitud_antes_de_actualizar
  before update on public.solicitudes_compra
  for each row execute function public.solicitud_antes_de_actualizar();

create or replace function public.solicitud_registrar_evento()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.solicitud_eventos (solicitud_id, de_estado, a_estado, persona_id)
    values (new.id, null, new.estado, public.mi_persona_id());
  elsif new.estado is distinct from old.estado then
    insert into public.solicitud_eventos (solicitud_id, de_estado, a_estado, persona_id, comentario)
    values (new.id, old.estado, new.estado, public.mi_persona_id(),
            case when new.estado = 'devuelta' then new.motivo_devolucion end);
  end if;
  return null;
end;
$$;
create trigger solicitud_registrar_evento
  after insert or update on public.solicitudes_compra
  for each row execute function public.solicitud_registrar_evento();

-- Los adjuntos se suben en el momento que corresponde: la cotización antes de
-- enviar (o tras una devolución) y la boleta cuando la compra está aprobada.
create or replace function public.adjunto_antes_de_insertar()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_sol public.solicitudes_compra;
begin
  if auth.uid() is null then
    return new;
  end if;
  select * into v_sol from public.solicitudes_compra where id = new.solicitud_id;
  if v_sol.id is null then
    raise exception 'La solicitud no existe';
  end if;
  new.subido_por := public.mi_persona_id();

  if new.tipo = 'cotizacion' then
    if not (v_sol.solicitante_id = new.subido_por and v_sol.estado in ('borrador', 'devuelta')) then
      raise exception 'La cotización solo se adjunta antes de enviar la solicitud';
    end if;
  else
    if not (v_sol.estado = 'aprobada'
            and (v_sol.solicitante_id = new.subido_por or public.puedo_aprobar_compras())) then
      raise exception 'La boleta se sube cuando la compra está aprobada';
    end if;
  end if;
  return new;
end;
$$;
create trigger adjunto_antes_de_insertar
  before insert on public.solicitud_adjuntos
  for each row execute function public.adjunto_antes_de_insertar();

-- ---------------------------------------------------------------------------
-- Permisos por fila: una solicitud la ven quien la pidió y Hacienda.
-- ---------------------------------------------------------------------------
alter table public.solicitudes_compra enable row level security;
alter table public.solicitud_adjuntos enable row level security;
alter table public.solicitud_eventos  enable row level security;

create policy "ver solicitudes propias o como Hacienda" on public.solicitudes_compra
  for select to authenticated
  using (club_id = public.mi_club_id()
         and (solicitante_id = public.mi_persona_id() or public.puedo_aprobar_compras()));

create policy "crear solicitud propia" on public.solicitudes_compra
  for insert to authenticated
  with check (club_id = public.mi_club_id() and solicitante_id = public.mi_persona_id());

create policy "mover solicitud propia o como Hacienda" on public.solicitudes_compra
  for update to authenticated
  using (club_id = public.mi_club_id()
         and (solicitante_id = public.mi_persona_id() or public.puedo_aprobar_compras()))
  with check (club_id = public.mi_club_id());

create policy "borrar borrador propio" on public.solicitudes_compra
  for delete to authenticated
  using (solicitante_id = public.mi_persona_id() and estado = 'borrador');

create policy "ver adjuntos de solicitudes visibles" on public.solicitud_adjuntos
  for select to authenticated
  using (exists (select 1 from public.solicitudes_compra s where s.id = solicitud_id));

create policy "adjuntar a solicitudes visibles" on public.solicitud_adjuntos
  for insert to authenticated
  with check (exists (select 1 from public.solicitudes_compra s where s.id = solicitud_id));

create policy "quitar cotización propia antes de enviar" on public.solicitud_adjuntos
  for delete to authenticated
  using (subido_por = public.mi_persona_id() and exists (
    select 1 from public.solicitudes_compra s
     where s.id = solicitud_id and s.estado in ('borrador', 'devuelta')));

create policy "ver historial de solicitudes visibles" on public.solicitud_eventos
  for select to authenticated
  using (exists (select 1 from public.solicitudes_compra s where s.id = solicitud_id));

revoke all on public.solicitudes_compra, public.solicitud_adjuntos, public.solicitud_eventos from anon;
grant select, insert, update, delete on public.solicitudes_compra to authenticated;
grant select, insert, delete          on public.solicitud_adjuntos to authenticated;
grant select                          on public.solicitud_eventos  to authenticated;
grant usage on sequence public.solicitud_compra_codigo_seq to authenticated;
