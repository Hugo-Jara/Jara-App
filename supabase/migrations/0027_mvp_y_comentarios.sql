-- Jara App · 0027 · Jugador del partido (MVP), comentarios y reacciones
--
-- Pedido del administrador (4/11), para entretener al club después de cada
-- partido:
--   · MVP: votan solo los que jugaron el partido (partido_jugadores, de la
--     0025) y no pueden votarse a sí mismos. La votación abre cuando se anota
--     el resultado y cierra a las 23:59 del día siguiente al partido (sábado →
--     domingo en la noche; jueves → viernes en la noche). Un voto por persona,
--     que se puede cambiar mientras está abierta. El conteo no se ve hasta que
--     cierra; ahí se muestra el MVP (si empatan, son MVP los empatados).
--   · Comentarios en cada partido, con respuestas en cadena. Cada uno borra los
--     suyos; borran cualquiera los administradores, quien edita Comunicaciones
--     y el encargado del plantel (capitán o DT). Un comentario borrado deja su
--     lugar ("Comentario borrado") para no romper la cadena.
--   · Reacciones con emoji al partido y a cada comentario, de una lista fija.
--     Tocar el mismo emoji de nuevo lo quita.
--
-- Todo el club ve y comenta todos los partidos. Las tablas no se leen desde el
-- navegador: todo pasa por funciones. Las cuentas de prueba pueden comentar y
-- reaccionar (para probar), pero no borran comentarios ajenos.
-- Depende de la 0025 (partido_jugadores). Revisión: la revisa el administrador
-- de la app antes de correrla.

-- ---------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------
create table public.partido_votos (
  partido_id  uuid not null references public.partidos(id) on delete cascade,
  votante_id  uuid not null references public.personas(id) on delete cascade,
  elegido_id  uuid not null references public.personas(id) on delete cascade,
  votado_en   timestamptz not null default now(),
  primary key (partido_id, votante_id),
  check (votante_id <> elegido_id)
);

create table public.partido_comentarios (
  id          uuid primary key default gen_random_uuid(),
  partido_id  uuid not null references public.partidos(id) on delete cascade,
  persona_id  uuid not null references public.personas(id) on delete cascade,
  -- Respuesta a otro comentario. Siempre apunta al primero de la cadena.
  padre_id    uuid references public.partido_comentarios(id) on delete cascade,
  texto       text not null check (length(trim(texto)) between 1 and 500),
  creado_en   timestamptz not null default now(),
  borrado_en  timestamptz,
  borrado_por uuid references public.personas(id) on delete set null
);
create index partido_comentarios_partido_idx on public.partido_comentarios (partido_id, creado_en);

-- Emojis permitidos (la misma lista en src/lib/charla.js).
create or replace function public.emoji_valido(p text)
returns boolean language sql immutable as $$
  select p = any (array['👏', '🔥', '⚽', '💪', '😂', '😮', '😢', '❤️']);
$$;

create table public.partido_reacciones (
  partido_id  uuid not null references public.partidos(id) on delete cascade,
  persona_id  uuid not null references public.personas(id) on delete cascade,
  emoji       text not null check (public.emoji_valido(emoji)),
  primary key (partido_id, persona_id, emoji)
);

create table public.comentario_reacciones (
  comentario_id uuid not null references public.partido_comentarios(id) on delete cascade,
  persona_id    uuid not null references public.personas(id) on delete cascade,
  emoji         text not null check (public.emoji_valido(emoji)),
  primary key (comentario_id, persona_id, emoji)
);

alter table public.partido_votos enable row level security;
alter table public.partido_comentarios enable row level security;
alter table public.partido_reacciones enable row level security;
alter table public.comentario_reacciones enable row level security;
revoke all on public.partido_votos, public.partido_comentarios,
              public.partido_reacciones, public.comentario_reacciones from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Ayudas
-- ---------------------------------------------------------------------------

-- Un partido del club de quien llama (o error).
create or replace function public.partido_del_club(p_partido uuid)
returns public.partidos language plpgsql stable security definer set search_path = public as $$
declare p public.partidos;
begin
  if public.mi_persona_id() is null then raise exception 'Tu cuenta no está en la nómina del club'; end if;
  select * into p from public.partidos where id = p_partido and club_id = public.mi_club_id();
  if p.id is null then raise exception 'Ese partido no existe'; end if;
  return p;
end;
$$;

-- Cuándo cierra la votación: a las 23:59:59 del día siguiente al partido, hora de Chile.
create or replace function public.mvp_cierre(p public.partidos)
returns timestamptz language sql stable set search_path = public as $$
  select ((p.fecha + 2)::timestamp at time zone 'America/Santiago') - interval '1 second';
$$;

-- ¿Está abierta? Desde que hay resultado y gente que jugó, hasta el cierre.
create or replace function public.mvp_abierta(p public.partidos)
returns boolean language sql stable security definer set search_path = public as $$
  select p.goles_favor is not null
     and now() <= public.mvp_cierre(p)
     and exists (select 1 from public.partido_jugadores j where j.partido_id = p.id);
$$;

-- ¿Puedo borrar comentarios ajenos de este partido? Administradores, quien
-- edita Comunicaciones y el encargado del plantel. Nunca una cuenta de prueba.
create or replace function public.puedo_moderar(p_equipo uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select not public.soy_cuenta_de_prueba() and (
    public.soy_encargado(p_equipo)
    or exists (select 1 from public.personas pr
                where pr.id = public.mi_persona_id() and pr.edita_comunicaciones));
$$;

-- El MVP de un partido ya cerrado: el o los más votados.
create or replace function public.mvp_ganadores(p_partido uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  with c as (
    select v.elegido_id, count(*)::int as votos from public.partido_votos v
     where v.partido_id = p_partido group by v.elegido_id
  )
  select coalesce(jsonb_agg(jsonb_build_object('persona_id', c.elegido_id, 'nombre', pr.nombre, 'votos', c.votos)
                            order by pr.nombre), '[]'::jsonb)
    from c join public.personas pr on pr.id = c.elegido_id
   where c.votos = (select max(votos) from c);
$$;

-- ---------------------------------------------------------------------------
-- Lo que la pantalla del partido necesita: votación, reacciones y comentarios
-- ---------------------------------------------------------------------------
create or replace function public.partido_charla(p_partido uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  p public.partidos;
  v_yo uuid := public.mi_persona_id();
  v_jugue boolean;
  v_abierta boolean;
  v_cerrada boolean;
  v_moderar boolean;
begin
  p := public.partido_del_club(p_partido);
  v_jugue := exists (select 1 from public.partido_jugadores where partido_id = p.id and persona_id = v_yo);
  v_abierta := public.mvp_abierta(p);
  v_cerrada := p.goles_favor is not null and now() > public.mvp_cierre(p);
  v_moderar := public.puedo_moderar(p.equipo_id);

  return jsonb_build_object(
    'mvp', jsonb_build_object(
      'abierta', v_abierta,
      'cerrada', v_cerrada,
      'cierra', public.mvp_cierre(p),
      'puedo_votar', v_abierta and v_jugue,
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

-- ---------------------------------------------------------------------------
-- Votar (o cambiar el voto) por el jugador del partido
-- ---------------------------------------------------------------------------
create or replace function public.mvp_votar(p_partido uuid, p_elegido uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  p public.partidos;
  v_yo uuid := public.mi_persona_id();
begin
  p := public.partido_del_club(p_partido);
  if p.goles_favor is null then raise exception 'La votación abre cuando se anota el resultado'; end if;
  if not public.mvp_abierta(p) then raise exception 'La votación de este partido ya cerró'; end if;
  if not exists (select 1 from public.partido_jugadores where partido_id = p.id and persona_id = v_yo) then
    raise exception 'Votan solo los que jugaron el partido';
  end if;
  if p_elegido = v_yo then raise exception 'No puedes votar por ti mismo'; end if;
  if not exists (select 1 from public.partido_jugadores where partido_id = p.id and persona_id = p_elegido) then
    raise exception 'Solo se puede votar por alguien que jugó el partido';
  end if;
  insert into public.partido_votos (partido_id, votante_id, elegido_id) values (p.id, v_yo, p_elegido)
  on conflict (partido_id, votante_id) do update set elegido_id = excluded.elegido_id, votado_en = now();
end;
$$;

-- ---------------------------------------------------------------------------
-- Comentarios
-- ---------------------------------------------------------------------------
create or replace function public.comentario_agregar(p_partido uuid, p_texto text, p_padre uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  p public.partidos;
  v_padre public.partido_comentarios;
  v_id uuid;
begin
  p := public.partido_del_club(p_partido);
  if length(trim(coalesce(p_texto, ''))) = 0 then raise exception 'Escribe algo antes de enviar'; end if;
  if length(trim(p_texto)) > 500 then raise exception 'El comentario puede tener hasta 500 letras'; end if;
  if p_padre is not null then
    select * into v_padre from public.partido_comentarios where id = p_padre and partido_id = p.id;
    if v_padre.id is null then raise exception 'Ese comentario no existe'; end if;
  end if;
  insert into public.partido_comentarios (partido_id, persona_id, padre_id, texto)
  values (p.id, public.mi_persona_id(), coalesce(v_padre.padre_id, v_padre.id), trim(p_texto))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.comentario_borrar(p_comentario uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  c public.partido_comentarios;
  p public.partidos;
begin
  select * into c from public.partido_comentarios where id = p_comentario;
  if c.id is null then raise exception 'Ese comentario no existe'; end if;
  p := public.partido_del_club(c.partido_id);
  if c.borrado_en is not null then return; end if;
  if c.persona_id <> public.mi_persona_id() and not public.puedo_moderar(p.equipo_id) then
    raise exception 'Solo puedes borrar tus comentarios';
  end if;
  update public.partido_comentarios set borrado_en = now(), borrado_por = public.mi_persona_id() where id = c.id;
  delete from public.comentario_reacciones where comentario_id = c.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reacciones: tocar un emoji lo pone; tocarlo de nuevo lo quita
-- ---------------------------------------------------------------------------
create or replace function public.reaccionar_partido(p_partido uuid, p_emoji text)
returns void language plpgsql security definer set search_path = public as $$
declare
  p public.partidos;
  v_yo uuid := public.mi_persona_id();
begin
  p := public.partido_del_club(p_partido);
  if not public.emoji_valido(p_emoji) then raise exception 'Esa reacción no está disponible'; end if;
  delete from public.partido_reacciones where partido_id = p.id and persona_id = v_yo and emoji = p_emoji;
  if not found then
    insert into public.partido_reacciones (partido_id, persona_id, emoji) values (p.id, v_yo, p_emoji);
  end if;
end;
$$;

create or replace function public.reaccionar_comentario(p_comentario uuid, p_emoji text)
returns void language plpgsql security definer set search_path = public as $$
declare
  c public.partido_comentarios;
  p public.partidos;
  v_yo uuid := public.mi_persona_id();
begin
  select * into c from public.partido_comentarios where id = p_comentario;
  if c.id is null then raise exception 'Ese comentario no existe'; end if;
  p := public.partido_del_club(c.partido_id);
  if c.borrado_en is not null then raise exception 'Ese comentario fue borrado'; end if;
  if not public.emoji_valido(p_emoji) then raise exception 'Esa reacción no está disponible'; end if;
  delete from public.comentario_reacciones where comentario_id = c.id and persona_id = v_yo and emoji = p_emoji;
  if not found then
    insert into public.comentario_reacciones (comentario_id, persona_id, emoji) values (c.id, v_yo, p_emoji);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- MVP en las estadísticas y en la lista de partidos
-- ---------------------------------------------------------------------------

-- Cuántas veces fue MVP cada jugador ({persona_id: veces}), con los mismos
-- filtros de la tabla del club. Solo cuentan las votaciones cerradas.
create or replace function public.mvp_conteo(p_anio int default null, p_equipos uuid[] default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if public.mi_persona_id() is null then raise exception 'Tu cuenta no está en la nómina del club'; end if;
  return coalesce((
    with ps as (
      select p.id from public.partidos p
       where p.club_id = public.mi_club_id()
         and p.goles_favor is not null
         and now() > public.mvp_cierre(p)
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

revoke execute on function public.partido_del_club(uuid) from public, anon, authenticated;
revoke execute on function public.mvp_cierre(public.partidos) from public, anon, authenticated;
revoke execute on function public.mvp_abierta(public.partidos) from public, anon, authenticated;
revoke execute on function public.mvp_ganadores(uuid) from public, anon, authenticated;
revoke execute on function public.puedo_moderar(uuid) from public, anon;
revoke execute on function public.partido_charla(uuid) from public, anon;
revoke execute on function public.mvp_votar(uuid, uuid) from public, anon;
revoke execute on function public.comentario_agregar(uuid, text, uuid) from public, anon;
revoke execute on function public.comentario_borrar(uuid) from public, anon;
revoke execute on function public.reaccionar_partido(uuid, text) from public, anon;
revoke execute on function public.reaccionar_comentario(uuid, text) from public, anon;
revoke execute on function public.mvp_conteo(int, uuid[]) from public, anon;
grant execute on function public.puedo_moderar(uuid) to authenticated;
grant execute on function public.partido_charla(uuid) to authenticated;
grant execute on function public.mvp_votar(uuid, uuid) to authenticated;
grant execute on function public.comentario_agregar(uuid, text, uuid) to authenticated;
grant execute on function public.comentario_borrar(uuid) to authenticated;
grant execute on function public.reaccionar_partido(uuid, text) to authenticated;
grant execute on function public.reaccionar_comentario(uuid, text) to authenticated;
grant execute on function public.mvp_conteo(int, uuid[]) to authenticated;
