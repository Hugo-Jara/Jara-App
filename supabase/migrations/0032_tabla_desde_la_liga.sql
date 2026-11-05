-- Jara App · 0032 · La tabla de posiciones se actualiza sola desde la liga
--
-- Las tablas de los planteles del sábado las publica la liga en Deporstar, que
-- las entrega como datos (JSON) en una dirección pública, sin login:
--   https://api.deporstar.com/api/fixture/match/tabla-positions/<número>/
-- Cada plantel guarda su <número> (la tabla de su división). Con eso:
--   - Al abrir la tabla en la app, si la última revisión tiene más de 3 horas,
--     la base va a buscarla a Deporstar y la guarda (lo puede gatillar
--     cualquier socio: los datos vienen de la liga, no de quien mira).
--   - El encargado (o un administrador) tiene el botón "Actualizar desde la
--     liga", que la trae en el acto.
-- La carga a mano de la 0026 sigue igual (Senior Jueves juega en copafacil,
-- que no entrega los datos así).
--
-- Cómo se lee la página desde la base: con la extensión `http` de Supabase
-- (pgsql-http). Solo se arma la dirección de Deporstar con un número entero:
-- no se puede pedir otra página.
--
-- Revisión: no toca plata ni datos personales. Agrega dos columnas, una
-- extensión y tres funciones. La revisa el administrador de la app.

-- La extensión. En el Postgres de prueba (PGlite) no existe: ahí las pruebas
-- la reemplazan por una de mentira y esto se salta.
do $$
begin
  if to_regprocedure('extensions.http_get(character varying)') is null then
    create extension if not exists http with schema extensions;
  end if;
exception when others then
  raise warning 'Sin la extensión http (%): la tabla no se podrá actualizar desde la liga', sqlerrm;
end;
$$;

alter table public.tablas_posiciones
  add column deporstar_tabla int check (deporstar_tabla is null or deporstar_tabla between 1 and 99999999),
  add column revisada_en timestamptz;

-- De la respuesta de Deporstar a las filas de la tabla (mismo formato que
-- tabla_guardar). Se respeta el orden de la liga. Aparte para poder probarla.
create or replace function public.tabla_desde_deporstar(p jsonb)
returns jsonb language plpgsql immutable set search_path = public as $$
declare
  f jsonb;
  v_filas jsonb := '[]'::jsonb;
  v_jara boolean := false;
  v_es boolean;
  v_nombre text;
begin
  if p is null or jsonb_typeof(p) <> 'array' or jsonb_array_length(p) = 0 then
    raise exception 'La liga no devolvió una tabla';
  end if;
  for f in select * from jsonb_array_elements(p) loop
    continue when coalesce((f->>'team_delete')::boolean, false) or not coalesce((f->>'enable')::boolean, true);
    v_nombre := left(trim(coalesce(f->>'team', '')), 60);
    continue when v_nombre = '';
    v_es := not v_jara and v_nombre ilike '%jara%';
    v_jara := v_jara or v_es;
    v_filas := v_filas || jsonb_build_array(jsonb_build_object(
      'equipo', v_nombre, 'es_jara', v_es,
      'pj', coalesce((f->>'pj')::int, 0), 'pg', coalesce((f->>'pg')::int, 0),
      'pe', coalesce((f->>'pe')::int, 0), 'pp', coalesce((f->>'pp')::int, 0),
      'gf', coalesce((f->>'gf')::int, 0), 'gc', coalesce((f->>'gc')::int, 0),
      'pts', coalesce((f->>'pts')::int, 0)));
    exit when jsonb_array_length(v_filas) >= 40;
  end loop;
  if jsonb_array_length(v_filas) = 0 then raise exception 'La liga no devolvió una tabla'; end if;
  return v_filas;
end;
$$;

-- Conectar (o desconectar, con null) un plantel a su tabla de Deporstar.
create or replace function public.tabla_conectar(p_equipo uuid, p_deporstar int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.equipos where id = p_equipo and club_id = public.mi_club_id())
     or not public.soy_encargado(p_equipo) then
    raise exception 'Solo el encargado del plantel puede conectar su tabla';
  end if;
  perform public.prueba_no_puede('conectar la tabla de posiciones');
  if p_deporstar is not null and (p_deporstar < 1 or p_deporstar > 99999999) then
    raise exception 'Ese número de tabla no es válido';
  end if;
  insert into public.tablas_posiciones (equipo_id, club_id, deporstar_tabla, revisada_en)
  values (p_equipo, public.mi_club_id(), p_deporstar, null)
  on conflict (equipo_id) do update set deporstar_tabla = excluded.deporstar_tabla, revisada_en = null;
end;
$$;

-- Traer la tabla desde la liga. Sin p_forzar, solo si pasaron 3 horas desde la
-- última revisión (cualquier socio). Con p_forzar, en el acto (el encargado).
-- Devuelve true si la tabla cambió.
create or replace function public.tabla_refrescar(p_equipo uuid, p_forzar boolean default false)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  t public.tablas_posiciones;
  v_status int;
  v_cuerpo text;
  v_filas jsonb;
begin
  select * into t from public.tablas_posiciones
   where equipo_id = p_equipo and club_id = public.mi_club_id();
  if t.equipo_id is null or t.deporstar_tabla is null then
    raise exception 'La tabla de este plantel no está conectada a la liga';
  end if;
  if p_forzar then
    if not public.soy_encargado(p_equipo) then
      raise exception 'Solo el encargado del plantel puede actualizarla en el acto';
    end if;
  elsif t.revisada_en is not null and t.revisada_en > now() - interval '3 hours' then
    return false;
  end if;

  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '8000');
  select status, content into v_status, v_cuerpo
    from extensions.http_get(format('https://api.deporstar.com/api/fixture/match/tabla-positions/%s/', t.deporstar_tabla));
  if v_status is distinct from 200 then
    raise exception 'La página de la liga no respondió (%). Intenta más rato.', coalesce(v_status::text, 'sin respuesta');
  end if;
  begin
    v_filas := public.tabla_desde_deporstar(v_cuerpo::jsonb);
  exception when invalid_text_representation then
    raise exception 'La liga respondió algo que no es una tabla';
  end;

  if v_filas = t.filas then
    update public.tablas_posiciones set revisada_en = now() where equipo_id = p_equipo;
    return false;
  end if;
  update public.tablas_posiciones
     set filas = v_filas, revisada_en = now(), actualizada_en = now(), actualizada_por = null,
         fuente = coalesce(fuente, 'https://deporstar.com')
   where equipo_id = p_equipo;
  return true;
end;
$$;

-- tablas_posiciones() de la 0026, ahora dice si está conectada.
create or replace function public.tablas_posiciones()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'equipo_id', e.id, 'equipo', e.nombre,
           'torneo', t.torneo, 'filas', coalesce(t.filas, '[]'::jsonb), 'fuente', t.fuente,
           'actualizada_en', case when jsonb_array_length(coalesce(t.filas, '[]'::jsonb)) > 0 then t.actualizada_en end,
           'conectada', t.deporstar_tabla is not null,
           'deporstar_tabla', t.deporstar_tabla,
           'revisada_en', t.revisada_en,
           'puedo_editar', public.soy_encargado(e.id) and not public.soy_cuenta_de_prueba())
         order by e.orden, e.nombre), '[]'::jsonb)
    from public.equipos e
    left join public.tablas_posiciones t on t.equipo_id = e.id
   where e.club_id = public.mi_club_id();
$$;

revoke execute on function public.tabla_desde_deporstar(jsonb) from public, anon, authenticated;
revoke execute on function public.tabla_conectar(uuid, int) from public, anon;
revoke execute on function public.tabla_refrescar(uuid, boolean) from public, anon;
grant execute on function public.tabla_conectar(uuid, int) to authenticated;
grant execute on function public.tabla_refrescar(uuid, boolean) to authenticated;
