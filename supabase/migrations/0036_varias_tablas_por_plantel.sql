-- Jara App · 0036 · Varias tablas por plantel (pestañas) y carga desde un pantallazo
--
-- El Senior Jueves juega en copafacil, que muestra dos tablas: la de su grupo
-- ("Grupo A") y la general. Hasta ahora cada plantel tenía una sola tabla.
-- Con esto un plantel puede tener varias, cada una con su nombre, y la app las
-- muestra con una pestañita arriba. La tabla de siempre queda con nombre vacío
-- (no se muestra pestaña si el plantel tiene una sola).
--
-- La lectura del pantallazo se hace en el teléfono (la app lee el texto de la
-- imagen y el encargado lo revisa antes de guardar): no pasa por la base ni por
-- servicios externos con llave. Para la base es un guardado normal.
--
-- Cambios:
--   - tablas_posiciones: columna grupo (nombre de la pestaña) y creada_en (orden
--     de las pestañas). La llave pasa de (equipo_id) a (equipo_id, grupo).
--   - tablas_posiciones(): una entrada por tabla (plantel + pestaña).
--   - tabla_guardar, tabla_conectar y tabla_refrescar: reciben la pestaña
--     (p_grupo, por defecto la de siempre). tabla_guardar puede renombrarla
--     (p_grupo_antes). Nueva tabla_borrar para quitar una pestaña.
--
-- Revisión: no toca plata ni datos personales. Los permisos son los mismos de
-- la 0026 y la 0032 (encargado del plantel o administrador; cuentas de prueba
-- solo miran). La revisa el administrador de la app.

alter table public.tablas_posiciones
  add column grupo text not null default '' check (grupo = trim(grupo) and length(grupo) <= 30),
  add column creada_en timestamptz not null default now();

alter table public.tablas_posiciones drop constraint tablas_posiciones_pkey;
alter table public.tablas_posiciones add primary key (equipo_id, grupo);

-- Lectura: una entrada por tabla, en el orden de los planteles y, dentro de
-- cada plantel, en el orden en que se crearon las pestañas. Un plantel sin
-- tablas viene igual (una entrada vacía) para que su encargado pueda cargarla.
create or replace function public.tablas_posiciones()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'equipo_id', e.id, 'equipo', e.nombre, 'grupo', coalesce(t.grupo, ''),
           'torneo', t.torneo, 'filas', coalesce(t.filas, '[]'::jsonb), 'fuente', t.fuente,
           'actualizada_en', case when jsonb_array_length(coalesce(t.filas, '[]'::jsonb)) > 0 then t.actualizada_en end,
           'conectada', t.deporstar_tabla is not null,
           'deporstar_tabla', t.deporstar_tabla,
           'revisada_en', t.revisada_en,
           'puedo_editar', public.soy_encargado(e.id) and not public.soy_cuenta_de_prueba())
         order by e.orden, e.nombre, t.creada_en, t.grupo), '[]'::jsonb)
    from public.equipos e
    left join public.tablas_posiciones t on t.equipo_id = e.id
   where e.club_id = public.mi_club_id();
$$;

-- Guardar: igual que la 0026, más la pestaña. Si viene p_grupo_antes distinto
-- de p_grupo, la pestaña se renombra (conserva su conexión con la liga).
drop function public.tabla_guardar(uuid, text, jsonb, text);
create or replace function public.tabla_guardar(
  p_equipo uuid, p_torneo text, p_filas jsonb, p_fuente text default null,
  p_grupo text default '', p_grupo_antes text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  f jsonb;
  v_filas jsonb := '[]'::jsonb;
  v_nombre text;
  v_jara int := 0;
  v_num jsonb;
  k text;
  v_grupo text := left(trim(coalesce(p_grupo, '')), 30);
  v_antes text := trim(p_grupo_antes);
begin
  if not exists (select 1 from public.equipos where id = p_equipo and club_id = public.mi_club_id())
     or not public.soy_encargado(p_equipo) then
    raise exception 'Solo el encargado del plantel puede cambiar su tabla';
  end if;
  perform public.prueba_no_puede('cambiar la tabla de posiciones');

  if p_filas is null or jsonb_typeof(p_filas) <> 'array' then
    raise exception 'La tabla viene vacía';
  end if;
  if jsonb_array_length(p_filas) > 40 then
    raise exception 'La tabla tiene demasiados equipos (máximo 40)';
  end if;
  if p_fuente is not null and trim(p_fuente) <> '' and trim(p_fuente) !~ '^https://' then
    raise exception 'El link de la liga tiene que partir con https://';
  end if;

  for f in select * from jsonb_array_elements(p_filas) loop
    v_nombre := trim(coalesce(f->>'equipo', ''));
    if v_nombre = '' then raise exception 'Hay una fila sin nombre de equipo'; end if;
    if length(v_nombre) > 60 then raise exception 'El nombre "%" es muy largo', left(v_nombre, 20); end if;
    v_num := '{}'::jsonb;
    foreach k in array array['pj', 'pg', 'pe', 'pp', 'gf', 'gc', 'pts'] loop
      if coalesce(f->>k, '') !~ '^-?[0-9]{1,3}$' then
        raise exception 'Revisa los números de %', v_nombre;
      end if;
      if (f->>k)::int < 0 and k <> 'pts' then
        raise exception 'Revisa los números de %', v_nombre;
      end if;
      v_num := v_num || jsonb_build_object(k, (f->>k)::int);
    end loop;
    if coalesce((f->>'es_jara')::boolean, false) then v_jara := v_jara + 1; end if;
    v_filas := v_filas || jsonb_build_array(
      jsonb_build_object('equipo', v_nombre, 'es_jara', coalesce((f->>'es_jara')::boolean, false)) || v_num);
  end loop;
  if v_jara > 1 then raise exception 'Marca solo una fila como el Jara'; end if;

  -- Renombrar la pestaña.
  if v_antes is not null and v_antes <> v_grupo then
    if exists (select 1 from public.tablas_posiciones where equipo_id = p_equipo and grupo = v_grupo) then
      raise exception 'Ya hay una tabla que se llama "%"', v_grupo;
    end if;
    update public.tablas_posiciones set grupo = v_grupo
     where equipo_id = p_equipo and grupo = v_antes;
  end if;

  insert into public.tablas_posiciones (equipo_id, club_id, grupo, torneo, filas, fuente, actualizada_en, actualizada_por)
  values (p_equipo, public.mi_club_id(), v_grupo, nullif(trim(p_torneo), ''), v_filas,
          nullif(trim(p_fuente), ''), now(), public.mi_persona_id())
  on conflict (equipo_id, grupo) do update
     set torneo = excluded.torneo, filas = excluded.filas, fuente = excluded.fuente,
         actualizada_en = excluded.actualizada_en, actualizada_por = excluded.actualizada_por;
end;
$$;

-- Quitar una pestaña.
create or replace function public.tabla_borrar(p_equipo uuid, p_grupo text default '')
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.equipos where id = p_equipo and club_id = public.mi_club_id())
     or not public.soy_encargado(p_equipo) then
    raise exception 'Solo el encargado del plantel puede borrar su tabla';
  end if;
  perform public.prueba_no_puede('borrar la tabla de posiciones');
  delete from public.tablas_posiciones where equipo_id = p_equipo and grupo = coalesce(trim(p_grupo), '');
end;
$$;

-- Conectar a Deporstar: igual que la 0032, para una pestaña.
drop function public.tabla_conectar(uuid, int);
create or replace function public.tabla_conectar(p_equipo uuid, p_deporstar int, p_grupo text default '')
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
  insert into public.tablas_posiciones (equipo_id, club_id, grupo, deporstar_tabla, revisada_en)
  values (p_equipo, public.mi_club_id(), left(trim(coalesce(p_grupo, '')), 30), p_deporstar, null)
  on conflict (equipo_id, grupo) do update set deporstar_tabla = excluded.deporstar_tabla, revisada_en = null;
end;
$$;

-- Traer desde la liga: igual que la 0032, para una pestaña.
drop function public.tabla_refrescar(uuid, boolean);
create or replace function public.tabla_refrescar(p_equipo uuid, p_forzar boolean default false, p_grupo text default '')
returns boolean language plpgsql security definer set search_path = public as $$
declare
  t public.tablas_posiciones;
  v_status int;
  v_cuerpo text;
  v_filas jsonb;
begin
  select * into t from public.tablas_posiciones
   where equipo_id = p_equipo and grupo = coalesce(trim(p_grupo), '') and club_id = public.mi_club_id();
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
    update public.tablas_posiciones set revisada_en = now() where equipo_id = p_equipo and grupo = t.grupo;
    return false;
  end if;
  update public.tablas_posiciones
     set filas = v_filas, revisada_en = now(), actualizada_en = now(), actualizada_por = null,
         fuente = coalesce(fuente, 'https://deporstar.com')
   where equipo_id = p_equipo and grupo = t.grupo;
  return true;
end;
$$;

revoke execute on function public.tabla_guardar(uuid, text, jsonb, text, text, text) from public, anon;
revoke execute on function public.tabla_borrar(uuid, text) from public, anon;
revoke execute on function public.tabla_conectar(uuid, int, text) from public, anon;
revoke execute on function public.tabla_refrescar(uuid, boolean, text) from public, anon;
grant execute on function public.tabla_guardar(uuid, text, jsonb, text, text, text) to authenticated;
grant execute on function public.tabla_borrar(uuid, text) to authenticated;
grant execute on function public.tabla_conectar(uuid, int, text) to authenticated;
grant execute on function public.tabla_refrescar(uuid, boolean, text) to authenticated;
