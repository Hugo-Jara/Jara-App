-- Jara App · 0021 · Fondo Las Condes 2026 (Compras 2)
--
-- Hasta ahora /fondo era una vista previa con datos en memoria. Desde ahora el
-- fondo se lleva de verdad, con cuenta:
--
--   - Presupuesto: los cuatro ítems del formulario de postulación, con su monto
--     aprobado (tabla fondo_items). Si la Municipalidad aprobó otro monto, se
--     corrige la fila; no hay que tocar la app.
--   - Gastos del fondo (fondo_gastos): cada compra que se carga al fondo, con
--     su ítem, proveedor, N° de boleta o factura, fecha y cómo se pagó.
--     Las compras se siguen pidiendo por Compras, en el tópico "Fondo" (se
--     activa en esta migración). El equipo del fondo las pasa al fondo
--     eligiendo el ítem; la cotización, la boleta y el comprobante de
--     transferencia que ya están en Compras cuentan como respaldo solos.
--   - Honorarios del entrenador: quedan creadas las tres cuotas (oct, nov y dic).
--   - Respaldos (fondo_respaldos): la lista de cada gasto sale del reglamento.
--     Se marcan con o sin archivo; los archivos van al bucket privado 'fondo'.
--     La nómina de entrega y el original firmado NO aceptan archivo: la nómina
--     trae cédula y domicilio de los participantes y queda solo en papel.
--   - Documentos del fondo (cartola del depósito y comprobante de ingreso) y
--     las dos rendiciones. Al presentar una rendición entran todos los gastos
--     que en ese momento están listos para rendir, y quedan amarrados a ella.
--
-- Quién ve y trabaja el fondo: administradores, Hacienda y quien tenga el
-- permiso personal 'equipo_fondo' (por ejemplo, el administrador del fondo y
-- el presidente). Se da en Supabase: Table Editor > personas > equipo_fondo.
-- Nadie más ve nada: ni los montos, ni los gastos, ni los archivos.
--
-- Revisión: mueve plata. La revisan el administrador de la app y Hacienda.

-- ---------------------------------------------------------------------------
-- Quién puede
-- ---------------------------------------------------------------------------
alter table public.personas add column equipo_fondo boolean not null default false;

create or replace function public.puedo_ver_fondo()
returns boolean language sql stable security definer set search_path = public as $$
  select public.puedo_aprobar_compras()
      or exists (select 1 from public.personas p
                  where p.id = public.mi_persona_id() and p.equipo_fondo);
$$;

-- Para que la app sepa si mostrar el fondo en "Más". No revela nada más.
create or replace function public.fondo_acceso()
returns boolean language sql stable security definer set search_path = public as $$
  select public.mi_persona_id() is not null and public.puedo_ver_fondo();
$$;

create or replace function public.fondo_exigir()
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if public.mi_persona_id() is null then raise exception 'Tu cuenta no está en la nómina del club'; end if;
  if not public.puedo_ver_fondo() then raise exception 'Solo el equipo del fondo puede ver y cambiar el fondo'; end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------
create table public.fondo_items (
  club_id   uuid not null references public.clubes(id) on delete cascade,
  slug      text not null check (slug in ('personal', 'bienes', 'materiales', 'otros')),
  nombre    text not null,
  detalle   text,
  aprobado  integer not null check (aprobado >= 0),
  orden     integer not null,
  primary key (club_id, slug)
);

create table public.fondo_rendiciones (
  club_id        uuid not null references public.clubes(id) on delete cascade,
  numero         integer not null check (numero > 0),
  nombre         text not null,
  plazo          text,
  presentada_en  timestamptz,
  presentada_por uuid references public.personas(id) on delete set null,
  subida         boolean not null default false,
  primary key (club_id, numero)
);

create table public.fondo_gastos (
  id             uuid primary key default gen_random_uuid(),
  club_id        uuid not null references public.clubes(id) on delete cascade,
  item           text not null,
  -- La compra de Compras de donde viene, si viene de ahí. Una compra entra al
  -- fondo una sola vez.
  compra_id      uuid unique references public.pedido_items(id) on delete set null,
  que            text not null check (length(trim(que)) between 1 and 200),
  monto          integer not null check (monto > 0 and monto <= 5000000),
  proveedor      text check (length(proveedor) <= 120),
  documento      text check (length(documento) <= 40),
  fecha          date,
  pago           text check (pago in ('transferencia', 'debito', 'particular')),
  entrega        boolean not null default false,
  -- Mes de la cuota, solo para los honorarios (10, 11 o 12).
  mes            integer check (mes between 1 and 12),
  rendicion      integer,
  eliminado      boolean not null default false,
  creado_por     uuid references public.personas(id) on delete set null,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  foreign key (club_id, item) references public.fondo_items (club_id, slug),
  foreign key (club_id, rendicion) references public.fondo_rendiciones (club_id, numero)
);
create index fondo_gastos_club_idx on public.fondo_gastos (club_id) where not eliminado;

create table public.fondo_respaldos (
  gasto_id     uuid not null references public.fondo_gastos(id) on delete cascade,
  tipo         text not null,
  ruta         text,
  nombre       text,
  marcado_por  uuid references public.personas(id) on delete set null,
  marcado_en   timestamptz not null default now(),
  primary key (gasto_id, tipo)
);

create table public.fondo_documentos (
  club_id      uuid not null references public.clubes(id) on delete cascade,
  slug         text not null,
  nombre       text not null,
  nota         text,
  orden        integer not null,
  listo        boolean not null default false,
  ruta         text,
  archivo      text,
  primary key (club_id, slug)
);

alter table public.fondo_items       enable row level security;
alter table public.fondo_rendiciones enable row level security;
alter table public.fondo_gastos      enable row level security;
alter table public.fondo_respaldos   enable row level security;
alter table public.fondo_documentos  enable row level security;
revoke all on public.fondo_items, public.fondo_rendiciones, public.fondo_gastos,
              public.fondo_respaldos, public.fondo_documentos from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Datos del fondo (formulario de postulación, sección 3)
-- ---------------------------------------------------------------------------
insert into public.fondo_items (club_id, slug, nombre, detalle, aprobado, orden)
select c.id, t.slug, t.nombre, t.detalle, t.aprobado, t.orden
  from public.clubes c,
       (values ('personal', 'Personal (honorarios)', 'Entrenador, 3 cuotas de $212.500 (oct–dic)', 637500, 1),
               ('bienes', 'Bienes e infraestructura', 'Balones, cintas de goma, conos y vallas, poleras de entrenamiento', 1848000, 2),
               ('materiales', 'Materiales de trabajo', 'Sin monto aprobado', 0, 3),
               ('otros', 'Otros gastos', 'Bebidas isotónicas, botiquín e insumos médicos', 602000, 4))
         as t(slug, nombre, detalle, aprobado, orden)
 where c.slug = 'hugo-jara';

insert into public.fondo_rendiciones (club_id, numero, nombre, plazo)
select c.id, t.numero, t.nombre, t.plazo
  from public.clubes c,
       (values (1, 'Rendición 1', 'Dos meses desde que llega la plata'),
               (2, 'Rendición 2 (final)', 'Antes del 30 de diciembre')) as t(numero, nombre, plazo)
 where c.slug = 'hugo-jara';

insert into public.fondo_documentos (club_id, slug, nombre, nota, orden)
select c.id, t.slug, t.nombre, t.nota, t.orden
  from public.clubes c,
       (values ('cartola', 'Cartola con el depósito del fondo', 'Art. 23', 1),
               ('ingreso', 'Comprobante de ingreso firmado', 'Firmado por el representante legal (art. 2)', 2))
         as t(slug, nombre, nota, orden)
 where c.slug = 'hugo-jara';

insert into public.fondo_gastos (club_id, item, que, monto, proveedor, mes)
select c.id, 'personal', 'Honorarios entrenador · ' || t.nombre, 212500, 'Entrenador', t.mes
  from public.clubes c, (values (10, 'octubre'), (11, 'noviembre'), (12, 'diciembre')) as t(mes, nombre)
 where c.slug = 'hugo-jara';

-- Las compras del fondo se piden por Compras, en su tópico.
update public.topicos set nombre = 'Fondo Las Condes', activo = true where slug = 'fondo';

-- ---------------------------------------------------------------------------
-- Archivos privados
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fondo', 'fondo', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'])
on conflict (id) do nothing;

create policy "subir respaldos del fondo" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'fondo' and public.puedo_ver_fondo());

create policy "ver respaldos del fondo" on storage.objects
  for select to authenticated
  using (bucket_id = 'fondo' and public.puedo_ver_fondo());

-- ---------------------------------------------------------------------------
-- Reglas: qué respaldos pide cada gasto y cuándo está listo para rendir
-- (Decreto Alcaldicio N°749, 2024). Las mismas listas están en src/lib/fondo.js.
-- ---------------------------------------------------------------------------
create or replace function public.fondo_respaldos_de(p_item text, p_entrega boolean)
returns text[] language sql immutable as $$
  select case when p_item = 'personal'
              then array['boleta', 'comprobante', 'f29', 'certificacion', 'original']
              else array['cotizacion', 'boleta', 'comprobante', 'certificacion']
                   || case when p_entrega then array['nomina'] else array[]::text[] end
                   || array['original'] end;
$$;

-- Los respaldos marcados de un gasto, incluidos los que ya están en Compras.
create or replace function public.fondo_marcados(g public.fondo_gastos)
returns text[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct t), array[]::text[]) from (
    select r.tipo as t from public.fondo_respaldos r where r.gasto_id = g.id
    union all
    select x.t from public.pedido_items i,
           lateral (values ('cotizacion', i.cotizacion_ruta), ('boleta', i.boleta_ruta),
                           ('comprobante', i.comprobante_ruta)) as x(t, ruta)
     where i.id = g.compra_id and x.ruta is not null) s;
$$;

create or replace function public.fondo_estado(g public.fondo_gastos)
returns text language sql stable security definer set search_path = public as $$
  select case
    when g.pago = 'particular' or g.fecha < date '2026-10-01' then 'no_rendible'
    when g.rendicion is not null then 'rendida'
    when g.pago is not null
         and public.fondo_respaldos_de(g.item, g.entrega) <@ public.fondo_marcados(g) then 'lista'
    else 'pendiente' end;
$$;

-- ---------------------------------------------------------------------------
-- Ver
-- ---------------------------------------------------------------------------
create or replace function public.fondo_ver()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_club uuid := public.mi_club_id();
  v_ve boolean := public.puedo_ver_comprobantes();
begin
  perform public.fondo_exigir();
  return jsonb_build_object(
    'items', coalesce((select jsonb_agg(jsonb_build_object(
                'id', it.slug, 'nombre', it.nombre, 'detalle', it.detalle, 'aprobado', it.aprobado) order by it.orden)
              from public.fondo_items it where it.club_id = v_club), '[]'::jsonb),
    'gastos', coalesce((select jsonb_agg(jsonb_build_object(
                'id', g.id, 'item', g.item, 'que', g.que, 'monto', g.monto,
                'proveedor', g.proveedor, 'documento', g.documento, 'fecha', g.fecha,
                'pago', g.pago, 'entrega', g.entrega, 'mes', g.mes, 'rendicion', g.rendicion,
                'estado', public.fondo_estado(g),
                'compra', case when i.id is not null then jsonb_build_object(
                    'id', i.id, 'quien', i.quien, 'estado', i.estado, 'carpeta', p.carpeta,
                    'cotizacion_ruta', i.cotizacion_ruta, 'cotizacion_nombre', i.cotizacion_nombre,
                    'boleta_ruta', i.boleta_ruta, 'boleta_nombre', i.boleta_nombre,
                    'con_comprobante', i.comprobante_ruta is not null,
                    'comprobante_ruta', case when v_ve then i.comprobante_ruta end) end,
                'respaldos', coalesce((select jsonb_object_agg(r.tipo, jsonb_build_object('ruta', r.ruta, 'nombre', r.nombre))
                                         from public.fondo_respaldos r where r.gasto_id = g.id), '{}'::jsonb),
                'marcados', to_jsonb(public.fondo_marcados(g)))
              order by g.mes nulls first, g.creado_en)
              from public.fondo_gastos g
              left join public.pedido_items i on i.id = g.compra_id
              left join public.pedidos p on p.id = i.pedido_id
             where g.club_id = v_club and not g.eliminado), '[]'::jsonb),
    -- Compras del tópico Fondo que todavía no se pasan al fondo.
    'por_clasificar', coalesce((select jsonb_agg(jsonb_build_object(
                'id', i.id, 'quien', i.quien, 'que', i.que, 'monto', i.monto, 'estado', i.estado,
                'creado_en', i.creado_en) order by i.creado_en)
              from public.pedido_items i join public.pedidos p on p.id = i.pedido_id
             where p.club_id = v_club and p.topico = 'fondo' and not p.archivado and i.estado <> 'eliminado'
               and not exists (select 1 from public.fondo_gastos g where g.compra_id = i.id and not g.eliminado)), '[]'::jsonb),
    'documentos', coalesce((select jsonb_agg(jsonb_build_object(
                'id', d.slug, 'nombre', d.nombre, 'nota', d.nota, 'listo', d.listo,
                'ruta', d.ruta, 'archivo', d.archivo) order by d.orden)
              from public.fondo_documentos d where d.club_id = v_club), '[]'::jsonb),
    'rendiciones', coalesce((select jsonb_agg(jsonb_build_object(
                'id', r.numero, 'nombre', r.nombre, 'plazo', r.plazo,
                'presentada', r.presentada_en is not null, 'presentada_en', r.presentada_en, 'subida', r.subida) order by r.numero)
              from public.fondo_rendiciones r where r.club_id = v_club), '[]'::jsonb));
end;
$$;

-- ---------------------------------------------------------------------------
-- Cambiar
-- ---------------------------------------------------------------------------
create or replace function public.fondo_gasto_buscar(p_gasto uuid)
returns public.fondo_gastos language plpgsql stable security definer set search_path = public as $$
declare
  g public.fondo_gastos;
begin
  perform public.fondo_exigir();
  select * into g from public.fondo_gastos where id = p_gasto and club_id = public.mi_club_id() and not eliminado;
  if g.id is null then raise exception 'Ese gasto no está en el fondo'; end if;
  return g;
end;
$$;

-- Crea (p_gasto null) o corrige un gasto del fondo. Uno rendido no se toca.
-- Los honorarios no cambian de ítem, y ningún otro gasto pasa a honorarios.
create or replace function public.fondo_gasto_guardar(
  p_gasto uuid, p_item text, p_que text, p_monto integer,
  p_proveedor text default null, p_documento text default null, p_fecha date default null,
  p_pago text default null, p_entrega boolean default false)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  g public.fondo_gastos;
  v_id uuid;
begin
  perform public.fondo_exigir();
  if p_item is null or not exists (select 1 from public.fondo_items where club_id = public.mi_club_id() and slug = p_item) then
    raise exception 'Ese ítem no está en el presupuesto del fondo';
  end if;
  if length(trim(coalesce(p_que, ''))) = 0 then raise exception 'Falta decir qué se compró'; end if;
  if length(p_que) > 200 then raise exception 'La descripción es demasiado larga (máximo 200 letras)'; end if;
  if coalesce(p_monto, 0) <= 0 then raise exception 'Falta el monto'; end if;
  if p_monto > 5000000 then raise exception 'El monto es demasiado alto'; end if;
  if length(p_proveedor) > 120 or length(p_documento) > 40 then raise exception 'El proveedor o el N° de documento es demasiado largo'; end if;
  if p_pago is not null and p_pago not in ('transferencia', 'debito', 'particular') then raise exception 'Esa forma de pago no existe'; end if;

  if p_gasto is null then
    if p_item = 'personal' then raise exception 'Los honorarios ya están creados: se completan en su pestaña'; end if;
    insert into public.fondo_gastos (club_id, item, que, monto, proveedor, documento, fecha, pago, entrega, creado_por)
    values (public.mi_club_id(), p_item, trim(p_que), p_monto, nullif(trim(p_proveedor), ''), nullif(trim(p_documento), ''),
            p_fecha, p_pago, coalesce(p_entrega, false), public.mi_persona_id())
    returning id into v_id;
    return v_id;
  end if;

  g := public.fondo_gasto_buscar(p_gasto);
  if g.rendicion is not null then raise exception 'Ese gasto ya está en una rendición presentada: no se puede cambiar'; end if;
  if (g.item = 'personal') <> (p_item = 'personal') then raise exception 'Los honorarios no cambian de ítem'; end if;
  update public.fondo_gastos
     set item = p_item, que = trim(p_que), monto = p_monto,
         proveedor = nullif(trim(p_proveedor), ''), documento = nullif(trim(p_documento), ''),
         fecha = p_fecha, pago = p_pago, entrega = coalesce(p_entrega, false), actualizado_en = now()
   where id = g.id;
  return g.id;
end;
$$;

-- Pasa una compra de Compras al fondo, con su ítem. Toma qué y monto de la compra.
create or replace function public.fondo_clasificar(p_compra uuid, p_item text, p_entrega boolean default false)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  i public.pedido_items;
  v_id uuid;
begin
  perform public.fondo_exigir();
  select x.* into i from public.pedido_items x join public.pedidos p on p.id = x.pedido_id
   where x.id = p_compra and p.club_id = public.mi_club_id() and x.estado <> 'eliminado';
  if i.id is null then raise exception 'Esa compra no existe'; end if;
  if exists (select 1 from public.fondo_gastos where compra_id = i.id and not eliminado) then
    raise exception 'Esa compra ya está en el fondo';
  end if;
  v_id := public.fondo_gasto_guardar(null, p_item, i.que, i.monto, null, null, null, null, p_entrega);
  -- Si se había quitado antes, la fila vieja suelta la compra.
  update public.fondo_gastos set compra_id = null where compra_id = i.id and eliminado;
  update public.fondo_gastos set compra_id = i.id where id = v_id;
  return v_id;
end;
$$;

-- Saca un gasto del fondo (no lo borra). La compra vuelve a quedar por clasificar.
create or replace function public.fondo_gasto_quitar(p_gasto uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  g public.fondo_gastos := public.fondo_gasto_buscar(p_gasto);
begin
  if g.rendicion is not null then raise exception 'Ese gasto ya está en una rendición presentada: no se puede quitar'; end if;
  if g.item = 'personal' then raise exception 'Las cuotas de honorarios no se quitan'; end if;
  update public.fondo_gastos set eliminado = true, actualizado_en = now() where id = g.id;
end;
$$;

-- Marca o desmarca un respaldo, con archivo opcional en el bucket 'fondo'.
create or replace function public.fondo_respaldo(
  p_gasto uuid, p_tipo text, p_marcado boolean, p_ruta text default null, p_nombre text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  g public.fondo_gastos := public.fondo_gasto_buscar(p_gasto);
begin
  if g.rendicion is not null then raise exception 'Ese gasto ya está en una rendición presentada: no se puede cambiar'; end if;
  if not (p_tipo = any (public.fondo_respaldos_de(g.item, g.entrega))) then
    raise exception 'Ese respaldo no corresponde a este gasto';
  end if;
  if not coalesce(p_marcado, false) then
    delete from public.fondo_respaldos where gasto_id = g.id and tipo = p_tipo;
    return;
  end if;
  if p_ruta is not null and p_tipo in ('nomina', 'original') then
    raise exception 'Este respaldo se guarda solo en papel: se marca sin subir archivo';
  end if;
  if p_ruta is not null and not exists (select 1 from storage.objects where bucket_id = 'fondo' and name = p_ruta) then
    raise exception 'Falta el archivo del respaldo';
  end if;
  insert into public.fondo_respaldos (gasto_id, tipo, ruta, nombre, marcado_por)
  values (g.id, p_tipo, p_ruta, case when p_ruta is not null then coalesce(p_nombre, 'respaldo') end, public.mi_persona_id())
  on conflict (gasto_id, tipo) do update
     set ruta = coalesce(excluded.ruta, fondo_respaldos.ruta),
         nombre = coalesce(excluded.nombre, fondo_respaldos.nombre),
         marcado_por = excluded.marcado_por, marcado_en = now();
end;
$$;

create or replace function public.fondo_documento(p_slug text, p_listo boolean, p_ruta text default null, p_nombre text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.fondo_exigir();
  if p_ruta is not null and not exists (select 1 from storage.objects where bucket_id = 'fondo' and name = p_ruta) then
    raise exception 'Falta el archivo del documento';
  end if;
  update public.fondo_documentos
     set listo = coalesce(p_listo, false),
         ruta = case when p_ruta is not null then p_ruta when coalesce(p_listo, false) then ruta end,
         archivo = case when p_ruta is not null then coalesce(p_nombre, 'documento') when coalesce(p_listo, false) then archivo end
   where club_id = public.mi_club_id() and slug = p_slug;
  if not found then raise exception 'Ese documento no existe'; end if;
end;
$$;

-- Presenta una rendición: entran todos los gastos listos para rendir. Se
-- presentan en orden y una presentada no se deshace desde la app.
create or replace function public.fondo_presentar(p_rendicion integer)
returns integer language plpgsql security definer set search_path = public as $$
declare
  r public.fondo_rendiciones;
  v_n integer;
begin
  perform public.fondo_exigir();
  select * into r from public.fondo_rendiciones where club_id = public.mi_club_id() and numero = p_rendicion for update;
  if r.numero is null then raise exception 'Esa rendición no existe'; end if;
  if r.presentada_en is not null then raise exception 'Esa rendición ya está presentada'; end if;
  if exists (select 1 from public.fondo_rendiciones where club_id = r.club_id and numero < r.numero and presentada_en is null) then
    raise exception 'Primero hay que presentar la rendición anterior';
  end if;
  update public.fondo_gastos g set rendicion = r.numero, actualizado_en = now()
   where g.club_id = r.club_id and not g.eliminado and public.fondo_estado(g) = 'lista';
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'No hay gastos listos para rendir'; end if;
  update public.fondo_rendiciones set presentada_en = now(), presentada_por = public.mi_persona_id()
   where club_id = r.club_id and numero = r.numero;
  return v_n;
end;
$$;

create or replace function public.fondo_subida(p_rendicion integer, p_subida boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.fondo_exigir();
  update public.fondo_rendiciones set subida = coalesce(p_subida, false)
   where club_id = public.mi_club_id() and numero = p_rendicion and presentada_en is not null;
  if not found then raise exception 'Esa rendición no está presentada'; end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Permisos de las funciones
-- ---------------------------------------------------------------------------
revoke execute on function public.fondo_exigir() from public, anon, authenticated;
revoke execute on function public.fondo_gasto_buscar(uuid) from public, anon, authenticated;
revoke execute on function public.fondo_marcados(public.fondo_gastos) from public, anon, authenticated;
revoke execute on function public.fondo_estado(public.fondo_gastos) from public, anon, authenticated;
revoke execute on function public.puedo_ver_fondo() from public, anon;
grant execute on function public.puedo_ver_fondo() to authenticated;

revoke execute on function public.fondo_acceso() from public, anon;
revoke execute on function public.fondo_ver() from public, anon;
revoke execute on function public.fondo_gasto_guardar(uuid, text, text, integer, text, text, date, text, boolean) from public, anon;
revoke execute on function public.fondo_clasificar(uuid, text, boolean) from public, anon;
revoke execute on function public.fondo_gasto_quitar(uuid) from public, anon;
revoke execute on function public.fondo_respaldo(uuid, text, boolean, text, text) from public, anon;
revoke execute on function public.fondo_documento(text, boolean, text, text) from public, anon;
revoke execute on function public.fondo_presentar(integer) from public, anon;
revoke execute on function public.fondo_subida(integer, boolean) from public, anon;
grant execute on function public.fondo_acceso() to authenticated;
grant execute on function public.fondo_ver() to authenticated;
grant execute on function public.fondo_gasto_guardar(uuid, text, text, integer, text, text, date, text, boolean) to authenticated;
grant execute on function public.fondo_clasificar(uuid, text, boolean) to authenticated;
grant execute on function public.fondo_gasto_quitar(uuid) to authenticated;
grant execute on function public.fondo_respaldo(uuid, text, boolean, text, text) to authenticated;
grant execute on function public.fondo_documento(text, boolean, text, text) to authenticated;
grant execute on function public.fondo_presentar(integer) to authenticated;
grant execute on function public.fondo_subida(integer, boolean) to authenticated;
