-- 0057 · Los pases de ingreso los aprueba Tesorería
--
-- Hasta ahora un pase lo aprobaba el encargado del plantel o un administrador.
-- El club definió que los responsables de aprobar ingresos son las personas de
-- Tesorería, que tienen la planilla con el correo y el RUT de cada socio.
--
-- Qué cambia:
--   - personas.aprueba_ingresos: permiso personal. Se le da por SQL a quien
--     corresponda (va aparte, porque lleva nombres). Quien lo tiene ve y
--     resuelve los pases de todos los planteles.
--   - Los encargados de plantel y los administradores siguen pudiendo aprobar
--     como antes (los encargados, solo lo de su plantel).
--   - A quien espera su pase se le nombra también a quienes tienen el permiso.
--   - Quien aprueba con este permiso deja a un jugador nuevo en los planteles
--     que pidió (un encargado, solo en los suyos, como antes).
--
-- No cambia mi_persona() ni ningún otro permiso. Se puede correr más de una vez.

alter table public.personas add column if not exists aprueba_ingresos boolean not null default false;

-- ¿Tengo el permiso de aprobar ingresos de todo el club?
create or replace function public.apruebo_ingresos()
returns boolean language sql stable security definer set search_path = public as $$
  select public.soy_admin() or coalesce(
    (select p.aprueba_ingresos from public.personas p where p.id = public.mi_persona_id()), false);
$$;

-- Para la app: ¿me toca ver la pantalla de pases?
create or replace function public.ingreso_puedo_aprobar()
returns boolean language sql stable security definer set search_path = public as $$
  select public.apruebo_ingresos() or public.soy_encargado_de_alguno();
$$;

-- Igual que en 0009, más el permiso personal.
create or replace function public.ingreso_puedo_resolver(s public.ingreso_solicitudes)
returns boolean language sql stable security definer set search_path = public as $$
  select s.club_id = public.mi_club_id() and (
    public.apruebo_ingresos() or exists (
      select 1 from public.persona_equipos pe
       where pe.persona_id = public.mi_persona_id() and pe.rol = 'encargado'
         and pe.equipo_id = any(public.ingreso_equipos(s))));
$$;

-- Igual que en 0009, más el permiso personal en "aprueban".
create or replace function public.ingreso_mi_estado()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  s public.ingreso_solicitudes;
  v_equipos uuid[];
begin
  if auth.uid() is null then raise exception 'Hay que entrar con una cuenta'; end if;
  select * into s from public.ingreso_solicitudes
   where user_id = auth.uid() order by creado_en desc limit 1;
  if s.id is null or s.estado = 'aprobada' then
    return jsonb_build_object('estado', 'sin_solicitud');
  end if;
  v_equipos := public.ingreso_equipos(s);
  return jsonb_build_object(
    'estado', s.estado,
    'nombre', coalesce((select nombre from public.personas where id = s.persona_id), s.nombre_propuesto),
    'equipos', coalesce((select jsonb_agg(e.nombre order by e.orden) from public.equipos e
                          where e.id = any(v_equipos)), '[]'::jsonb),
    -- A quién avisarle: Tesorería, encargados de esos planteles y administradores.
    'aprueban', coalesce((
      select jsonb_agg(distinct p.nombre)
        from public.personas p
       where p.club_id = s.club_id and p.user_id is not null and p.estado <> 'inactivo'
         and (p.es_admin or p.aprueba_ingresos or exists (
               select 1 from public.persona_equipos pe
                where pe.persona_id = p.id and pe.rol = 'encargado' and pe.equipo_id = any(v_equipos)))),
      '[]'::jsonb));
end;
$$;

-- Igual que en 0018, salvo los planteles de quien no estaba en la lista:
-- con el permiso personal queda en todos los que pidió.
create or replace function public.ingreso_resolver(p_solicitud uuid, p_aprobar boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  s public.ingreso_solicitudes;
  v_persona uuid;
begin
  select * into s from public.ingreso_solicitudes where id = p_solicitud for update;
  if s.id is null or not public.ingreso_puedo_resolver(s) then
    raise exception 'No puedes resolver esa solicitud';
  end if;
  if s.estado <> 'pendiente' then raise exception 'Esa solicitud ya fue resuelta'; end if;

  if p_aprobar then
    if exists (select 1 from public.personas where user_id = s.user_id) then
      raise exception 'Esa cuenta ya está enlazada a otra persona';
    end if;
    if s.persona_id is not null then
      update public.personas set user_id = s.user_id
       where id = s.persona_id and user_id is null
      returning id into v_persona;
      if v_persona is null then raise exception 'Ese nombre ya tiene una cuenta'; end if;
    else
      insert into public.personas (club_id, nombre, user_id) values (s.club_id, s.nombre_propuesto, s.user_id)
      returning id into v_persona;
      -- Los planteles que maneja quien aprueba (Tesorería o un administrador, todos).
      insert into public.persona_equipos (persona_id, equipo_id, rol)
      select v_persona, e, 'jugador' from unnest(s.equipos_propuestos) as e
       where public.apruebo_ingresos() or public.soy_encargado(e);
    end if;

    -- Guarda el correo con que entró, salvo que ya lo use otra persona.
    if s.email is not null and not exists (
         select 1 from public.persona_contactos where email = s.email and persona_id <> v_persona) then
      perform set_config('jara.enlazando_ingreso', '1', true);
      insert into public.persona_contactos (persona_id, email) values (v_persona, s.email)
      on conflict (persona_id) do update set email = excluded.email;
      perform set_config('jara.enlazando_ingreso', '', true);
    end if;

    -- Si otra cuenta pedía el mismo nombre, queda rechazada.
    update public.ingreso_solicitudes
       set estado = 'rechazada', resuelta_por = public.mi_persona_id(), resuelta_en = now()
     where persona_id = s.persona_id and estado = 'pendiente' and id <> s.id;
  end if;

  update public.ingreso_solicitudes
     set estado = case when p_aprobar then 'aprobada' else 'rechazada' end,
         persona_id = coalesce(persona_id, v_persona),
         resuelta_por = public.mi_persona_id(), resuelta_en = now()
   where id = s.id;
end;
$$;

revoke execute on function public.apruebo_ingresos() from public, anon, authenticated;
revoke execute on function public.ingreso_puedo_aprobar() from public, anon;
grant execute on function public.ingreso_puedo_aprobar() to authenticated;
