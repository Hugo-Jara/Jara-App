-- Jara App · 0013 · Quien administra los entrenamientos
--
-- Hasta ahora solo los encargados de plantel (y los administradores) abrían las
-- listas de entrenamiento, y solo tesoreros o quienes tenían el permiso de
-- cobrar marcaban los pagos. Ahora existe un permiso personal que junta todo:
-- quien lo tiene abre y elimina listas, baja a cualquiera de la lista y marca
-- pagos, sin ser encargado ni tesorero de un plantel.
--
-- Se da en Supabase: Table Editor > personas > administra_entrenamientos.
-- No cambia nada para nadie más.

alter table public.personas add column administra_entrenamientos boolean not null default false;

-- ¿Puedo abrir listas, bajar gente y eliminar listas de entrenamiento?
create or replace function public.puedo_administrar_entrenamientos()
returns boolean language sql stable security definer set search_path = public as $$
  select public.soy_encargado_de_alguno()
      or exists (select 1 from public.personas p
                  where p.id = public.mi_persona_id() and p.administra_entrenamientos);
$$;

-- Quien administra también cobra.
create or replace function public.puedo_cobrar()
returns boolean language sql stable security definer set search_path = public as $$
  select public.soy_admin()
      or exists (select 1 from public.personas p
                  where p.id = public.mi_persona_id() and (p.cobra_entrenamientos or p.administra_entrenamientos))
      or exists (select 1 from public.persona_equipos pe
                  where pe.persona_id = public.mi_persona_id() and pe.rol = 'tesorero');
$$;

create or replace function public.entrenamiento_actual()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  e public.entrenamientos;
begin
  if public.mi_persona_id() is null then raise exception 'Tu cuenta no está en la nómina del club'; end if;
  select * into e from public.entrenamientos
   where club_id = public.mi_club_id() and fecha >= public.hoy()
   order by fecha, hora_inicio limit 1;
  return jsonb_build_object(
    'entrenamiento', case when e.id is not null then public.entrenamiento_json(e) end,
    'puedo_administrar', public.puedo_administrar_entrenamientos(),
    'puedo_cobrar', public.puedo_cobrar(),
    'deben', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', i.id, 'nombre', coalesce(p.nombre, i.invitado_nombre), 'fecha', a.fecha,
               'monto', i.monto, 'multa', i.estado = 'baja_tarde') order by a.fecha, i.creado_en)
        from public.entrenamiento_inscritos i
        join public.entrenamientos a on a.id = i.entrenamiento_id
        left join public.personas p on p.id = i.persona_id
       where a.club_id = public.mi_club_id() and a.fecha < public.hoy()
         and not i.pagado and i.monto > 0), '[]'::jsonb));
end;
$$;

create or replace function public.entrenamiento_bajar(p_inscrito uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  i public.entrenamiento_inscritos;
  e public.entrenamientos;
  v_yo uuid := public.mi_persona_id();
begin
  select * into i from public.entrenamiento_inscritos where id = p_inscrito;
  if i.id is null then raise exception 'Esa inscripción no existe'; end if;
  e := public.entrenamiento_abierto(i.entrenamiento_id);
  if i.estado <> 'inscrito' then
    return;
  end if;
  if not (coalesce(i.persona_id = v_yo, false) or coalesce(i.invitado_por = v_yo, false) or public.puedo_administrar_entrenamientos()) then
    raise exception 'Solo puedes bajarte tú o bajar a tus invitados';
  end if;
  if e.fecha = public.hoy() and e.multa > 0 and (coalesce(i.persona_id = v_yo, false) or coalesce(i.invitado_por = v_yo, false)) then
    update public.entrenamiento_inscritos
       set estado = 'baja_tarde', monto = e.multa, pagado = false, pago_marcado_por = null
     where id = i.id;
  else
    delete from public.entrenamiento_inscritos where id = i.id;
  end if;
end;
$$;

create or replace function public.entrenamiento_guardar(
  p_id uuid, p_fecha date, p_hora_inicio time, p_hora_fin time, p_lugar text, p_cupo integer,
  p_precio_junior integer, p_precio_senior integer, p_precio_invitado integer, p_multa integer default 0)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if not public.puedo_administrar_entrenamientos() then
    raise exception 'Solo quienes administran los entrenamientos abren las listas';
  end if;
  if p_fecha is null then raise exception 'Falta la fecha'; end if;
  if p_cupo is null or p_cupo <= 0 then raise exception 'El cupo tiene que ser mayor que cero'; end if;

  if p_id is null then
    insert into public.entrenamientos
      (club_id, fecha, hora_inicio, hora_fin, lugar, cupo, precio_junior, precio_senior, precio_invitado, multa, creado_por)
    values (public.mi_club_id(), p_fecha, p_hora_inicio, p_hora_fin, nullif(trim(p_lugar), ''), p_cupo,
            coalesce(p_precio_junior, 0), coalesce(p_precio_senior, 0), coalesce(p_precio_invitado, 0),
            coalesce(p_multa, 0), public.mi_persona_id())
    returning id into v_id;
  else
    update public.entrenamientos
       set fecha = p_fecha, hora_inicio = p_hora_inicio, hora_fin = p_hora_fin,
           lugar = nullif(trim(p_lugar), ''), cupo = p_cupo,
           precio_junior = coalesce(p_precio_junior, 0), precio_senior = coalesce(p_precio_senior, 0),
           precio_invitado = coalesce(p_precio_invitado, 0), multa = coalesce(p_multa, 0)
     where id = p_id and club_id = public.mi_club_id()
    returning id into v_id;
    if v_id is null then raise exception 'Ese entrenamiento no existe'; end if;
  end if;
  return v_id;
end;
$$;

create or replace function public.entrenamiento_eliminar(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.puedo_administrar_entrenamientos() then
    raise exception 'Solo quienes administran los entrenamientos eliminan una lista';
  end if;
  delete from public.entrenamientos where id = p_id and club_id = public.mi_club_id();
end;
$$;

revoke execute on function public.puedo_administrar_entrenamientos() from public, anon;
grant execute on function public.puedo_administrar_entrenamientos() to authenticated;
