-- Jara App · 0029 · RUT y fecha de nacimiento en Tesorería
--
-- Pedido del administrador (4/11): la liga pide seguido el RUT y la fecha de
-- nacimiento de cada jugador, y las fechas alimentan los cumpleaños. Los
-- tesoreros ya los tienen en sus planillas; con esto los cargan en la app.
--
--   - persona_contactos.rut: el RUT de cada persona, guardado como 12345678-K
--     (sin puntos, con guion y dígito verificador en mayúscula). No se repite.
--   - La fecha de nacimiento es la del perfil (perfiles.nacimiento, 0028).
--
-- Quién ve qué:
--   - El tesorero del plantel, Hacienda y administradores ven el RUT y la fecha
--     completa de los jugadores de ese plantel (los necesitan para la liga).
--     Las cuentas de prueba no los ven.
--   - El resto del club sigue viendo solo el día y el mes del cumpleaños (0028).
--
-- Quién cambia qué:
--   - El tesorero del plantel, Hacienda y administradores (los de tes_exigir),
--     solo para jugadores de ese plantel. El jugador puede seguir cambiando su
--     fecha desde su perfil (0028); el RUT no.
--
-- Revisión: toca datos personales y permisos. La revisa el administrador de la app.

alter table public.persona_contactos add column rut text
  check (rut is null or rut ~ '^[0-9]{7,8}-[0-9K]$');
create unique index persona_contactos_rut_idx on public.persona_contactos (rut) where rut is not null;

-- ---------------------------------------------------------------------------
-- RUT: deja '12.345.678-k' como '12345678-K' y revisa el dígito verificador.
-- Vacío devuelve null. Uno malo da error.
-- ---------------------------------------------------------------------------
create or replace function public.rut_normalizar(p_rut text)
returns text language plpgsql immutable set search_path = public as $$
declare
  v      text := upper(regexp_replace(coalesce(p_rut, ''), '[^0-9kK]', '', 'g'));
  v_num  text;
  v_dv   text;
  v_suma int := 0;
  v_mul  int := 2;
  v_res  int;
  v_esperado text;
begin
  if trim(coalesce(p_rut, '')) = '' then return null; end if;
  if p_rut ~ '[^0-9kK.\s-]' then raise exception 'El RUT % no parece válido', p_rut; end if;
  v_num := left(v, length(v) - 1);
  v_dv  := right(v, 1);
  if v_num !~ '^[0-9]{7,8}$' then raise exception 'El RUT % no parece válido', p_rut; end if;
  v_num := ltrim(v_num, '0');
  for i in reverse length(v_num)..1 loop
    v_suma := v_suma + substr(v_num, i, 1)::int * v_mul;
    v_mul := case when v_mul = 7 then 2 else v_mul + 1 end;
  end loop;
  v_res := 11 - (v_suma % 11);
  v_esperado := case v_res when 11 then '0' when 10 then 'K' else v_res::text end;
  if v_dv <> v_esperado then
    raise exception 'El dígito verificador del RUT % no calza', p_rut;
  end if;
  return v_num || '-' || v_dv;
end;
$$;

-- ---------------------------------------------------------------------------
-- Guardar RUT y fecha de un jugador del plantel. Solo cambia lo que viene en
-- p_datos: rut (texto, vacío lo borra) y nacimiento (aaaa-mm-dd, vacío lo borra).
-- ---------------------------------------------------------------------------
create or replace function public.tes_guardar_identidad(p_equipo uuid, p_persona uuid, p_datos jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_rut text;
  v_nac date;
begin
  perform public.tes_exigir(p_equipo);
  if not exists (select 1 from public.personas where id = p_persona and club_id = public.mi_club_id()) then
    raise exception 'Esa persona no está en la nómina del club';
  end if;
  if not exists (select 1 from public.tes_jugadores where persona_id = p_persona and equipo_id = p_equipo)
     and not exists (select 1 from public.persona_equipos where persona_id = p_persona and equipo_id = p_equipo and rol = 'jugador') then
    raise exception 'Esa persona no es de este plantel';
  end if;

  if p_datos ? 'rut' then
    v_rut := public.rut_normalizar(p_datos->>'rut');
    if v_rut is not null and exists (select 1 from public.persona_contactos where rut = v_rut and persona_id <> p_persona) then
      raise exception 'Ese RUT ya está cargado en otra persona del club';
    end if;
    insert into public.persona_contactos (persona_id, rut) values (p_persona, v_rut)
      on conflict (persona_id) do update set rut = excluded.rut;
  end if;

  if p_datos ? 'nacimiento' then
    v_nac := nullif(trim(coalesce(p_datos->>'nacimiento', '')), '')::date;
    if v_nac is not null and (v_nac < date '1930-01-01' or v_nac > current_date - interval '5 years') then
      raise exception 'Revisa la fecha de nacimiento';
    end if;
    insert into public.perfiles (persona_id, nacimiento) values (p_persona, v_nac)
      on conflict (persona_id) do update set nacimiento = excluded.nacimiento, actualizado_en = now();
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tesorería: igual que en 0024, más 'rut' y 'nacimiento' (no para cuentas de prueba).
-- ---------------------------------------------------------------------------
create or replace function public.tes_ver(p_equipo uuid, p_temporada int)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_datos boolean := not public.soy_cuenta_de_prueba();
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
               'rut', case when v_datos then pc.rut end,
               'nacimiento', case when v_datos then pf.nacimiento end,
               'comentario', tj.comentario,
               'con_cuenta', p.user_id is not null) order by p.nombre)
        from public.personas p
        left join public.tes_jugadores tj on tj.persona_id = p.id and tj.equipo_id = p_equipo and tj.temporada = p_temporada
        left join public.persona_contactos pc on pc.persona_id = p.id
        left join public.perfiles pf on pf.persona_id = p.id
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

revoke execute on function public.rut_normalizar(text) from public, anon;
revoke execute on function public.tes_guardar_identidad(uuid, uuid, jsonb) from public, anon;
grant execute on function public.rut_normalizar(text) to authenticated;
grant execute on function public.tes_guardar_identidad(uuid, uuid, jsonb) to authenticated;
