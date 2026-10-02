-- Jara App · 0005 · Pedidos de compra por link
--
-- Una lista por evento donde cada persona agrega lo que quiere comprar con su
-- cotización y su referencia. La suma es lo que se le pide a Hacienda.
--
-- Se entra con un link, sin cuenta: el pedido tiene un código para quienes
-- piden y otro para Hacienda. Nadie lee ni escribe las tablas directamente;
-- todo pasa por las funciones de abajo, que revisan el código.

create table public.pedidos (
  id              uuid primary key default gen_random_uuid(),
  club_id         uuid not null references public.clubes(id) on delete cascade,
  nombre          text not null check (length(trim(nombre)) > 0),
  -- Código del link para quienes piden y código del link de Hacienda.
  token           text not null unique default replace(gen_random_uuid()::text, '-', ''),
  token_hacienda  text not null unique default replace(gen_random_uuid()::text, '-', ''),
  -- Carpeta de los archivos en Storage. Es distinta de los códigos para que la
  -- dirección de un archivo no revele el link del pedido.
  carpeta         text not null unique default replace(gen_random_uuid()::text, '-', ''),
  abierto         boolean not null default true,
  creado_en       timestamptz not null default now()
);

create table public.pedido_items (
  id                 uuid primary key default gen_random_uuid(),
  pedido_id          uuid not null references public.pedidos(id) on delete cascade,
  quien              text not null check (length(trim(quien)) > 0),
  que                text not null check (length(trim(que)) > 0),
  monto              integer not null check (monto > 0),          -- pesos chilenos
  cotizacion_ruta    text not null,
  cotizacion_nombre  text not null,
  -- La referencia es un link o contacto, un archivo, o ambos.
  referencia         text,
  referencia_ruta    text,
  referencia_nombre  text,
  estado             text not null default 'pendiente'
                     check (estado in ('pendiente', 'aprobado', 'devuelto', 'entregado', 'respaldado')),
  comentario         text,
  boleta_ruta        text,
  boleta_nombre      text,
  creado_en          timestamptz not null default now(),
  actualizado_en     timestamptz not null default now(),
  constraint con_referencia check (coalesce(length(trim(referencia)), 0) > 0 or referencia_ruta is not null)
);
create index pedido_items_pedido_idx on public.pedido_items (pedido_id, creado_en);

-- Historial: qué pasó con cada compra y cuándo.
create table public.pedido_item_eventos (
  id          bigint generated always as identity primary key,
  item_id     uuid not null references public.pedido_items(id) on delete cascade,
  de_estado   text,
  a_estado    text not null,
  por         text not null check (por in ('solicitante', 'hacienda')),
  comentario  text,
  creado_en   timestamptz not null default now()
);
create index pedido_item_eventos_item_idx on public.pedido_item_eventos (item_id);

alter table public.pedidos             enable row level security;
alter table public.pedido_items        enable row level security;
alter table public.pedido_item_eventos enable row level security;
revoke all on public.pedidos, public.pedido_items, public.pedido_item_eventos from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Funciones (lo único que la página puede llamar)
-- ---------------------------------------------------------------------------

-- Devuelve el pedido completo. Sirve con cualquiera de los dos códigos.
create or replace function public.pedido_ver(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v public.pedidos;
begin
  select * into v from public.pedidos where token = p_token or token_hacienda = p_token;
  if v.id is null then
    raise exception 'Este link no es válido';
  end if;
  return jsonb_build_object(
    'nombre', v.nombre,
    'abierto', v.abierto,
    'es_hacienda', v.token_hacienda = p_token,
    'carpeta', v.carpeta,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', i.id, 'quien', i.quien, 'que', i.que, 'monto', i.monto,
               'cotizacion_ruta', i.cotizacion_ruta, 'cotizacion_nombre', i.cotizacion_nombre,
               'referencia', i.referencia,
               'referencia_ruta', i.referencia_ruta, 'referencia_nombre', i.referencia_nombre,
               'estado', i.estado, 'comentario', i.comentario,
               'boleta_ruta', i.boleta_ruta, 'boleta_nombre', i.boleta_nombre,
               'creado_en', i.creado_en) order by i.creado_en)
        from public.pedido_items i where i.pedido_id = v.id), '[]'::jsonb));
end;
$$;

-- Revisa los datos de una compra antes de guardarla o corregirla.
create or replace function public.pedido_validar(
  v public.pedidos, p_quien text, p_que text, p_monto integer,
  p_cotizacion_ruta text, p_referencia text, p_referencia_ruta text)
returns void language plpgsql immutable set search_path = public as $$
begin
  if not v.abierto then
    raise exception 'Este pedido ya está cerrado';
  end if;
  if coalesce(length(trim(p_quien)), 0) = 0 then raise exception 'Falta tu nombre'; end if;
  if coalesce(length(trim(p_que)), 0) = 0 then raise exception 'Falta decir qué quieres comprar'; end if;
  if p_monto is null or p_monto <= 0 then raise exception 'El monto tiene que ser mayor que cero'; end if;
  if p_cotizacion_ruta is null or p_cotizacion_ruta not like v.carpeta || '/%' then
    raise exception 'Falta adjuntar la cotización';
  end if;
  if coalesce(length(trim(p_referencia)), 0) = 0 and p_referencia_ruta is null then
    raise exception 'Falta la referencia: un link, un contacto o un archivo';
  end if;
  if p_referencia_ruta is not null and p_referencia_ruta not like v.carpeta || '/%' then
    raise exception 'El archivo de referencia no pertenece a este pedido';
  end if;
end;
$$;

create or replace function public.pedido_agregar(
  p_token text, p_quien text, p_que text, p_monto integer,
  p_cotizacion_ruta text, p_cotizacion_nombre text,
  p_referencia text default null, p_referencia_ruta text default null, p_referencia_nombre text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v public.pedidos;
  v_id uuid;
begin
  select * into v from public.pedidos where token = p_token or token_hacienda = p_token;
  if v.id is null then raise exception 'Este link no es válido'; end if;
  perform public.pedido_validar(v, p_quien, p_que, p_monto, p_cotizacion_ruta, p_referencia, p_referencia_ruta);

  insert into public.pedido_items
    (pedido_id, quien, que, monto, cotizacion_ruta, cotizacion_nombre, referencia, referencia_ruta, referencia_nombre)
  values
    (v.id, trim(p_quien), trim(p_que), p_monto, p_cotizacion_ruta, coalesce(p_cotizacion_nombre, 'cotización'),
     nullif(trim(p_referencia), ''), p_referencia_ruta, p_referencia_nombre)
  returning id into v_id;

  insert into public.pedido_item_eventos (item_id, de_estado, a_estado, por)
  values (v_id, null, 'pendiente', 'solicitante');
  return v_id;
end;
$$;

-- Corregir una compra devuelta: vuelve a quedar por revisar.
create or replace function public.pedido_corregir(
  p_token text, p_item uuid, p_quien text, p_que text, p_monto integer,
  p_cotizacion_ruta text, p_cotizacion_nombre text,
  p_referencia text default null, p_referencia_ruta text default null, p_referencia_nombre text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.pedidos;
  v_item public.pedido_items;
begin
  select * into v from public.pedidos where token = p_token or token_hacienda = p_token;
  if v.id is null then raise exception 'Este link no es válido'; end if;
  select * into v_item from public.pedido_items where id = p_item and pedido_id = v.id;
  if v_item.id is null then raise exception 'Esa compra no está en este pedido'; end if;
  if v_item.estado <> 'devuelto' then raise exception 'Solo se puede corregir una compra devuelta'; end if;
  perform public.pedido_validar(v, p_quien, p_que, p_monto, p_cotizacion_ruta, p_referencia, p_referencia_ruta);

  update public.pedido_items
     set quien = trim(p_quien), que = trim(p_que), monto = p_monto,
         cotizacion_ruta = p_cotizacion_ruta, cotizacion_nombre = coalesce(p_cotizacion_nombre, 'cotización'),
         referencia = nullif(trim(p_referencia), ''),
         referencia_ruta = p_referencia_ruta, referencia_nombre = p_referencia_nombre,
         estado = 'pendiente', comentario = null, actualizado_en = now()
   where id = p_item;
  insert into public.pedido_item_eventos (item_id, de_estado, a_estado, por)
  values (p_item, 'devuelto', 'pendiente', 'solicitante');
end;
$$;

-- Hacienda aprueba, devuelve (con motivo) o marca la plata como entregada.
create or replace function public.pedido_revisar(
  p_token text, p_item uuid, p_accion text, p_comentario text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.pedidos;
  v_item public.pedido_items;
  v_nuevo text;
begin
  select * into v from public.pedidos where token_hacienda = p_token;
  if v.id is null then raise exception 'Solo Hacienda puede revisar las compras'; end if;
  select * into v_item from public.pedido_items where id = p_item and pedido_id = v.id;
  if v_item.id is null then raise exception 'Esa compra no está en este pedido'; end if;

  if p_accion = 'aprobar' and v_item.estado = 'pendiente' then
    v_nuevo := 'aprobado';
  elsif p_accion = 'devolver' and v_item.estado in ('pendiente', 'aprobado') then
    if coalesce(length(trim(p_comentario)), 0) = 0 then
      raise exception 'Hay que escribir qué falta o qué corregir';
    end if;
    v_nuevo := 'devuelto';
  elsif p_accion = 'entregar' and v_item.estado = 'aprobado' then
    v_nuevo := 'entregado';
  else
    raise exception 'No se puede "%" una compra que está "%"', p_accion, v_item.estado;
  end if;

  update public.pedido_items
     set estado = v_nuevo,
         comentario = case when v_nuevo = 'devuelto' then trim(p_comentario) else null end,
         actualizado_en = now()
   where id = p_item;
  insert into public.pedido_item_eventos (item_id, de_estado, a_estado, por, comentario)
  values (p_item, v_item.estado, v_nuevo, 'hacienda', nullif(trim(p_comentario), ''));
end;
$$;

-- Subir la boleta de una compra cuya plata ya se entregó.
create or replace function public.pedido_boleta(p_token text, p_item uuid, p_ruta text, p_nombre text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.pedidos;
  v_item public.pedido_items;
begin
  select * into v from public.pedidos where token = p_token or token_hacienda = p_token;
  if v.id is null then raise exception 'Este link no es válido'; end if;
  select * into v_item from public.pedido_items where id = p_item and pedido_id = v.id;
  if v_item.id is null then raise exception 'Esa compra no está en este pedido'; end if;
  if v_item.estado <> 'entregado' then
    raise exception 'La boleta se sube cuando la plata ya fue entregada';
  end if;
  if p_ruta is null or p_ruta not like v.carpeta || '/%' then
    raise exception 'Falta el archivo de la boleta';
  end if;

  update public.pedido_items
     set estado = 'respaldado', boleta_ruta = p_ruta, boleta_nombre = coalesce(p_nombre, 'boleta'),
         actualizado_en = now()
   where id = p_item;
  insert into public.pedido_item_eventos (item_id, de_estado, a_estado, por)
  values (p_item, 'entregado', 'respaldado', 'solicitante');
end;
$$;

-- Para la regla de Storage: ¿esta carpeta es de un pedido abierto?
create or replace function public.pedido_carpeta_abierta(p_carpeta text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.pedidos where carpeta = p_carpeta and abierto);
$$;

revoke execute on function public.pedido_validar(public.pedidos, text, text, integer, text, text, text) from public, anon, authenticated;
revoke execute on function public.pedido_ver(text) from public;
revoke execute on function public.pedido_agregar(text, text, text, integer, text, text, text, text, text) from public;
revoke execute on function public.pedido_corregir(text, uuid, text, text, integer, text, text, text, text, text) from public;
revoke execute on function public.pedido_revisar(text, uuid, text, text) from public;
revoke execute on function public.pedido_boleta(text, uuid, text, text) from public;
revoke execute on function public.pedido_carpeta_abierta(text) from public;
grant execute on function public.pedido_ver(text) to anon, authenticated;
grant execute on function public.pedido_agregar(text, text, text, integer, text, text, text, text, text) to anon, authenticated;
grant execute on function public.pedido_corregir(text, uuid, text, text, integer, text, text, text, text, text) to anon, authenticated;
grant execute on function public.pedido_revisar(text, uuid, text, text) to anon, authenticated;
grant execute on function public.pedido_boleta(text, uuid, text, text) to anon, authenticated;
grant execute on function public.pedido_carpeta_abierta(text) to anon, authenticated;
