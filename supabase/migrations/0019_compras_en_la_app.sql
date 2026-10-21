-- Jara App · 0019 · Compras dentro de la app
--
-- Hasta ahora las compras se pedían solo con un link, sin cuenta: una compra
-- no sabía quién la había pedido (solo traía un nombre escrito a mano), las
-- listas no tenían tópico y Hacienda trabajaba con su propio link.
--
-- Desde ahora, además del link:
--   - Cada lista (pedido) tiene un tópico: Fondo, 20 años o General.
--     Las listas que ya existen y tienen "20 años" en el nombre quedan en
--     20 años; el resto, en General. Se crea una lista abierta de cada tópico
--     que no tenga ninguna abierta ("Compras generales", "Fondo Las Condes" y,
--     si faltara, "Fiesta 20 años"). Hacienda puede cambiar el tópico de una
--     lista y cerrarla (o volver a abrirla) desde la app, para corregir lo que
--     esta migración clasifique mal.
--   - Quien tiene cuenta pide compras desde la app y quedan a su nombre.
--   - Cada socio ve solo sus compras. Ven todas los administradores, Hacienda
--     y quien tenga el permiso personal 've_compras' (por ejemplo, el
--     presidente). Los tesoreros de plantel ven solo las suyas.
--   - 've_comprobantes' queda solo para abrir los comprobantes de
--     transferencia: quien ve todas las compras pero no tiene ese permiso ve
--     que hay comprobante, pero no lo abre. A quien hoy tiene
--     've_comprobantes' se le da también 've_compras'.
--   - Hacienda hace desde la app lo mismo que con su link: aprobar, devolver
--     con motivo, entregar con o sin comprobante, editar y eliminar.
--
-- Las funciones del link no cambian: el link sin cuenta sigue funcionando
-- igual y sobre los mismos datos. Las funciones nuevas revisan quién llama y
-- después usan esas mismas funciones, así las reglas, los estados y el
-- historial son los mismos. Los archivos van a las mismas carpetas y los
-- comprobantes siguen en el bucket privado 'comprobantes'.
--
-- El permiso personal se da en Supabase: Table Editor > personas > ve_compras.

-- ---------------------------------------------------------------------------
-- Columnas nuevas
-- ---------------------------------------------------------------------------
alter table public.pedidos add column topico text not null default 'general'
  check (topico in ('fondo', 'veinte_anos', 'general'));

-- Quién la pidió con su cuenta. Las compras que llegan por link quedan vacías.
alter table public.pedido_items add column persona_id uuid references public.personas(id) on delete set null;
create index pedido_items_persona_idx on public.pedido_items (persona_id);

-- Quién hizo cada paso desde la app, para el historial.
alter table public.pedido_item_eventos add column persona_id uuid references public.personas(id) on delete set null;

-- Permiso personal para ver todas las compras.
alter table public.personas add column ve_compras boolean not null default false;
update public.personas set ve_compras = true where ve_comprobantes;

-- ---------------------------------------------------------------------------
-- Tópico de las listas que ya existen, y una lista abierta por tópico
-- ---------------------------------------------------------------------------
update public.pedidos set topico = 'veinte_anos'
 where lower(translate(nombre, 'ñÑ', 'nN')) like '%20 anos%';

insert into public.pedidos (club_id, nombre, topico)
select c.id, t.nombre, t.topico
  from public.clubes c,
       (values ('Compras generales', 'general'), ('Fondo Las Condes', 'fondo'), ('Fiesta 20 años', 'veinte_anos'))
         as t(nombre, topico)
 where c.slug = 'hugo-jara'
   and not exists (select 1 from public.pedidos p
                    where p.club_id = c.id and p.topico = t.topico and p.abierto);

-- ---------------------------------------------------------------------------
-- Quién puede qué
-- ---------------------------------------------------------------------------
-- ¿Veo todas las compras? Administradores, Hacienda y quien tiene 've_compras'.
create or replace function public.puedo_ver_todas_las_compras()
returns boolean language sql stable security definer set search_path = public as $$
  select public.puedo_aprobar_compras()
      or exists (select 1 from public.personas p
                  where p.id = public.mi_persona_id() and p.ve_compras);
$$;

-- Busca una compra de mi club (sin las eliminadas) y su lista. Solo para las
-- funciones de abajo.
create or replace function public.compra_buscar(p_item uuid, out i public.pedido_items, out v public.pedidos)
language plpgsql stable security definer set search_path = public as $$
begin
  if public.mi_persona_id() is null then raise exception 'Tu cuenta no está en la nómina del club'; end if;
  select x.* into i from public.pedido_items x where x.id = p_item and x.estado <> 'eliminado';
  select y.* into v from public.pedidos y where y.id = i.pedido_id and y.club_id = public.mi_club_id();
  if i.id is null or v.id is null then raise exception 'Esa compra no existe'; end if;
end;
$$;

-- Anota en el último paso del historial de una compra quién lo hizo desde la app.
create or replace function public.compra_firmar(p_item uuid)
returns void language sql security definer set search_path = public as $$
  update public.pedido_item_eventos set persona_id = public.mi_persona_id()
   where id = (select max(id) from public.pedido_item_eventos where item_id = p_item) and persona_id is null;
$$;

-- ---------------------------------------------------------------------------
-- Ver
-- ---------------------------------------------------------------------------
-- Las listas y las compras que me toca ver: todas, si puedo, o solo las mías.
-- La ruta del comprobante llega solo a quien puede abrirlo. Hacienda recibe el
-- código del link de pedir de cada lista, para mandárselo a quien no tiene cuenta.
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
    'listas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id, 'nombre', p.nombre, 'topico', p.topico, 'abierto', p.abierto,
               -- La carpeta sirve para subir archivos a una lista abierta.
               'carpeta', case when p.abierto or v_hacienda then p.carpeta end,
               'token', case when v_hacienda then p.token end)
             order by p.abierto desc, p.creado_en desc)
        from public.pedidos p
       where p.club_id = public.mi_club_id()
         and (p.abierto or v_todas
              or exists (select 1 from public.pedido_items i where i.pedido_id = p.id and i.persona_id = v_yo))), '[]'::jsonb),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', i.id, 'pedido_id', i.pedido_id, 'carpeta', p.carpeta,
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
       where p.club_id = public.mi_club_id() and i.estado <> 'eliminado'
         and (v_todas or i.persona_id = v_yo)), '[]'::jsonb));
end;
$$;

-- ---------------------------------------------------------------------------
-- Quien pide
-- ---------------------------------------------------------------------------
-- Pedir una compra en una lista abierta. El nombre lo pone la cuenta.
create or replace function public.compra_agregar(
  p_pedido uuid, p_que text, p_monto integer,
  p_cotizacion_ruta text, p_cotizacion_nombre text,
  p_referencia text default null, p_referencia_ruta text default null, p_referencia_nombre text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v public.pedidos;
  v_yo uuid := public.mi_persona_id();
  v_id uuid;
begin
  if v_yo is null then raise exception 'Tu cuenta no está en la nómina del club'; end if;
  select * into v from public.pedidos where id = p_pedido and club_id = public.mi_club_id();
  if v.id is null then raise exception 'Esa lista no existe'; end if;
  v_id := public.pedido_agregar(v.token, (select nombre from public.personas where id = v_yo), p_que, p_monto,
                                p_cotizacion_ruta, p_cotizacion_nombre, p_referencia, p_referencia_ruta, p_referencia_nombre);
  update public.pedido_items set persona_id = v_yo where id = v_id;
  perform public.compra_firmar(v_id);
  return v_id;
end;
$$;

-- Corregir una compra devuelta: quien la pidió o Hacienda. El nombre no cambia.
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
  perform public.pedido_corregir((c.v).token, p_item, (c.i).quien, p_que, p_monto,
                                 p_cotizacion_ruta, p_cotizacion_nombre, p_referencia, p_referencia_ruta, p_referencia_nombre);
  perform public.compra_firmar(p_item);
end;
$$;

-- Subir la boleta: quien la pidió o Hacienda.
create or replace function public.compra_boleta(p_item uuid, p_ruta text, p_nombre text)
returns void language plpgsql security definer set search_path = public as $$
declare
  c record;
begin
  select * into c from public.compra_buscar(p_item);
  if not (coalesce((c.i).persona_id = public.mi_persona_id(), false) or public.puedo_aprobar_compras()) then
    raise exception 'Solo quien pidió la compra o Hacienda puede subir la boleta';
  end if;
  perform public.pedido_boleta((c.v).token, p_item, p_ruta, p_nombre);
  perform public.compra_firmar(p_item);
end;
$$;

-- ---------------------------------------------------------------------------
-- Hacienda
-- ---------------------------------------------------------------------------
-- Aprobar, devolver (con motivo) o marcar la plata como entregada.
create or replace function public.compra_revisar(p_item uuid, p_accion text, p_comentario text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  c record;
begin
  if not public.puedo_aprobar_compras() then raise exception 'Solo Hacienda puede revisar las compras'; end if;
  select * into c from public.compra_buscar(p_item);
  perform public.pedido_revisar((c.v).token_hacienda, p_item, p_accion, p_comentario);
  perform public.compra_firmar(p_item);
end;
$$;

-- Adjuntar o cambiar el comprobante de la transferencia (en el bucket privado).
create or replace function public.compra_comprobante(p_item uuid, p_ruta text, p_nombre text)
returns void language plpgsql security definer set search_path = public as $$
declare
  c record;
begin
  if not public.puedo_aprobar_compras() then raise exception 'Solo Hacienda puede subir el comprobante'; end if;
  select * into c from public.compra_buscar(p_item);
  perform public.pedido_comprobante((c.v).token_hacienda, p_item, p_ruta, p_nombre);
  perform public.compra_firmar(p_item);
end;
$$;

-- Corregir el nombre, la glosa o el monto.
create or replace function public.compra_editar(p_item uuid, p_quien text, p_que text, p_monto integer)
returns void language plpgsql security definer set search_path = public as $$
declare
  c record;
begin
  if not public.puedo_aprobar_compras() then raise exception 'Solo Hacienda puede editar una compra'; end if;
  select * into c from public.compra_buscar(p_item);
  perform public.pedido_editar((c.v).token_hacienda, p_item, p_quien, p_que, p_monto);
  perform public.compra_firmar(p_item);
end;
$$;

-- Sacar una compra de la lista. No se borra: queda como 'eliminado'.
create or replace function public.compra_eliminar(p_item uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  c record;
begin
  if not public.puedo_aprobar_compras() then raise exception 'Solo Hacienda puede eliminar una compra'; end if;
  select * into c from public.compra_buscar(p_item);
  perform public.pedido_eliminar((c.v).token_hacienda, p_item);
  perform public.compra_firmar(p_item);
end;
$$;

-- Cambiar el tópico de una lista, o cerrarla y volver a abrirla.
create or replace function public.lista_compras_cambiar(p_pedido uuid, p_topico text, p_abierto boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.puedo_aprobar_compras() then raise exception 'Solo Hacienda puede cambiar una lista'; end if;
  if p_topico not in ('fondo', 'veinte_anos', 'general') then raise exception 'Ese tópico no existe'; end if;
  if p_abierto is null then raise exception 'Falta decir si la lista queda abierta o cerrada'; end if;
  update public.pedidos set topico = p_topico, abierto = p_abierto
   where id = p_pedido and club_id = public.mi_club_id();
  if not found then raise exception 'Esa lista no existe'; end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Permisos de las funciones: solo con cuenta
-- ---------------------------------------------------------------------------
revoke execute on function public.compra_buscar(uuid) from public, anon, authenticated;
revoke execute on function public.compra_firmar(uuid) from public, anon, authenticated;
revoke execute on function public.puedo_ver_todas_las_compras() from public, anon;
revoke execute on function public.compras_ver() from public, anon;
revoke execute on function public.compra_agregar(uuid, text, integer, text, text, text, text, text) from public, anon;
revoke execute on function public.compra_corregir(uuid, text, integer, text, text, text, text, text) from public, anon;
revoke execute on function public.compra_boleta(uuid, text, text) from public, anon;
revoke execute on function public.compra_revisar(uuid, text, text) from public, anon;
revoke execute on function public.compra_comprobante(uuid, text, text) from public, anon;
revoke execute on function public.compra_editar(uuid, text, text, integer) from public, anon;
revoke execute on function public.compra_eliminar(uuid) from public, anon;
revoke execute on function public.lista_compras_cambiar(uuid, text, boolean) from public, anon;
grant execute on function public.puedo_ver_todas_las_compras() to authenticated;
grant execute on function public.compras_ver() to authenticated;
grant execute on function public.compra_agregar(uuid, text, integer, text, text, text, text, text) to authenticated;
grant execute on function public.compra_corregir(uuid, text, integer, text, text, text, text, text) to authenticated;
grant execute on function public.compra_boleta(uuid, text, text) to authenticated;
grant execute on function public.compra_revisar(uuid, text, text) to authenticated;
grant execute on function public.compra_comprobante(uuid, text, text) to authenticated;
grant execute on function public.compra_editar(uuid, text, text, integer) to authenticated;
grant execute on function public.compra_eliminar(uuid) to authenticated;
grant execute on function public.lista_compras_cambiar(uuid, text, boolean) to authenticated;
