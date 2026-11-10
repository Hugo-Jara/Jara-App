-- Jara App · 0046 · ¿Quién atajó? Goles recibidos de cada arquero
--
-- Al anotar el resultado de un partido, quien anota marca quién atajó: uno
-- (se lleva todos los goles en contra) o dos (un tiempo cada uno, o uno entró
-- por el otro), con los goles que recibió cada uno. Así cada arquero tiene sus
-- números aparte en su perfil: partidos al arco, goles recibidos y vallas
-- invictas, aunque se turnen los partidos.
--
-- En los partidos sin arquero marcado (los anotados antes de esto), se le
-- cuentan a quien tenga "Arquero" como posición en su perfil y haya jugado.
--
-- Agrega la tabla partido_arqueros (cerrada al navegador) y tres funciones:
-- partido_arco (leer), partido_arco_guardar (anotar) y arquero_cifras (sumar).
-- No toca plata ni permisos: anota quien ya puede anotar el resultado.

create table public.partido_arqueros (
  partido_id uuid not null references public.partidos(id) on delete cascade,
  persona_id uuid not null references public.personas(id) on delete cascade,
  recibidos  smallint not null check (recibidos between 0 and 99),
  primary key (partido_id, persona_id)
);
alter table public.partido_arqueros enable row level security;
revoke all on public.partido_arqueros from anon, authenticated;

-- Quién atajó en un partido, y los arqueros de su plantel (para sugerirlos).
--   { "arqueros": [{"persona_id": "...", "recibidos": 1}], "sugeridos": ["persona_id", ...] }
create or replace function public.partido_arco(p_partido uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  p public.partidos;
begin
  if public.mi_persona_id() is null then raise exception 'Tu cuenta no está en la nómina del club'; end if;
  select * into p from public.partidos where id = p_partido and club_id = public.mi_club_id();
  if p.id is null then raise exception 'Ese partido no existe'; end if;
  return jsonb_build_object(
    'arqueros', coalesce((
      select jsonb_agg(jsonb_build_object('persona_id', a.persona_id, 'recibidos', a.recibidos) order by a.recibidos, a.persona_id)
        from public.partido_arqueros a where a.partido_id = p.id), '[]'::jsonb),
    'sugeridos', coalesce((
      select jsonb_agg(distinct pe.persona_id)
        from public.persona_equipos pe join public.perfiles f on f.persona_id = pe.persona_id
       where pe.equipo_id = p.equipo_id and f.posicion = 'arquero'), '[]'::jsonb));
end;
$$;

-- Anotar quién atajó. Se llama después de partido_resultado.
--   p_arqueros: [{"persona_id": "...", "recibidos": 2}, ...]; vacío = nadie marcado.
-- Con uno solo, recibe todos los goles en contra (lo que venga en recibidos se
-- ignora). Con dos o más, los recibidos tienen que sumar los goles en contra.
create or replace function public.partido_arco_guardar(p_partido uuid, p_arqueros jsonb default '[]')
returns void language plpgsql security definer set search_path = public as $$
declare
  p public.partidos;
  g jsonb;
  v_persona uuid;
  v_n int;
  v_suma int := 0;
  v_vistos uuid[] := '{}';
begin
  select * into p from public.partidos where id = p_partido and club_id = public.mi_club_id();
  if p.id is null then raise exception 'Ese partido no existe'; end if;
  if not public.puedo_anotar(p.equipo_id) then
    raise exception 'Solo quien anota los partidos puede poner quién atajó';
  end if;
  if p_arqueros is not null and jsonb_typeof(p_arqueros) <> 'array' then raise exception 'La lista de arqueros no es válida'; end if;

  delete from public.partido_arqueros where partido_id = p.id;
  v_n := coalesce(jsonb_array_length(p_arqueros), 0);
  if v_n = 0 or p.goles_contra is null then return; end if;
  if v_n > 3 then raise exception 'Marca como máximo tres arqueros'; end if;

  for g in select * from jsonb_array_elements(p_arqueros) loop
    v_persona := (g->>'persona_id')::uuid;
    if v_persona = any (v_vistos) then raise exception 'Un arquero está repetido'; end if;
    if not exists (select 1 from public.personas where id = v_persona and club_id = p.club_id) then
      raise exception 'Ese arquero no está en la nómina del club';
    end if;
    v_vistos := v_vistos || v_persona;
    insert into public.partido_arqueros (partido_id, persona_id, recibidos)
    values (p.id, v_persona, case when v_n = 1 then p.goles_contra else coalesce((g->>'recibidos')::int, 0) end);
    v_suma := v_suma + case when v_n = 1 then p.goles_contra else coalesce((g->>'recibidos')::int, 0) end;
    -- El que atajó, jugó.
    insert into public.partido_jugadores (partido_id, persona_id) values (p.id, v_persona) on conflict do nothing;
  end loop;
  if v_suma <> p.goles_contra then
    raise exception 'Los goles que recibió cada arquero suman % y el rival hizo %', v_suma, p.goles_contra;
  end if;
end;
$$;

-- Las cifras de un arquero: partidos al arco, goles recibidos, vallas invictas
-- y lo que recibió en cada partido ({partido_id: recibidos}).
-- Cuentan los partidos donde lo marcaron al arco y, en los que no tienen a
-- nadie marcado, los que jugó si su posición es Arquero.
create or replace function public.arquero_cifras(p_persona uuid, p_anio int default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if public.mi_persona_id() is null then raise exception 'Tu cuenta no está en la nómina del club'; end if;
  return (
    with ps as (
      select p.id, p.goles_contra from public.partidos p
       where p.club_id = public.mi_club_id()
         and p.goles_favor is not null and p.goles_contra is not null
         and (p_anio is null or extract(year from p.fecha) = p_anio)
    ), mios as (
      select ps.id, a.recibidos from ps join public.partido_arqueros a on a.partido_id = ps.id and a.persona_id = p_persona
      union all
      select ps.id, ps.goles_contra from ps
       where not exists (select 1 from public.partido_arqueros a where a.partido_id = ps.id)
         and exists (select 1 from public.perfiles f where f.persona_id = p_persona and f.posicion = 'arquero')
         and (exists (select 1 from public.partido_jugadores j where j.partido_id = ps.id and j.persona_id = p_persona)
              or exists (select 1 from public.partido_estadisticas g where g.partido_id = ps.id and g.persona_id = p_persona))
    )
    select jsonb_build_object('pj', count(*)::int, 'recibidos', coalesce(sum(recibidos), 0)::int,
                              'invictas', count(*) filter (where recibidos = 0)::int,
                              'por_partido', coalesce(jsonb_object_agg(id, recibidos) filter (where id is not null), '{}'::jsonb))
      from mios);
end;
$$;

revoke execute on function public.partido_arco(uuid) from public, anon;
revoke execute on function public.partido_arco_guardar(uuid, jsonb) from public, anon;
revoke execute on function public.arquero_cifras(uuid, int) from public, anon;
grant execute on function public.partido_arco(uuid) to authenticated;
grant execute on function public.partido_arco_guardar(uuid, jsonb) to authenticated;
grant execute on function public.arquero_cifras(uuid, int) to authenticated;
