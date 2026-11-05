-- Jara App · 0026 · Tabla de posiciones por plantel
--
-- Cada plantel (Junior Sábado, Senior Sábado, Senior Jueves) juega en su liga y
-- el club quiere ver "cómo vamos" sin salir de la app.
--
-- De dónde salen los datos: las páginas de las ligas publican la tabla como
-- imagen (cof.cl) o la arman con JavaScript (copafacil), así que no se pueden
-- leer solas. El encargado del plantel copia la tabla en la app después de cada
-- fecha. Se guarda la tabla completa de una vez (una fila por equipo de la
-- liga, en el orden de la tabla), no se calcula con nuestros resultados porque
-- los partidos de los otros equipos no los tenemos.
--
-- Las fechas que vienen (fixture) no necesitan nada nuevo: se cargan como
-- partidos normales con partido_guardar (0010/0014).
--
-- Quién ve: todo el club. Quién cambia: el encargado del plantel o un
-- administrador (soy_encargado). Las cuentas de prueba solo miran.
--
-- Revisión: no toca plata ni datos personales. Permisos nuevos solo para esta
-- tabla. La revisa el administrador de la app.

create table public.tablas_posiciones (
  equipo_id        uuid primary key references public.equipos(id) on delete cascade,
  club_id          uuid not null references public.clubes(id) on delete cascade,
  -- "Liga COF · Clausura 2026"
  torneo           text check (torneo is null or length(torneo) <= 80),
  -- [{equipo, pj, pg, pe, pp, gf, gc, pts, es_jara}], en el orden de la tabla.
  filas            jsonb not null default '[]'::jsonb check (jsonb_typeof(filas) = 'array'),
  -- Link a la página de la liga, para quien quiera ver la original.
  fuente           text check (fuente is null or fuente ~ '^https://'),
  actualizada_en   timestamptz not null default now(),
  actualizada_por  uuid references public.personas(id) on delete set null
);

alter table public.tablas_posiciones enable row level security;
revoke all on public.tablas_posiciones from anon, authenticated;

-- Las tablas de todos los planteles del club, en el orden de los planteles.
-- Un plantel sin tabla cargada viene igual (filas vacías) para que su
-- encargado vea el botón de cargarla.
create or replace function public.tablas_posiciones()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'equipo_id', e.id, 'equipo', e.nombre,
           'torneo', t.torneo, 'filas', coalesce(t.filas, '[]'::jsonb), 'fuente', t.fuente,
           'actualizada_en', t.actualizada_en,
           'puedo_editar', public.soy_encargado(e.id) and not public.soy_cuenta_de_prueba())
         order by e.orden, e.nombre), '[]'::jsonb)
    from public.equipos e
    left join public.tablas_posiciones t on t.equipo_id = e.id
   where e.club_id = public.mi_club_id();
$$;

-- Guardar la tabla completa de un plantel (reemplaza la anterior).
create or replace function public.tabla_guardar(
  p_equipo uuid, p_torneo text, p_filas jsonb, p_fuente text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  f jsonb;
  v_filas jsonb := '[]'::jsonb;
  v_nombre text;
  v_jara int := 0;
  v_num jsonb;
  k text;
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

  -- Se limpia cada fila: solo pasan los campos conocidos, números enteros
  -- entre 0 y 999 (los puntos pueden ser negativos por descuentos).
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

  insert into public.tablas_posiciones (equipo_id, club_id, torneo, filas, fuente, actualizada_en, actualizada_por)
  values (p_equipo, public.mi_club_id(), nullif(trim(p_torneo), ''), v_filas,
          nullif(trim(p_fuente), ''), now(), public.mi_persona_id())
  on conflict (equipo_id) do update
     set torneo = excluded.torneo, filas = excluded.filas, fuente = excluded.fuente,
         actualizada_en = excluded.actualizada_en, actualizada_por = excluded.actualizada_por;
end;
$$;

revoke execute on function public.tablas_posiciones() from public, anon;
revoke execute on function public.tabla_guardar(uuid, text, jsonb, text) from public, anon;
grant execute on function public.tablas_posiciones() to authenticated;
grant execute on function public.tabla_guardar(uuid, text, jsonb, text) to authenticated;
