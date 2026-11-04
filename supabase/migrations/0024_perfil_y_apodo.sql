-- Jara App · 0024 · El perfil del jugador se alimenta desde Tesorería, y apodo
--
-- Pedido del administrador al probar 0023 (4/11):
--   - El nombre, el celular y el correo que carga el tesorero quedan en el
--     perfil del jugador (personas / persona_contactos), no en una copia aparte.
--     El jugador no los edita: las tablas siguen cerradas al navegador (0018) y
--     ninguna función le deja cambiarlos.
--   - Cada jugador puede ponerse un apodo opcional (máx. 20 letras), que la app
--     muestra chico al lado del nombre real en estadísticas y goleadores.
--
-- Reglas del correo (es con lo que se entra a la app):
--   - Si el jugador no tiene correo en su perfil y nadie más lo usa, el que
--     pone el tesorero pasa a ser su correo de la app.
--   - Si ya tiene uno, ese no se toca (solo un administrador lo cambia). Lo que
--     escriba el tesorero queda solo como correo para cobrar.
--
-- Quién los cambia: el tesorero del plantel, Hacienda y administradores (los
-- mismos de tes_exigir), para quienes estén en la tesorería de ese plantel.
--
-- Revisión: toca datos personales y permisos. La revisa el administrador de la app.

alter table public.personas add column apodo text
  check (apodo is null or length(trim(apodo)) between 1 and 20);

-- ---------------------------------------------------------------------------
-- Apodo: cada uno el suyo
-- ---------------------------------------------------------------------------
create or replace function public.mi_apodo()
returns text language sql stable security definer set search_path = public as $$
  select apodo from public.personas where id = public.mi_persona_id();
$$;

create or replace function public.mi_apodo_guardar(p_apodo text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.mi_persona_id() is null then raise exception 'Tu cuenta no está en la nómina del club'; end if;
  if length(trim(coalesce(p_apodo, ''))) > 20 then raise exception 'El apodo puede tener hasta 20 letras'; end if;
  update public.personas set apodo = nullif(trim(p_apodo), '') where id = public.mi_persona_id();
end;
$$;

-- Los apodos del club, {persona_id: apodo}, para mostrarlos al lado del nombre.
create or replace function public.apodos()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(id, apodo), '{}'::jsonb)
    from public.personas
   where club_id = public.mi_club_id() and apodo is not null and estado <> 'inactivo';
$$;

-- ---------------------------------------------------------------------------
-- Tesorería
-- ---------------------------------------------------------------------------
-- Igual que en 0023, más 'apodo' y 'correo_perfil'; el celular sale del perfil.
create or replace function public.tes_ver(p_equipo uuid, p_temporada int)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.tes_puedo_ver(p_equipo) then
    raise exception 'Solo el tesorero del plantel, Hacienda o un administrador pueden ver esto';
  end if;
  return jsonb_build_object(
    'editar', public.tes_puedo_editar(p_equipo),
    'aporte_pct', coalesce((select aporte_pct from public.tes_planes where equipo_id = p_equipo and temporada = p_temporada), 0),
    'cuotas', coalesce((select jsonb_agg(jsonb_build_object('numero', numero, 'nombre', nombre, 'vence', vence, 'monto', monto) order by numero)
                          from public.tes_cuotas where equipo_id = p_equipo and temporada = p_temporada), '[]'::jsonb),
    'jugadores', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id, 'nombre', p.nombre,
               'en_plantel', exists (select 1 from public.persona_equipos pe where pe.persona_id = p.id and pe.equipo_id = p_equipo and pe.rol = 'jugador'),
               'activo', coalesce(tj.activo, true),
               'tipo', coalesce(tj.tipo, 'normal'),
               'descuento_pct', coalesce(tj.descuento_pct, 0),
               'monto_especial', tj.monto_especial,
               'deuda_anterior', coalesce(tj.deuda_anterior, 0),
               'apodo', p.apodo,
               'telefono', coalesce(pc.telefono, tj.telefono),
               'correo', coalesce(tj.correo, pc.email),
               'correo_perfil', pc.email,
               'comentario', tj.comentario,
               'con_cuenta', p.user_id is not null) order by p.nombre)
        from public.personas p
        left join public.tes_jugadores tj on tj.persona_id = p.id and tj.equipo_id = p_equipo and tj.temporada = p_temporada
        left join public.persona_contactos pc on pc.persona_id = p.id
       where p.estado <> 'inactivo'
         and (tj.persona_id is not null
              or exists (select 1 from public.persona_equipos pe where pe.persona_id = p.id and pe.equipo_id = p_equipo and pe.rol = 'jugador'))), '[]'::jsonb),
    'extras', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'persona', persona_id, 'concepto', concepto, 'monto', monto, 'vence', vence) order by vence, id)
                          from public.tes_extras where equipo_id = p_equipo and temporada = p_temporada), '[]'::jsonb),
    'pagos', coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'persona', g.persona_id, 'monto', g.monto, 'fecha', g.fecha,
                                                           'medio', g.medio, 'nota', g.nota, 'anulado', g.anulado_en is not null,
                                                           'registro', (select nombre from public.personas where id = g.registrado_por))
                                        order by g.fecha desc, g.id desc)
                         from public.tes_pagos g where g.equipo_id = p_equipo and g.temporada = p_temporada), '[]'::jsonb),
    'movimientos', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'fecha', fecha, 'tipo', tipo, 'categoria', categoria,
                                                                 'motivo', motivo, 'monto', monto, 'programado', programado)
                                              order by fecha desc, id desc)
                               from public.tes_movimientos where equipo_id = p_equipo and temporada = p_temporada), '[]'::jsonb));
end;
$$;


-- Igual que en 0023, pero nombre, apodo, celular y correo van al perfil.
create or replace function public.tes_guardar_jugador(p_equipo uuid, p_temporada int, p_persona uuid, p_datos jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_tipo   text := coalesce(p_datos->>'tipo', 'normal');
  v_nombre text := nullif(trim(p_datos->>'nombre'), '');
  v_tel    text := nullif(trim(p_datos->>'telefono'), '');
  v_correo text := nullif(lower(trim(p_datos->>'correo')), '');
  v_perfil text;
  v_cobro  text;
begin
  perform public.tes_exigir(p_equipo);
  if not exists (select 1 from public.personas where id = p_persona and club_id = public.mi_club_id()) then
    raise exception 'Esa persona no está en la nómina del club';
  end if;

  -- Condición del jugador (como en 0023). Queda en la tesorería del plantel.
  insert into public.tes_jugadores as t (equipo_id, temporada, persona_id, activo, tipo, descuento_pct, monto_especial,
                                         deuda_anterior, comentario)
  values (p_equipo, p_temporada, p_persona,
          coalesce((p_datos->>'activo')::boolean, true), v_tipo,
          case when v_tipo in ('normal', 'beca') then coalesce((p_datos->>'descuento_pct')::numeric, 0) else 0 end,
          case when v_tipo = 'especial' then (p_datos->>'monto_especial')::int end,
          coalesce((p_datos->>'deuda_anterior')::int, 0),
          nullif(trim(p_datos->>'comentario'), ''))
  on conflict (equipo_id, temporada, persona_id) do update set
    activo = excluded.activo, tipo = excluded.tipo, descuento_pct = excluded.descuento_pct,
    monto_especial = excluded.monto_especial, deuda_anterior = excluded.deuda_anterior,
    comentario = excluded.comentario, actualizado_en = now();

  -- Perfil: solo si los datos vienen (sumar a alguien manda {} y no toca nada).
  if not (p_datos ? 'nombre' or p_datos ? 'apodo' or p_datos ? 'telefono' or p_datos ? 'correo') then
    return;
  end if;

  if p_datos ? 'nombre' then
    if v_nombre is null or length(v_nombre) > 80 then raise exception 'El nombre no puede quedar vacío (máx. 80 letras)'; end if;
    update public.personas set nombre = v_nombre where id = p_persona;
  end if;
  if p_datos ? 'apodo' then
    if length(trim(coalesce(p_datos->>'apodo', ''))) > 20 then raise exception 'El apodo puede tener hasta 20 letras'; end if;
    update public.personas set apodo = nullif(trim(p_datos->>'apodo'), '') where id = p_persona;
  end if;

  if p_datos ? 'telefono' then
    if length(v_tel) > 30 then raise exception 'El celular es muy largo'; end if;
    insert into public.persona_contactos (persona_id, telefono) values (p_persona, v_tel)
      on conflict (persona_id) do update set telefono = excluded.telefono;
  end if;

  if p_datos ? 'correo' then
    if v_correo is not null and v_correo !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Ese correo no parece válido'; end if;
    select email into v_perfil from public.persona_contactos where persona_id = p_persona;
    v_cobro := v_correo;
    if v_perfil is null and v_correo is not null
       and not exists (select 1 from public.persona_contactos where email = v_correo and persona_id <> p_persona) then
      perform set_config('jara.enlazando_ingreso', '1', true);
      insert into public.persona_contactos (persona_id, email) values (p_persona, v_correo)
        on conflict (persona_id) do update set email = excluded.email;
      perform set_config('jara.enlazando_ingreso', '', true);
      v_cobro := null;
    elsif v_correo is not distinct from v_perfil then
      v_cobro := null;
    end if;
    update public.tes_jugadores set correo = v_cobro, telefono = null
     where equipo_id = p_equipo and temporada = p_temporada and persona_id = p_persona;
  end if;
end;
$$;

-- El celular que 0023 guardó aparte pasa al perfil, si el perfil no tenía.
insert into public.persona_contactos (persona_id, telefono)
select distinct on (tj.persona_id) tj.persona_id, tj.telefono
  from public.tes_jugadores tj
 where tj.telefono is not null
 order by tj.persona_id, tj.actualizado_en desc
on conflict (persona_id) do update set telefono = excluded.telefono
 where public.persona_contactos.telefono is null;
update public.tes_jugadores set telefono = null where telefono is not null;

revoke execute on function public.mi_apodo() from public, anon;
revoke execute on function public.mi_apodo_guardar(text) from public, anon;
revoke execute on function public.apodos() from public, anon;
grant execute on function public.mi_apodo() to authenticated;
grant execute on function public.mi_apodo_guardar(text) to authenticated;
grant execute on function public.apodos() to authenticated;
