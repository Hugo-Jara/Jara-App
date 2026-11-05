-- Jara App · 0035 · Cómo va la votación del jugador del partido, y cierre cuando votan todos
--
-- Pedido del administrador (5/11): después de votar, ver cuántos votos lleva
-- cada uno, con barras. Antes el conteo solo se veía al cerrar.
--   · partido_charla trae 'conteo' (persona, nombre, votos; de más a menos) y
--     'ver_conteo'. Lo ve quien ya votó o no puede votar, mientras está
--     abierta, y todos al cerrar. Quien puede votar y todavía no vota no lo
--     ve, para que no vote "por el que va ganando".
--   · Los votos siguen sin leerse desde el navegador; nadie ve quién votó
--     por quién. Un voto por persona, que se puede cambiar mientras está abierta.
--
--   · Si ya votaron todos los que pueden votar (los que jugaron y el cuerpo
--     técnico del plantel, contando solo a quienes tienen cuenta en la app),
--     la votación cierra sola y se conoce el MVP sin esperar al plazo.
--
-- Cambia partido_charla, mvp_abierta y mvp_conteo, y agrega mvp_votantes y
-- mvp_cerrada. Revisión: la revisa el administrador de la app antes de correrla.

-- Quiénes pueden votar en un partido: los que jugaron y el cuerpo técnico del
-- plantel, con cuenta en la app (sin cuenta no hay cómo votar).
create or replace function public.mvp_votantes(p public.partidos)
returns setof uuid language sql stable security definer set search_path = public as $$
  select j.persona_id from public.partido_jugadores j join public.personas pr on pr.id = j.persona_id
   where j.partido_id = p.id and pr.user_id is not null
  union
  select pr.id from public.personas pr join public.persona_equipos pe on pe.persona_id = pr.id
   where pe.equipo_id = p.equipo_id and pr.cuerpo_tecnico and pr.user_id is not null;
$$;

-- ¿Cerró? Al pasar el plazo (mvp_cierre, 0034) o cuando ya votaron todos.
create or replace function public.mvp_cerrada(p public.partidos)
returns boolean language sql stable security definer set search_path = public as $$
  select p.goles_favor is not null and (
    now() > public.mvp_cierre(p)
    or (exists (select 1 from public.mvp_votantes(p))
        and not exists (select 1 from public.mvp_votantes(p) v(id)
                         where not exists (select 1 from public.partido_votos pv
                                            where pv.partido_id = p.id and pv.votante_id = v.id))));
$$;

-- Abierta: hay resultado y gente que jugó, y todavía no cierra.
create or replace function public.mvp_abierta(p public.partidos)
returns boolean language sql stable security definer set search_path = public as $$
  select p.goles_favor is not null
     and not public.mvp_cerrada(p)
     and exists (select 1 from public.partido_jugadores j where j.partido_id = p.id);
$$;

-- MVP de cada partido para las estadísticas: igual que en la 0027, contando
-- también los que cerraron porque votaron todos.
create or replace function public.mvp_conteo(p_anio int default null, p_equipos uuid[] default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if public.mi_persona_id() is null then raise exception 'Tu cuenta no está en la nómina del club'; end if;
  return coalesce((
    with ps as (
      select p.id from public.partidos p
       where p.club_id = public.mi_club_id()
         and public.mvp_cerrada(p)
         and (p_equipos is null or p.equipo_id = any (p_equipos))
         and (p_anio is null or extract(year from p.fecha) = p_anio)
    ), c as (
      select v.partido_id, v.elegido_id, count(*) as votos
        from public.partido_votos v where v.partido_id in (select id from ps)
       group by v.partido_id, v.elegido_id
    ), g as (
      select c.partido_id, c.elegido_id from c
       where c.votos = (select max(c2.votos) from c c2 where c2.partido_id = c.partido_id)
    )
    select jsonb_object_agg(elegido_id, veces)
      from (select elegido_id, count(*)::int as veces from g group by elegido_id) t), '{}'::jsonb);
end;
$$;

-- Igual que en la 0033, más el conteo.
create or replace function public.partido_charla(p_partido uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  p public.partidos;
  v_yo uuid := public.mi_persona_id();
  v_jugue boolean;
  v_voto boolean;
  v_abierta boolean;
  v_cerrada boolean;
  v_moderar boolean;
  v_mi_voto uuid;
  v_ver_conteo boolean;
begin
  p := public.partido_del_club(p_partido);
  v_jugue := exists (select 1 from public.partido_jugadores where partido_id = p.id and persona_id = v_yo);
  v_voto := v_jugue or public.soy_cuerpo_tecnico_de(p.equipo_id);
  v_abierta := public.mvp_abierta(p);
  v_cerrada := public.mvp_cerrada(p);
  v_moderar := public.puedo_moderar(p.equipo_id);
  v_mi_voto := (select elegido_id from public.partido_votos where partido_id = p.id and votante_id = v_yo);
  -- El conteo lo ve quien ya votó o no puede votar, y todos al cerrar.
  v_ver_conteo := v_cerrada or (v_abierta and (v_mi_voto is not null or not v_voto));

  return jsonb_build_object(
    'mvp', jsonb_build_object(
      'abierta', v_abierta,
      'cerrada', v_cerrada,
      'cierra', public.mvp_cierre(p),
      'puedo_votar', v_abierta and v_voto,
      'jugue', v_jugue,
      'mi_voto', v_mi_voto,
      'votaron', (select count(*)::int from public.partido_votos where partido_id = p.id),
      'candidatos', coalesce((
        select jsonb_agg(jsonb_build_object('persona_id', pr.id, 'nombre', pr.nombre) order by pr.nombre)
          from public.partido_jugadores j join public.personas pr on pr.id = j.persona_id
         where j.partido_id = p.id), '[]'::jsonb),
      -- El conteo solo se ve al cerrar.
      'ganadores', case when v_cerrada then public.mvp_ganadores(p.id) else '[]'::jsonb end,
      'ver_conteo', v_ver_conteo,
      'conteo', case when v_ver_conteo then coalesce((
        select jsonb_agg(jsonb_build_object('persona_id', x.elegido_id, 'nombre', pr.nombre, 'votos', x.votos)
                         order by x.votos desc, pr.nombre)
          from (select elegido_id, count(*)::int as votos from public.partido_votos
                 where partido_id = p.id group by elegido_id) x
          join public.personas pr on pr.id = x.elegido_id), '[]'::jsonb) else '[]'::jsonb end),
    'reacciones', coalesce((
      select jsonb_agg(jsonb_build_object('emoji', r.emoji, 'n', r.n, 'mia', r.mia) order by r.n desc, r.emoji)
        from (select emoji, count(*)::int as n, bool_or(persona_id = v_yo) as mia
                from public.partido_reacciones where partido_id = p.id group by emoji) r), '[]'::jsonb),
    'puedo_moderar', v_moderar,
    'comentarios', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', c.id, 'padre_id', c.padre_id, 'persona_id', c.persona_id, 'nombre', pr.nombre,
               'texto', case when c.borrado_en is null then c.texto end,
               'borrado', c.borrado_en is not null,
               'creado_en', c.creado_en,
               'puedo_borrar', c.borrado_en is null and (c.persona_id = v_yo or v_moderar),
               'reacciones', coalesce((
                 select jsonb_agg(jsonb_build_object('emoji', r.emoji, 'n', r.n, 'mia', r.mia) order by r.n desc, r.emoji)
                   from (select emoji, count(*)::int as n, bool_or(persona_id = v_yo) as mia
                           from public.comentario_reacciones where comentario_id = c.id group by emoji) r), '[]'::jsonb))
             order by c.creado_en)
        from public.partido_comentarios c join public.personas pr on pr.id = c.persona_id
       where c.partido_id = p.id), '[]'::jsonb));
end;
$$;

revoke execute on function public.mvp_votantes(public.partidos) from public, anon, authenticated;
revoke execute on function public.mvp_cerrada(public.partidos) from public, anon, authenticated;
revoke execute on function public.mvp_abierta(public.partidos) from public, anon, authenticated;
revoke execute on function public.mvp_conteo(int, uuid[]) from public, anon;
grant execute on function public.mvp_conteo(int, uuid[]) to authenticated;
revoke execute on function public.partido_charla(uuid) from public, anon;
grant execute on function public.partido_charla(uuid) to authenticated;
