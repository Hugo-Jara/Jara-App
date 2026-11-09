-- Jara App · 0044 · Tabla del jueves: la fase con partidos jugados
--
-- copafacil guarda la tabla de cada equipo por fase del torneo. La 0039 tomaba
-- siempre la fase más nueva; cuando la liga abre una fase nueva (que parte en
-- cero), la tabla del Senior Jueves quedaba con todos en 0 puntos. Ahora se
-- toma la fase más nueva que ya tenga partidos jugados.
--
-- Solo cambia tabla_desde_copafacil. No toca plata ni datos personales.

create or replace function public.tabla_desde_copafacil(p_teams jsonb)
returns jsonb language plpgsql immutable set search_path = public as $$
declare
  v_fase text;
  v_grupo text;
  v_filas jsonb;
begin
  -- La fase más nueva que ya tenga partidos jugados; si ninguna tiene, la más nueva.
  select f into v_fase
    from jsonb_each(coalesce(p_teams, '{}'::jsonb)) e(k, t), jsonb_object_keys(t->'dt') f
   where jsonb_typeof(t->'dt') = 'object'
   group by f
   order by bool_or(coalesce(substring(t->'dt'->f->>'dt' from '(?:^|#)1=([0-9.]+)')::numeric, 0) > 0) desc, f desc
   limit 1;
  if v_fase is null then return null; end if;

  with eq as (
    select trim(t->>'name') as nombre, coalesce(t->>'g', '') as g,
           (t->'dt'->v_fase->>'col')::int as col, (t->'dt'->v_fase->>'colg')::int as colg,
           (select jsonb_object_agg(split_part(x, '=', 1), split_part(x, '=', 2))
              from unnest(string_to_array(t->'dt'->v_fase->>'dt', '#')) x where x like '%=%') as n
      from jsonb_each(p_teams) e(k, t)
     where t->'dt'->v_fase is not null and coalesce(trim(t->>'name'), '') <> '' and t->>'name' !~* 'cupo libre'
  ), filas as (
    select nombre, g, col, colg, jsonb_build_object(
             'equipo', left(nombre, 60), 'es_jara', nombre ilike '%jara%',
             'pj', coalesce(round((n->>'1')::numeric)::int, 0), 'pg', coalesce(round((n->>'2')::numeric)::int, 0),
             'pe', coalesce(round((n->>'3')::numeric)::int, 0), 'pp', coalesce(round((n->>'4')::numeric)::int, 0),
             'gf', coalesce(round((n->>'5')::numeric)::int, 0), 'gc', coalesce(round((n->>'6')::numeric)::int, 0),
             'pts', coalesce(round((n->>'0')::numeric)::int, 0)) as fila
      from eq
  )
  select (select g from filas where nombre ilike '%jara%' limit 1),
         jsonb_build_object(
           'general', (select jsonb_agg(fila order by col nulls last, nombre) from filas),
           'grupos', (select jsonb_object_agg(g, x) from (
                        select g, jsonb_agg(fila order by colg nulls last, nombre) as x from filas where g <> '' group by g) s))
    into v_grupo, v_filas;
  return v_filas || jsonb_build_object('grupo', v_grupo);
end;
$$;

revoke execute on function public.tabla_desde_copafacil(jsonb) from public, anon;
