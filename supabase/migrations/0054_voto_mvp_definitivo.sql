-- Jara App · 0054 · El voto del jugador del partido es uno solo y no se cambia
--
-- Pedido del administrador (14/11): hasta ahora el voto MVP se podía cambiar
-- mientras la votación estaba abierta. Eso se presta para la chacra (te
-- convencen después) y para votos mal puestos que se corrigen a medias. Desde
-- ahora:
--   · La app pregunta "¿Confirmas este voto?" antes de mandarlo.
--   · mvp_votar acepta un solo voto por persona y partido. Si ya votaste,
--     responde "Ya votaste en este partido…" y no cambia nada. Vale igual para
--     los que jugaron y para el cuerpo técnico (0033).
--   · Una regla en la tabla (trigger) impide cambiar o borrar un voto ya
--     guardado, venga de donde venga. Solo se deja pasar:
--       - el borrado en cadena cuando se borra el partido o la persona, y
--       - una corrección manual del administrador por SQL, que tiene que
--         decirlo explícitamente con
--           select set_config('jara.corregir_votos', 'si', true);
--         dentro de la misma transacción (por ejemplo, al juntar dos registros
--         repetidos de una misma persona).
--
-- Los votos que ya existen quedan como están. Se puede correr más de una vez.
-- Revisión: la revisa el administrador de la app antes de correrla.

-- Votar: igual que en la 0033, pero sin cambiar un voto ya hecho.
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
  if exists (select 1 from public.partido_votos where partido_id = p.id and votante_id = v_yo) then
    raise exception 'Ya votaste en este partido y el voto no se puede cambiar';
  end if;
  if p_elegido = v_yo then raise exception 'No puedes votar por ti mismo'; end if;
  if not exists (select 1 from public.partido_jugadores where partido_id = p.id and persona_id = p_elegido) then
    raise exception 'Solo se puede votar por alguien que jugó el partido';
  end if;
  insert into public.partido_votos (partido_id, votante_id, elegido_id) values (p.id, v_yo, p_elegido)
  on conflict (partido_id, votante_id) do nothing;
  if not found then
    raise exception 'Ya votaste en este partido y el voto no se puede cambiar';
  end if;
end;
$$;

revoke execute on function public.mvp_votar(uuid, uuid) from public, anon;
grant execute on function public.mvp_votar(uuid, uuid) to authenticated;

-- Un voto guardado no se cambia ni se borra.
create or replace function public.voto_mvp_no_se_cambia()
returns trigger language plpgsql set search_path = public as $$
begin
  if coalesce(current_setting('jara.corregir_votos', true), '') = 'si' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'DELETE' then
    -- Borrado en cadena (se borró el partido o la persona): se deja pasar.
    if pg_trigger_depth() > 1 then return old; end if;
    raise exception 'Un voto del jugador del partido no se puede borrar';
  end if;
  raise exception 'Un voto del jugador del partido no se puede cambiar';
end;
$$;

revoke execute on function public.voto_mvp_no_se_cambia() from public, anon, authenticated;

drop trigger if exists partido_votos_no_se_cambia on public.partido_votos;
create trigger partido_votos_no_se_cambia
  before update or delete on public.partido_votos
  for each row execute function public.voto_mvp_no_se_cambia();
