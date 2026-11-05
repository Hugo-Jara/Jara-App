-- Jara App · 0033 · El cuerpo técnico vota por el jugador del partido
--
-- Pedido del administrador (5/11): el DT y su ayudante no juegan, así que no
-- quedan en "quiénes jugaron" (partido_jugadores) y la 0027 no los dejaba
-- votar por el MVP. Esta migración agrega un permiso personal:
--   · personas.cuerpo_tecnico: lo prende el administrador por SQL, solo a
--     quien corresponda (no hay pantalla para darlo).
--   · Quien lo tiene puede votar en los partidos de los planteles en que está
--     (persona_equipos), aunque no haya jugado. Las demás reglas no cambian:
--     un voto, cambiable mientras está abierta, y solo por alguien que jugó.
--   · No lo convierte en candidato ni le suma partidos jugados.
--
-- Solo cambia partido_charla (para mostrar el botón) y mvp_votar. Revisión:
-- la revisa el administrador de la app antes de correrla.

alter table public.personas add column cuerpo_tecnico boolean not null default false;

-- ¿Soy cuerpo técnico de este plantel?
create or replace function public.soy_cuerpo_tecnico_de(p_equipo uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.personas pr
      join public.persona_equipos pe on pe.persona_id = pr.id
     where pr.id = public.mi_persona_id() and pr.cuerpo_tecnico and pe.equipo_id = p_equipo);
$$;

-- Igual que en la 0027, pero puede votar quien jugó o el cuerpo técnico del plantel.
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
begin
  p := public.partido_del_club(p_partido);
  v_jugue := exists (select 1 from public.partido_jugadores where partido_id = p.id and persona_id = v_yo);
  v_voto := v_jugue or public.soy_cuerpo_tecnico_de(p.equipo_id);
  v_abierta := public.mvp_abierta(p);
  v_cerrada := p.goles_favor is not null and now() > public.mvp_cierre(p);
  v_moderar := public.puedo_moderar(p.equipo_id);

  return jsonb_build_object(
    'mvp', jsonb_build_object(
      'abierta', v_abierta,
      'cerrada', v_cerrada,
      'cierra', public.mvp_cierre(p),
      'puedo_votar', v_abierta and v_voto,
      'jugue', v_jugue,
      'mi_voto', (select elegido_id from public.partido_votos where partido_id = p.id and votante_id = v_yo),
      'votaron', (select count(*)::int from public.partido_votos where partido_id = p.id),
      'candidatos', coalesce((
        select jsonb_agg(jsonb_build_object('persona_id', pr.id, 'nombre', pr.nombre) order by pr.nombre)
          from public.partido_jugadores j join public.personas pr on pr.id = j.persona_id
         where j.partido_id = p.id), '[]'::jsonb),
      -- El conteo solo se ve al cerrar.
      'ganadores', case when v_cerrada then public.mvp_ganadores(p.id) else '[]'::jsonb end),
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

-- Votar: igual que en la 0027, con el cuerpo técnico del plantel.
create or replace function public.mvp_votar(p_partido uuid, p_elegido uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  p public.partidos;
  v_yo uuid := public.mi_persona_id();
begin
  p := public.partido_del_club(p_partido);
  if p.goles_favor is null then raise exception 'La votación abre cuando se anota el resultado'; end if;
  if not public.mvp_abierta(p) then raise exception 'La votación de este partido ya cerró'; end if;
  if not exists (select 1 from public.partido_jugadores where partido_id = p.id and persona_id = v_yo)
     and not public.soy_cuerpo_tecnico_de(p.equipo_id) then
    raise exception 'Votan solo los que jugaron el partido y el cuerpo técnico';
  end if;
  if p_elegido = v_yo then raise exception 'No puedes votar por ti mismo'; end if;
  if not exists (select 1 from public.partido_jugadores where partido_id = p.id and persona_id = p_elegido) then
    raise exception 'Solo se puede votar por alguien que jugó el partido';
  end if;
  insert into public.partido_votos (partido_id, votante_id, elegido_id) values (p.id, v_yo, p_elegido)
  on conflict (partido_id, votante_id) do update set elegido_id = excluded.elegido_id, votado_en = now();
end;
$$;

revoke execute on function public.soy_cuerpo_tecnico_de(uuid) from public, anon, authenticated;
revoke execute on function public.partido_charla(uuid) from public, anon;
revoke execute on function public.mvp_votar(uuid, uuid) from public, anon;
grant execute on function public.partido_charla(uuid) to authenticated;
grant execute on function public.mvp_votar(uuid, uuid) to authenticated;
