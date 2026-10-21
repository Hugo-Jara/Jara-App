-- Jara App · 0020 · Compras por tópico
--
-- Hasta ahora se entraba a Compras por lista, y el link de cada lista dejaba
-- leer todas sus compras (quién, qué, monto y archivos) a cualquiera que lo
-- tuviera. Desde ahora se entra por TÓPICO:
--
--   - Los tópicos son filas de la tabla 'topicos'. Hoy hay uno activo
--     ("Fiesta 20 años"). "General" queda inactivo y "Fondo" queda creado e
--     inactivo, listo para que Compras 2 lo active. No se borra nada.
--   - Las listas siguen existiendo por dentro, pero la app no las muestra.
--     Cada tópico activo tiene exactamente UNA lista abierta, y eso lo asegura
--     la base con un índice único: si algún día hubiera dos, falla en vez de
--     elegir una. Esta migración también falla si hoy hay dos listas
--     abiertas del mismo tópico.
--   - Se archivan (se cierran y se ocultan) todas las listas menos las que se
--     llaman "Fiesta 20 años". Sus compras no se borran.
--   - Cada tópico tiene un link público para enviar solicitudes sin cuenta:
--     /solicitar/<código>. El código no se puede adivinar, solo sirve para
--     crear solicitudes en ese tópico y no deja leer nada. Quien envía no puede
--     ver ni corregir su solicitud después.
--   - Los links viejos por lista (/pedido/...) dejan de servir para pedir y
--     para leer. El link de Hacienda sigue funcionando igual.
--   - Límites al crear una compra (link público, app y link de Hacienda):
--     nombre hasta 80 letras, qué hasta 200, referencia hasta 300, monto hasta
--     $5.000.000, y la cotización tiene que ser un PDF o una foto de menos de
--     10 MB. La base lo comprueba mirando el archivo que quedó en Storage.
--   - La referencia pasa a ser opcional; la cotización sigue siendo obligatoria.
--   - Hacienda puede cerrar y reabrir un tópico desde la app. La función
--     lista_compras_cambiar (0019) se retira: las listas ya no se tocan.
--
-- Esta migración se corre en Supabase ANTES de subir la app nueva: la versión
-- anterior de Compras deja de funcionar hasta que se publica la nueva.

-- ---------------------------------------------------------------------------
-- Tópicos
-- ---------------------------------------------------------------------------
create table public.topicos (
  id           uuid primary key default gen_random_uuid(),
  club_id      uuid not null references public.clubes(id) on delete cascade,
  slug         text not null check (slug ~ '^[a-z0-9_]+$'),
  nombre       text not null check (length(trim(nombre)) > 0),
  activo       boolean not null default true,
  -- Código del link público para enviar solicitudes. Dos UUID al azar juntos.
  token_envio  text not null unique
               default replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  creado_en    timestamptz not null default now(),
  unique (club_id, slug)
);
alter table public.topicos enable row level security;
revoke all on public.topicos from anon, authenticated;

insert into public.topicos (club_id, slug, nombre, activo)
select c.id, t.slug, t.nombre, t.activo
  from public.clubes c,
       (values ('veinte_anos', 'Fiesta 20 años', true),
               ('general', 'General', false),
               ('fondo', 'Fondo', false)) as t(slug, nombre, activo);

-- El tópico de una lista tiene que existir: así se puede agregar uno nuevo
-- (por ejemplo Fondo) con una fila, sin tocar el modelo.
alter table public.pedidos drop constraint pedidos_topico_check;
alter table public.pedidos add constraint pedidos_topico_fk
  foreign key (club_id, topico) references public.topicos (club_id, slug);

-- ---------------------------------------------------------------------------
-- Listas: se archivan las de prueba y queda una abierta por tópico
-- ---------------------------------------------------------------------------
alter table public.pedidos add column archivado boolean not null default false;

-- Las que se llaman "Fiesta 20 años" se quedan; el resto se cierra y se oculta.
update public.pedidos
   set topico = 'veinte_anos'
 where lower(translate(trim(nombre), 'ñÑ', 'nN')) = 'fiesta 20 anos';
update public.pedidos
   set archivado = true, abierto = false
 where lower(translate(trim(nombre), 'ñÑ', 'nN')) <> 'fiesta 20 anos';

-- Una sola lista abierta por tópico. Si hoy hubiera dos, la migración falla.
create unique index pedidos_una_abierta_por_topico on public.pedidos (club_id, topico) where abierto;

-- Cada tópico activo tiene su lista abierta.
insert into public.pedidos (club_id, nombre, topico)
select t.club_id, t.nombre, t.slug
  from public.topicos t
 where t.activo
   and not exists (select 1 from public.pedidos p where p.club_id = t.club_id and p.topico = t.slug and p.abierto);

-- Al activar un tópico (nuevo o reabierto) se asegura su lista abierta.
create or replace function public.topico_asegurar_lista()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.activo and not exists (select 1 from public.pedidos p
                                 where p.club_id = new.club_id and p.topico = new.slug and p.abierto) then
    insert into public.pedidos (club_id, nombre, topico) values (new.club_id, new.nombre, new.slug);
  end if;
  return new;
end;
$$;
create trigger topico_asegurar_lista
  after insert or update of activo on public.topicos
  for each row execute function public.topico_asegurar_lista();
revoke execute on function public.topico_asegurar_lista() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Límites al crear una compra
-- ---------------------------------------------------------------------------
-- ¿Cómo quedó un archivo en el bucket 'pedidos'? 'falta' si no existe,
-- 'invalido' si no es PDF o foto, o pesa más de 10 MB, y 'ok' si está bien.
create or replace function public.compras_archivo_estado(p_ruta text)
returns text language sql stable security definer set search_path = public as $$
  select case
    when o.id is null then 'falta'
    when o.metadata->>'mimetype' in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic')
         and coalesce((o.metadata->>'size')::bigint, 0) between 1 and 10485760 then 'ok'
    else 'invalido'
  end
  from (select 1) x left join storage.objects o on o.bucket_id = 'pedidos' and o.name = p_ruta;
$$;
revoke execute on function public.compras_archivo_estado(text) from public, anon, authenticated;

-- Igual que en 0005, más los límites, y la referencia ya no es obligatoria.
create or replace function public.pedido_validar(
  v public.pedidos, p_quien text, p_que text, p_monto integer,
  p_cotizacion_ruta text, p_referencia text, p_referencia_ruta text)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not v.abierto then
    raise exception 'Este pedido ya está cerrado';
  end if;
  if coalesce(length(trim(p_quien)), 0) = 0 then raise exception 'Falta tu nombre'; end if;
  if length(trim(p_quien)) > 80 then raise exception 'El nombre es demasiado largo (máximo 80 letras)'; end if;
  if coalesce(length(trim(p_que)), 0) = 0 then raise exception 'Falta decir qué quieres comprar'; end if;
  if length(trim(p_que)) > 200 then raise exception 'La descripción es demasiado larga (máximo 200 letras)'; end if;
  if p_monto is null or p_monto <= 0 then raise exception 'El monto tiene que ser mayor que cero'; end if;
  if p_monto > 5000000 then
    raise exception 'El monto es demasiado alto (máximo $5.000.000). Si necesitas más, habla con Hacienda';
  end if;
  if length(trim(coalesce(p_referencia, ''))) > 300 then
    raise exception 'La referencia es demasiado larga (máximo 300 letras)';
  end if;
  if p_cotizacion_ruta is null or length(p_cotizacion_ruta) > 300 or p_cotizacion_ruta not like v.carpeta || '/%'
     or public.compras_archivo_estado(p_cotizacion_ruta) = 'falta' then
    raise exception 'Falta adjuntar la cotización';
  end if;
  if public.compras_archivo_estado(p_cotizacion_ruta) <> 'ok' then
    raise exception 'La cotización tiene que ser un PDF o una foto de menos de 10 MB';
  end if;
  if p_referencia_ruta is not null then
    if length(p_referencia_ruta) > 300 or p_referencia_ruta not like v.carpeta || '/%' then
      raise exception 'El archivo de referencia no pertenece a este pedido';
    end if;
    if public.compras_archivo_estado(p_referencia_ruta) <> 'ok' then
      raise exception 'El archivo de referencia tiene que ser un PDF o una foto de menos de 10 MB';
    end if;
  end if;
end;
$$;

alter table public.pedido_items drop constraint con_referencia;

-- ---------------------------------------------------------------------------
-- Los links viejos por lista ya no sirven; el de Hacienda sigue igual
-- ---------------------------------------------------------------------------
-- Busca la lista por el código de Hacienda. Con el código de pedir (el de los
-- links viejos) avisa que ya no sirve.
create or replace function public.pedido_de_hacienda(p_token text)
returns public.pedidos language plpgsql stable security definer set search_path = public as $$
declare
  v public.pedidos;
begin
  select * into v from public.pedidos where token_hacienda = p_token;
  if v.id is null then
    if exists (select 1 from public.pedidos where token = p_token) then
      raise exception 'Este link ya no recibe solicitudes.';
    end if;
    raise exception 'Este link no es válido';
  end if;
  return v;
end;
$$;
revoke execute on function public.pedido_de_hacienda(text) from public, anon, authenticated;

-- Igual que en 0017, pero solo con el link de Hacienda.
create or replace function public.pedido_ver(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v public.pedidos := public.pedido_de_hacienda(p_token);
  v_ve boolean := public.puedo_ver_comprobantes();
begin
  return jsonb_build_object(
    'nombre', v.nombre,
    'abierto', v.abierto,
    'es_hacienda', true,
    'puedo_ver_comprobantes', v_ve,
    'carpeta', v.carpeta,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', i.id, 'quien', i.quien, 'que', i.que, 'monto', i.monto,
               'cotizacion_ruta', i.cotizacion_ruta, 'cotizacion_nombre', i.cotizacion_nombre,
               'referencia', i.referencia,
               'referencia_ruta', i.referencia_ruta, 'referencia_nombre', i.referencia_nombre,
               'estado', i.estado, 'comentario', i.comentario,
               'boleta_ruta', i.boleta_ruta, 'boleta_nombre', i.boleta_nombre,
               'con_comprobante', i.comprobante_ruta is not null,
               'comprobante_ruta', i.comprobante_ruta,
               'comprobante_nombre', i.comprobante_nombre,
               'creado_en', i.creado_en) order by i.creado_en)
        from public.pedido_items i
       where i.pedido_id = v.id and i.estado <> 'eliminado'), '[]'::jsonb));
end;
$$;

-- Igual que en 0005, pero solo con el link de Hacienda.
create or replace function public.pedido_agregar(
  p_token text, p_quien text, p_que text, p_monto integer,
  p_cotizacion_ruta text, p_cotizacion_nombre text,
  p_referencia text default null, p_referencia_ruta text default null, p_referencia_nombre text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v public.pedidos := public.pedido_de_hacienda(p_token);
  v_id uuid;
begin
  perform public.pedido_validar(v, p_quien, p_que, p_monto, p_cotizacion_ruta, p_referencia, p_referencia_ruta);

  insert into public.pedido_items
    (pedido_id, quien, que, monto, cotizacion_ruta, cotizacion_nombre, referencia, referencia_ruta, referencia_nombre)
  values
    (v.id, trim(p_quien), trim(p_que), p_monto, p_cotizacion_ruta, left(coalesce(p_cotizacion_nombre, 'cotización'), 150),
     nullif(trim(p_referencia), ''), p_referencia_ruta, left(p_referencia_nombre, 150))
  returning id into v_id;

  insert into public.pedido_item_eventos (item_id, de_estado, a_estado, por)
  values (v_id, null, 'pendiente', 'solicitante');
  return v_id;
end;
$$;

-- Igual que en 0005, pero solo con el link de Hacienda.
create or replace function public.pedido_corregir(
  p_token text, p_item uuid, p_quien text, p_que text, p_monto integer,
  p_cotizacion_ruta text, p_cotizacion_nombre text,
  p_referencia text default null, p_referencia_ruta text default null, p_referencia_nombre text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.pedidos := public.pedido_de_hacienda(p_token);
  v_item public.pedido_items;
begin
  select * into v_item from public.pedido_items where id = p_item and pedido_id = v.id;
  if v_item.id is null then raise exception 'Esa compra no está en este pedido'; end if;
  if v_item.estado <> 'devuelto' then raise exception 'Solo se puede corregir una compra devuelta'; end if;
  perform public.pedido_validar(v, p_quien, p_que, p_monto, p_cotizacion_ruta, p_referencia, p_referencia_ruta);

  update public.pedido_items
     set quien = trim(p_quien), que = trim(p_que), monto = p_monto,
         cotizacion_ruta = p_cotizacion_ruta, cotizacion_nombre = left(coalesce(p_cotizacion_nombre, 'cotización'), 150),
         referencia = nullif(trim(p_referencia), ''),
         referencia_ruta = p_referencia_ruta, referencia_nombre = left(p_referencia_nombre, 150),
         estado = 'pendiente', comentario = null, actualizado_en = now()
   where id = p_item;
  insert into public.pedido_item_eventos (item_id, de_estado, a_estado, por)
  values (p_item, 'devuelto', 'pendiente', 'solicitante');
end;
$$;

-- Igual que en 0005, pero solo con el link de Hacienda.
create or replace function public.pedido_boleta(p_token text, p_item uuid, p_ruta text, p_nombre text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.pedidos := public.pedido_de_hacienda(p_token);
  v_item public.pedido_items;
begin
  select * into v_item from public.pedido_items where id = p_item and pedido_id = v.id;
  if v_item.id is null then raise exception 'Esa compra no está en este pedido'; end if;
  if v_item.estado <> 'entregado' then
    raise exception 'La boleta se sube cuando la plata ya fue entregada';
  end if;
  if p_ruta is null or p_ruta not like v.carpeta || '/%' then
    raise exception 'Falta el archivo de la boleta';
  end if;

  update public.pedido_items
     set estado = 'respaldado', boleta_ruta = p_ruta, boleta_nombre = left(coalesce(p_nombre, 'boleta'), 150),
         actualizado_en = now()
   where id = p_item;
  insert into public.pedido_item_eventos (item_id, de_estado, a_estado, por)
  values (p_item, 'entregado', 'respaldado', 'solicitante');
end;
$$;

-- ---------------------------------------------------------------------------
-- Link público de cada tópico: solo sirve para enviar
-- ---------------------------------------------------------------------------
-- La lista abierta de un tópico activo, a partir del código del link.
create or replace function public.topico_abierto(p_token text)
returns public.pedidos language plpgsql stable security definer set search_path = public as $$
declare
  t public.topicos;
  v public.pedidos;
begin
  select * into t from public.topicos where token_envio = p_token;
  if t.id is null then raise exception 'Este link no es válido'; end if;
  if not t.activo then raise exception 'Este tópico ya no recibe solicitudes'; end if;
  select * into v from public.pedidos where club_id = t.club_id and topico = t.slug and abierto;
  if v.id is null then raise exception 'Este tópico ya no recibe solicitudes'; end if;
  return v;
end;
$$;
revoke execute on function public.topico_abierto(text) from public, anon, authenticated;

-- Lo que necesita la página para mostrar el formulario: el nombre del tópico
-- y la carpeta donde subir la cotización. No devuelve ninguna compra.
create or replace function public.topico_publico(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v public.pedidos := public.topico_abierto(p_token);
begin
  return jsonb_build_object('nombre', v.nombre, 'carpeta', v.carpeta);
end;
$$;

-- Crea una solicitud en ese tópico, con las mismas reglas y límites de siempre.
-- No devuelve nada: quien envía no puede ver ni corregir su solicitud.
create or replace function public.topico_enviar(
  p_token text, p_quien text, p_que text, p_monto integer,
  p_cotizacion_ruta text, p_cotizacion_nombre text,
  p_referencia text default null, p_referencia_ruta text default null, p_referencia_nombre text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.pedidos := public.topico_abierto(p_token);
begin
  perform public.pedido_agregar(v.token_hacienda, p_quien, p_que, p_monto,
                                p_cotizacion_ruta, p_cotizacion_nombre, p_referencia, p_referencia_ruta, p_referencia_nombre);
end;
$$;

revoke execute on function public.topico_publico(text) from public;
revoke execute on function public.topico_enviar(text, text, text, integer, text, text, text, text, text) from public;
grant execute on function public.topico_publico(text) to anon, authenticated;
grant execute on function public.topico_enviar(text, text, text, integer, text, text, text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Compras en la app, por tópico
-- ---------------------------------------------------------------------------
-- Los tópicos y las compras que me toca ver: todas, si puedo, o solo las mías.
-- Las listas no aparecen. Los tópicos cerrados y el código del link público
-- solo los recibe Hacienda.
create or replace function public.compras_ver()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_yo uuid := public.mi_persona_id();
  v_todas boolean := public.puedo_ver_todas_las_compras();
  v_hacienda boolean := public.puedo_aprobar_compras();
  v_ve boolean := public.puedo_ver_comprobantes();
begin
  if v_yo is null then raise exception 'Tu cuenta no está en la nómina del club'; end if;
  return jsonb_build_object(
    've_todas', v_todas, 'es_hacienda', v_hacienda, 'puedo_ver_comprobantes', v_ve,
    'topicos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'slug', t.slug, 'nombre', t.nombre, 'activo', t.activo,
               -- La carpeta sirve para subir archivos a la lista abierta del tópico.
               'carpeta', case when t.activo then (select p.carpeta from public.pedidos p
                                                    where p.club_id = t.club_id and p.topico = t.slug and p.abierto) end,
               'token_envio', case when v_hacienda then t.token_envio end)
             order by t.activo desc, t.nombre)
        from public.topicos t
       where t.club_id = public.mi_club_id() and (t.activo or v_hacienda)), '[]'::jsonb),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', i.id, 'pedido_id', i.pedido_id, 'topico', p.topico, 'carpeta', p.carpeta,
               'quien', i.quien, 'que', i.que, 'monto', i.monto,
               'es_mia', coalesce(i.persona_id = v_yo, false),
               'cotizacion_ruta', i.cotizacion_ruta, 'cotizacion_nombre', i.cotizacion_nombre,
               'referencia', i.referencia,
               'referencia_ruta', i.referencia_ruta, 'referencia_nombre', i.referencia_nombre,
               'estado', i.estado, 'comentario', i.comentario,
               'boleta_ruta', i.boleta_ruta, 'boleta_nombre', i.boleta_nombre,
               'con_comprobante', i.comprobante_ruta is not null,
               'comprobante_ruta', case when v_ve then i.comprobante_ruta end,
               'comprobante_nombre', case when v_ve then i.comprobante_nombre end,
               'creado_en', i.creado_en) order by i.creado_en desc)
        from public.pedido_items i join public.pedidos p on p.id = i.pedido_id
       where p.club_id = public.mi_club_id() and not p.archivado and i.estado <> 'eliminado'
         and (v_todas or i.persona_id = v_yo)), '[]'::jsonb));
end;
$$;

-- Pedir una compra en un tópico activo. El nombre lo pone la cuenta.
drop function public.compra_agregar(uuid, text, integer, text, text, text, text, text);
create or replace function public.compra_agregar(
  p_topico text, p_que text, p_monto integer,
  p_cotizacion_ruta text, p_cotizacion_nombre text,
  p_referencia text default null, p_referencia_ruta text default null, p_referencia_nombre text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v public.pedidos;
  v_yo uuid := public.mi_persona_id();
  v_id uuid;
begin
  if v_yo is null then raise exception 'Tu cuenta no está en la nómina del club'; end if;
  select p.* into v
    from public.pedidos p join public.topicos t on t.club_id = p.club_id and t.slug = p.topico
   where p.club_id = public.mi_club_id() and p.topico = p_topico and p.abierto and t.activo;
  if v.id is null then raise exception 'Ese tópico no recibe solicitudes'; end if;
  v_id := public.pedido_agregar(v.token_hacienda, (select nombre from public.personas where id = v_yo), p_que, p_monto,
                                p_cotizacion_ruta, p_cotizacion_nombre, p_referencia, p_referencia_ruta, p_referencia_nombre);
  update public.pedido_items set persona_id = v_yo where id = v_id;
  perform public.compra_firmar(v_id);
  return v_id;
end;
$$;

-- Igual que en 0019, pero con el código de Hacienda (los de pedir ya no sirven).
create or replace function public.compra_corregir(
  p_item uuid, p_que text, p_monto integer,
  p_cotizacion_ruta text, p_cotizacion_nombre text,
  p_referencia text default null, p_referencia_ruta text default null, p_referencia_nombre text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  c record;
begin
  select * into c from public.compra_buscar(p_item);
  if not (coalesce((c.i).persona_id = public.mi_persona_id(), false) or public.puedo_aprobar_compras()) then
    raise exception 'Solo quien pidió la compra o Hacienda puede corregirla';
  end if;
  perform public.pedido_corregir((c.v).token_hacienda, p_item, (c.i).quien, p_que, p_monto,
                                 p_cotizacion_ruta, p_cotizacion_nombre, p_referencia, p_referencia_ruta, p_referencia_nombre);
  perform public.compra_firmar(p_item);
end;
$$;

create or replace function public.compra_boleta(p_item uuid, p_ruta text, p_nombre text)
returns void language plpgsql security definer set search_path = public as $$
declare
  c record;
begin
  select * into c from public.compra_buscar(p_item);
  if not (coalesce((c.i).persona_id = public.mi_persona_id(), false) or public.puedo_aprobar_compras()) then
    raise exception 'Solo quien pidió la compra o Hacienda puede subir la boleta';
  end if;
  perform public.pedido_boleta((c.v).token_hacienda, p_item, p_ruta, p_nombre);
  perform public.compra_firmar(p_item);
end;
$$;

-- Hacienda cierra o reabre un tópico. Al reabrirlo queda su lista abierta.
create or replace function public.topico_cambiar(p_slug text, p_activo boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.puedo_aprobar_compras() then raise exception 'Solo Hacienda puede cerrar o reabrir un tópico'; end if;
  if p_activo is null then raise exception 'Falta decir si el tópico queda abierto o cerrado'; end if;
  update public.topicos set activo = p_activo where club_id = public.mi_club_id() and slug = p_slug;
  if not found then raise exception 'Ese tópico no existe'; end if;
end;
$$;

-- Las listas ya no se tocan desde la app.
drop function public.lista_compras_cambiar(uuid, text, boolean);

revoke execute on function public.topico_cambiar(text, boolean) from public, anon;
grant execute on function public.topico_cambiar(text, boolean) to authenticated;
revoke execute on function public.compra_agregar(text, text, integer, text, text, text, text, text) from public, anon;
grant execute on function public.compra_agregar(text, text, integer, text, text, text, text, text) to authenticated;
