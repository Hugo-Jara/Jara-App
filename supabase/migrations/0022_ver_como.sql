-- Jara App · 0022 · "Ver como": cuentas de prueba que cambian de rol en la app
--
-- Una cuenta de prueba es una persona de la nómina con `prueba_roles` (la lista
-- de roles que puede elegir). Esa lista se pone SOLO por SQL, en Supabase, una
-- vez por cuenta: ninguna función de la app la escribe y las tablas no se tocan
-- desde el navegador. Desde la app, la cuenta elige uno de sus roles con
-- `prueba_ver_como()`, que primero le apaga todo y después prende solo ese rol.
--
-- Lo que la base asegura, aunque alguien llame a las funciones a mano:
--   - Una cuenta sin `prueba_roles` no puede cambiar de rol.
--   - Una cuenta de prueba solo elige roles de su lista.
--   - Una cuenta de prueba nunca es administradora (regla de la tabla, y
--     soy_admin() la ignora igual).
--   - Hacienda de prueba es solo mirar: ve las pantallas de Hacienda y del
--     fondo, pero no aprueba, devuelve, entrega, edita ni elimina compras, no
--     sube ni abre comprobantes, no cierra tópicos y no cambia el fondo.
--   - Ninguna cuenta de prueba presenta rendiciones ni las marca como subidas,
--     ni abre comprobantes de transferencia, en ningún rol.
--
-- Roles: socio · equipo_fondo · hacienda · anota_partidos · entrenamientos
--        (administra y cobra) · tesorero (de un plantel a elegir) ·
--        comunicaciones. Administrador no existe como rol de prueba.
--
-- Permiso nuevo: `personas.edita_comunicaciones`, para el módulo de
-- Comunicaciones (todavía ninguna función lo usa).
--
-- Revisión: toca permisos y Hacienda. La revisa el administrador de la app.

-- ---------------------------------------------------------------------------
-- Columnas
-- ---------------------------------------------------------------------------
alter table public.personas add column edita_comunicaciones boolean not null default false;

alter table public.personas add column prueba_roles text[];
alter table public.personas add column prueba_rol text;

alter table public.personas add constraint prueba_roles_validos check (
  prueba_roles is null or (
    cardinality(prueba_roles) > 0
    and prueba_roles <@ array['socio', 'equipo_fondo', 'hacienda', 'anota_partidos',
                              'entrenamientos', 'tesorero', 'comunicaciones']::text[]));
alter table public.personas add constraint prueba_rol_de_su_lista check (
  prueba_rol is null or (prueba_roles is not null and prueba_rol = any (prueba_roles)));
alter table public.personas add constraint prueba_nunca_admin check (
  prueba_roles is null or not es_admin);

-- ---------------------------------------------------------------------------
-- Quién es de prueba y quién mira como Hacienda
-- ---------------------------------------------------------------------------
create or replace function public.soy_cuenta_de_prueba()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.personas
                  where user_id = auth.uid() and estado <> 'inactivo' and prueba_roles is not null);
$$;

-- Igual que en 0001, pero una cuenta de prueba nunca es administradora.
create or replace function public.soy_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select es_admin and prueba_roles is null
       from public.personas where user_id = auth.uid() and estado <> 'inactivo'),
    false);
$$;

-- ¿Veo las pantallas de Hacienda? Administradores y ministros del área que
-- aprueba compras, incluida Hacienda de prueba. Solo para mirar.
create or replace function public.puedo_mirar_hacienda()
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

-- ¿Actúo como Hacienda? Lo mismo, menos las cuentas de prueba. Todas las
-- acciones de Hacienda (aprobar, devolver, entregar, comprobantes, editar,
-- eliminar, tópicos) preguntan por esta función.
create or replace function public.puedo_aprobar_compras()
returns boolean language sql stable security definer set search_path = public as $$
  select not public.soy_cuenta_de_prueba() and public.puedo_mirar_hacienda();
$$;

-- Igual que en 0017, pero ninguna cuenta de prueba abre comprobantes.
create or replace function public.puedo_ver_comprobantes()
returns boolean language sql stable security definer set search_path = public as $$
  select not public.soy_cuenta_de_prueba() and (
       public.puedo_aprobar_compras()
    or exists (select 1 from public.personas p
                where p.id = public.mi_persona_id() and p.ve_comprobantes)
    or exists (select 1 from public.persona_equipos pe
                where pe.persona_id = public.mi_persona_id() and pe.rol = 'tesorero'));
$$;

-- Igual que en 0019: Hacienda de prueba también ve todas las compras.
create or replace function public.puedo_ver_todas_las_compras()
returns boolean language sql stable security definer set search_path = public as $$
  select public.puedo_mirar_hacienda()
      or exists (select 1 from public.personas p
                  where p.id = public.mi_persona_id() and p.ve_compras);
$$;

-- Para las acciones que ninguna cuenta de prueba hace.
create or replace function public.prueba_no_puede(p_accion text)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if public.soy_cuenta_de_prueba() then
    raise exception 'Cuenta de prueba: no puede %', p_accion;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Fondo: mirar y cambiar por separado
-- ---------------------------------------------------------------------------
-- Ver (Más > Fondo y sus archivos): igual que en 0021, más Hacienda de prueba.
create or replace function public.puedo_ver_fondo()
returns boolean language sql stable security definer set search_path = public as $$
  select public.puedo_mirar_hacienda()
      or exists (select 1 from public.personas p
                  where p.id = public.mi_persona_id() and p.equipo_fondo);
$$;

-- Cambiar: Hacienda de verdad o quien tiene equipo_fondo (también de prueba).
create or replace function public.puedo_cambiar_fondo()
returns boolean language sql stable security definer set search_path = public as $$
  select public.puedo_aprobar_compras()
      or exists (select 1 from public.personas p
                  where p.id = public.mi_persona_id() and p.equipo_fondo);
$$;

create or replace function public.fondo_exigir_ver()
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if public.mi_persona_id() is null then raise exception 'Tu cuenta no está en la nómina del club'; end if;
  if not public.puedo_ver_fondo() then raise exception 'Solo el equipo del fondo puede ver y cambiar el fondo'; end if;
end;
$$;

-- Todas las funciones que cambian el fondo pasan por aquí (desde 0021).
create or replace function public.fondo_exigir()
returns void language plpgsql stable security definer set search_path = public as $$
begin
  perform public.fondo_exigir_ver();
  if not public.puedo_cambiar_fondo() then
    raise exception 'Cuenta de prueba: Hacienda es solo mirar';
  end if;
end;
$$;

-- Subir respaldos: solo quien puede cambiar el fondo.
drop policy if exists "subir respaldos del fondo" on storage.objects;
create policy "subir respaldos del fondo" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'fondo' and public.puedo_cambiar_fondo());

-- Igual que en 0021, pero se puede mirar sin poder cambiar.
create or replace function public.fondo_ver()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_club uuid := public.mi_club_id();
  v_ve boolean := public.puedo_ver_comprobantes();
begin
  perform public.fondo_exigir_ver();
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

-- Igual que en 0021, pero ninguna cuenta de prueba presenta una rendición.
create or replace function public.fondo_presentar(p_rendicion integer)
returns integer language plpgsql security definer set search_path = public as $$
declare
  r public.fondo_rendiciones;
  v_n integer;
begin
  perform public.fondo_exigir();
  perform public.prueba_no_puede('presentar una rendición');
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

-- Igual que en 0021, pero ninguna cuenta de prueba la marca como subida.
create or replace function public.fondo_subida(p_rendicion integer, p_subida boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.fondo_exigir();
  perform public.prueba_no_puede('marcar una rendición como subida');
  update public.fondo_rendiciones set subida = coalesce(p_subida, false)
   where club_id = public.mi_club_id() and numero = p_rendicion and presentada_en is not null;
  if not found then raise exception 'Esa rendición no está presentada'; end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Compras: Hacienda de prueba ve la pantalla de Hacienda
-- ---------------------------------------------------------------------------
-- Igual que en 0020, pero 'es_hacienda' llega también a Hacienda de prueba
-- (con 'hacienda_solo_mirar'), para que vea la pantalla. El link público de
-- cada tópico sigue llegando solo a Hacienda de verdad.
create or replace function public.compras_ver()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_yo uuid := public.mi_persona_id();
  v_todas boolean := public.puedo_ver_todas_las_compras();
  v_hacienda boolean := public.puedo_aprobar_compras();
  v_mira boolean := public.puedo_mirar_hacienda();
  v_ve boolean := public.puedo_ver_comprobantes();
begin
  if v_yo is null then raise exception 'Tu cuenta no está en la nómina del club'; end if;
  return jsonb_build_object(
    've_todas', v_todas, 'es_hacienda', v_mira, 'hacienda_solo_mirar', v_mira and not v_hacienda, 'puedo_ver_comprobantes', v_ve,
    'topicos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'slug', t.slug, 'nombre', t.nombre, 'activo', t.activo,
               -- La carpeta sirve para subir archivos a la lista abierta del tópico.
               'carpeta', case when t.activo then (select p.carpeta from public.pedidos p
                                                    where p.club_id = t.club_id and p.topico = t.slug and p.abierto) end,
               'token_envio', case when v_hacienda then t.token_envio end)
             order by t.activo desc, t.nombre)
        from public.topicos t
       where t.club_id = public.mi_club_id() and (t.activo or v_mira)), '[]'::jsonb),
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

-- ---------------------------------------------------------------------------
-- Cambiar de rol
-- ---------------------------------------------------------------------------
-- Apaga todos los permisos de la cuenta de prueba que llama y prende solo los
-- del rol elegido. Nunca toca a otra persona ni la lista prueba_roles.
create or replace function public.prueba_ver_como(p_rol text, p_equipo uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_yo uuid := public.mi_persona_id();
  v_roles text[];
  v_club uuid;
  v_area uuid;
begin
  if v_yo is null then raise exception 'Tu cuenta no está en la nómina del club'; end if;
  select prueba_roles, club_id into v_roles, v_club from public.personas where id = v_yo for update;
  if v_roles is null then raise exception 'Solo las cuentas de prueba pueden cambiar de rol'; end if;
  if p_rol is null or not (p_rol = any (v_roles)) then
    raise exception 'Esta cuenta de prueba no tiene ese rol';
  end if;

  if p_rol = 'hacienda' then
    select id into v_area from public.areas
     where club_id = v_club and aprueba_compras order by orden, nombre limit 1;
    if v_area is null then raise exception 'El club no tiene un área que apruebe compras'; end if;
  end if;
  if p_rol = 'tesorero' and not exists (select 1 from public.equipos where id = p_equipo and club_id = v_club) then
    raise exception 'Elige un plantel';
  end if;

  -- Primero todo apagado.
  update public.personas
     set es_admin = false, equipo_fondo = false, ve_compras = false, ve_comprobantes = false,
         anota_partidos = false, administra_entrenamientos = false, cobra_entrenamientos = false,
         edita_comunicaciones = false, prueba_rol = p_rol
   where id = v_yo;
  delete from public.persona_areas where persona_id = v_yo;
  delete from public.persona_equipos where persona_id = v_yo;

  -- Después, solo lo del rol.
  if p_rol = 'equipo_fondo' then
    update public.personas set equipo_fondo = true where id = v_yo;
  elsif p_rol = 'hacienda' then
    insert into public.persona_areas (persona_id, area_id, rol) values (v_yo, v_area, 'ministro');
  elsif p_rol = 'anota_partidos' then
    update public.personas set anota_partidos = true where id = v_yo;
  elsif p_rol = 'entrenamientos' then
    update public.personas set administra_entrenamientos = true, cobra_entrenamientos = true where id = v_yo;
  elsif p_rol = 'tesorero' then
    insert into public.persona_equipos (persona_id, equipo_id, rol) values (v_yo, p_equipo, 'tesorero');
  elsif p_rol = 'comunicaciones' then
    update public.personas set edita_comunicaciones = true where id = v_yo;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Mis datos
-- ---------------------------------------------------------------------------
-- Igual que en 0009, más:
--   'aprueba_compras': también Hacienda de prueba (para ver sus pantallas),
--   'hacienda_solo_mirar': true si es Hacienda de prueba,
--   'edita_comunicaciones',
--   'prueba': null en una cuenta normal; en una de prueba, sus roles, el rol
--             actual y los planteles del club (para elegir como tesorero).
create or replace function public.mi_persona()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  p public.personas;
begin
  select * into p from public.personas where user_id = auth.uid() and estado <> 'inactivo';
  if p.id is null then
    return null;
  end if;
  return jsonb_build_object(
    'id', p.id, 'nombre', p.nombre, 'es_admin', public.soy_admin(), 'estado', p.estado,
    'club', (select jsonb_build_object('nombre', c.nombre, 'etiqueta_area', c.etiqueta_area)
               from public.clubes c where c.id = p.club_id),
    'equipos', coalesce((
      select jsonb_agg(x order by (x->>'orden')::int, x->>'nombre') from (
        select jsonb_build_object(
                 'id', e.id, 'nombre', e.nombre, 'orden', e.orden,
                 'encargado', bool_or(pe.rol = 'encargado'),
                 'tesorero', bool_or(pe.rol = 'tesorero')) as x
          from public.persona_equipos pe join public.equipos e on e.id = pe.equipo_id
         where pe.persona_id = p.id
         group by e.id) s), '[]'::jsonb),
    'aprueba_compras', public.puedo_mirar_hacienda(),
    'hacienda_solo_mirar', public.puedo_mirar_hacienda() and not public.puedo_aprobar_compras(),
    'es_encargado', public.soy_encargado_de_alguno(),
    'edita_comunicaciones', p.edita_comunicaciones,
    'prueba', case when p.prueba_roles is not null then jsonb_build_object(
      'roles', to_jsonb(p.prueba_roles),
      'rol', p.prueba_rol,
      'planteles', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'nombre', e.nombre) order by e.orden, e.nombre)
                               from public.equipos e where e.club_id = p.club_id), '[]'::jsonb)) end);
end;
$$;

-- ---------------------------------------------------------------------------
-- Permisos de las funciones nuevas
-- ---------------------------------------------------------------------------
revoke execute on function public.soy_cuenta_de_prueba() from public, anon, authenticated;
revoke execute on function public.prueba_no_puede(text) from public, anon, authenticated;
revoke execute on function public.fondo_exigir_ver() from public, anon, authenticated;
revoke execute on function public.puedo_mirar_hacienda() from public, anon;
revoke execute on function public.puedo_cambiar_fondo() from public, anon;
revoke execute on function public.prueba_ver_como(text, uuid) from public, anon;
grant execute on function public.puedo_mirar_hacienda() to authenticated;
-- La usa la regla de Storage para subir respaldos del fondo.
grant execute on function public.puedo_cambiar_fondo() to authenticated;
grant execute on function public.prueba_ver_como(text, uuid) to authenticated;
