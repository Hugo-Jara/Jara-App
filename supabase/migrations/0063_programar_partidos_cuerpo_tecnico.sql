-- Jara App · 0063 · El cuerpo técnico y Comunicaciones programan partidos
--
-- Hasta ahora solo el encargado (capitán) de cada plantel podía programar un
-- partido que no viene de la liga (un amistoso, un partido cambiado de fecha).
-- Desde ahora también pueden:
--   - el cuerpo técnico (personas.cuerpo_tecnico, lo da el administrador),
--     solo en los planteles en que está;
--   - Comunicaciones (personas.edita_comunicaciones), en cualquier plantel.
-- Quien entra por esta puerta nueva corrige o elimina solo los partidos que
-- programó él mismo; los de la liga y los del capitán siguen siendo del
-- capitán. La posición que cada uno elige en su perfil (DT, ayudante) NO da
-- este permiso: lo da solo el administrador.
-- Las cuentas de prueba no programan partidos por esta puerta (el club es real).
--
--   - puedo_programar(plantel): ¿puedo crear un partido en este plantel?
--   - puedo_cambiar_partido(partido): ¿puedo corregirlo o eliminarlo?
--   - partidos_programables(): los planteles que puedo programar y los ids
--     de los partidos que puedo corregir (para mostrar los botones en la app).
--   - partido_guardar y partido_eliminar: igual que en 0014 y 0010, pero con
--     estas reglas en vez de soy_encargado.
-- No toca partido_json (lo cambia 0062): 'puedo_editar' sigue siendo del
-- encargado, y la app suma lo de partidos_programables().
--
-- Revisión: cambia permisos (quién programa partidos). No toca plata.
-- La revisa el administrador de la app.

create or replace function public.puedo_programar(p_equipo uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.soy_encargado(p_equipo)
      or (not public.soy_cuenta_de_prueba() and exists (
            select 1 from public.personas p join public.equipos e on e.id = p_equipo and e.club_id = p.club_id
             where p.id = public.mi_persona_id()
               and (p.edita_comunicaciones
                    or (p.cuerpo_tecnico and exists (select 1 from public.persona_equipos pe
                                                       where pe.persona_id = p.id and pe.equipo_id = p_equipo)))));
$$;

create or replace function public.puedo_cambiar_partido(p_partido uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.partidos p
     where p.id = p_partido and p.club_id = public.mi_club_id()
       and (public.soy_encargado(p.equipo_id)
            or (p.creado_por = public.mi_persona_id() and public.puedo_programar(p.equipo_id))));
$$;

create or replace function public.partidos_programables()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'equipos', coalesce((
      select jsonb_agg(jsonb_build_object('id', e.id, 'nombre', e.nombre) order by e.orden, e.nombre)
        from public.equipos e
       where e.club_id = public.mi_club_id() and public.puedo_programar(e.id)), '[]'::jsonb),
    'partidos', coalesce((
      select jsonb_agg(p.id)
        from public.partidos p
       where p.club_id = public.mi_club_id() and p.creado_por = public.mi_persona_id()
         and public.puedo_cambiar_partido(p.id)), '[]'::jsonb));
$$;

create or replace function public.partido_guardar(
  p_id uuid, p_equipo uuid, p_rival text, p_fecha date,
  p_citacion time default null, p_cancha text default null,
  p_torneo text default null, p_tercer_tiempo text default null, p_hora_inicio time default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if not exists (select 1 from public.equipos where id = p_equipo and club_id = public.mi_club_id())
     or not public.puedo_programar(p_equipo) then
    raise exception 'Solo el capitán, el cuerpo técnico o Comunicaciones pueden programar partidos de este plantel';
  end if;
  if p_id is not null and not public.puedo_cambiar_partido(p_id) then
    raise exception 'Este partido lo corrige el capitán del plantel o quien lo programó';
  end if;
  if coalesce(length(trim(p_rival)), 0) = 0 then raise exception 'Falta el rival'; end if;
  if p_fecha is null then raise exception 'Falta la fecha'; end if;

  if p_id is null then
    insert into public.partidos (club_id, equipo_id, rival, torneo, fecha, citacion, hora_inicio, cancha, tercer_tiempo, creado_por)
    values (public.mi_club_id(), p_equipo, trim(p_rival), nullif(trim(p_torneo), ''), p_fecha, p_citacion, p_hora_inicio,
            nullif(trim(p_cancha), ''), nullif(trim(p_tercer_tiempo), ''), public.mi_persona_id())
    returning id into v_id;
  else
    -- El plantel de un partido no se cambia: las respuestas son de ese plantel.
    update public.partidos
       set rival = trim(p_rival), torneo = nullif(trim(p_torneo), ''), fecha = p_fecha, citacion = p_citacion, hora_inicio = p_hora_inicio,
           cancha = nullif(trim(p_cancha), ''), tercer_tiempo = nullif(trim(p_tercer_tiempo), '')
     where id = p_id and equipo_id = p_equipo and club_id = public.mi_club_id()
    returning id into v_id;
    if v_id is null then raise exception 'Ese partido no existe'; end if;
  end if;
  return v_id;
end;
$$;

create or replace function public.partido_eliminar(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.puedo_cambiar_partido(p_id) then
    raise exception 'Este partido lo elimina el capitán del plantel o quien lo programó';
  end if;
  delete from public.partidos where id = p_id and club_id = public.mi_club_id();
end;
$$;

revoke execute on function public.puedo_programar(uuid) from public, anon, authenticated;
revoke execute on function public.puedo_cambiar_partido(uuid) from public, anon, authenticated;
revoke execute on function public.partidos_programables() from public, anon;
grant execute on function public.partidos_programables() to authenticated;
