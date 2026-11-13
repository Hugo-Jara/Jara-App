-- Jara App · 0053 · Nombre, Apellido paterno y Apellido materno
--
-- La planilla común de tesorería cambia "Nombre completo" por tres columnas:
-- Nombre, Apellido paterno y Apellido materno. Así todos se muestran igual en
-- la app: "Nombre Apellido paterno" y, en chico al lado, el apodo si la
-- persona eligió uno en su perfil.
--
--   1. personas guarda las tres partes (nombres, apellido_paterno,
--      apellido_materno). Cuando hay Nombre y Apellido paterno, un trigger
--      arma personas.nombre = 'Nombre Apellido paterno'. Toda la app ya
--      muestra personas.nombre, así que no cambia ninguna otra función.
--      Con las partes puestas, el nombre solo se cambia cambiando las partes
--      (en la planilla y volviendo a importar).
--   2. tes_importar_planilla (0052) lee las partes. Si la fila las trae, la
--      planilla manda en el nombre (la vista previa muestra "Nombre en la
--      app: antes → después"). Si la pestaña todavía tiene "Nombre completo",
--      todo sigue como en 0052 y el nombre no se toca.
--   3. El apodo ya no viene de la planilla (lo elige cada uno).
--   4. tes_ver devuelve las partes para mostrarlas en la ficha del jugador.
--
-- No borra ni mueve plata: solo cambia nombres. Los nombres de hoy quedan
-- igual hasta que cada plantel importe la planilla nueva.
--
-- Revisión: datos personales de la nómina. La revisa el administrador de la app.

alter table public.personas
  add column nombres          text check (length(nombres) between 1 and 60),
  add column apellido_paterno text check (length(apellido_paterno) between 1 and 60),
  add column apellido_materno text check (length(apellido_materno) between 1 and 60);

create or replace function public.personas_nombre_por_partes()
returns trigger language plpgsql set search_path = public as $$
declare
  v_armado text;
begin
  new.nombres := nullif(regexp_replace(trim(coalesce(new.nombres, '')), '\s+', ' ', 'g'), '');
  new.apellido_paterno := nullif(regexp_replace(trim(coalesce(new.apellido_paterno, '')), '\s+', ' ', 'g'), '');
  new.apellido_materno := nullif(regexp_replace(trim(coalesce(new.apellido_materno, '')), '\s+', ' ', 'g'), '');
  if new.nombres is null or new.apellido_paterno is null then
    return new;
  end if;
  v_armado := new.nombres || ' ' || new.apellido_paterno;
  if tg_op = 'UPDATE' and new.nombre is distinct from old.nombre and new.nombre <> v_armado
     and (new.nombres, new.apellido_paterno) is not distinct from (old.nombres, old.apellido_paterno) then
    raise exception 'El nombre de % viene de la planilla de tesorería: cámbialo ahí (Nombre y Apellido paterno) y vuelve a importar', old.nombre;
  end if;
  new.nombre := v_armado;
  return new;
end;
$$;

create trigger personas_nombre_por_partes
  before insert or update of nombre, nombres, apellido_paterno, apellido_materno on public.personas
  for each row execute function public.personas_nombre_por_partes();

-- ---------------------------------------------------------------------------
-- La importación (igual que 0052, más el nombre por partes y sin apodo)
-- p_filas: [{fila, nombre, nombres, apellido_paterno, apellido_materno, rut, nacimiento (aaaa-mm-dd), telefono, correo,
--            tipo, descuento_pct, monto_especial, deuda_anterior, pagado, comentario}]
-- p_plan:  null (no tocar el plan) o [{numero, nombre, vence, monto}]
-- p_aporte_pct: null (no tocar) o el % de aporte al club
-- p_bajas: personas de "ya no está en la planilla" que el tesorero da de baja
-- ---------------------------------------------------------------------------
create or replace function public.tes_importar_planilla(
  p_equipo uuid, p_temporada int, p_filas jsonb, p_plan jsonb, p_aporte_pct numeric,
  p_bajas uuid[], p_archivo text, p_confirmar boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_club    uuid := public.mi_club_id();
  v_yo      uuid := public.mi_persona_id();
  r         record;
  v_rut     text;
  v_nac     date;
  v_id      uuid;
  v_n       int;
  v_errores jsonb := '[]'::jsonb;
  v_filas   jsonb;
  v_fuera   jsonb;
  v_plan_cambia boolean := false;
  v_aporte_cambia boolean := false;
  v_resumen jsonb;
begin
  perform public.tes_exigir(p_equipo);
  if p_temporada is null or p_temporada not between 2020 and 2100 then raise exception 'La temporada no viene bien'; end if;
  if jsonb_typeof(p_filas) is distinct from 'array' then raise exception 'La planilla no viene bien'; end if;
  if jsonb_array_length(p_filas) = 0 then raise exception 'La pestaña del plantel no tiene jugadores'; end if;
  if jsonb_array_length(p_filas) > 300 then raise exception 'Máximo 300 jugadores por plantel'; end if;
  if p_plan is not null and (jsonb_typeof(p_plan) <> 'array' or jsonb_array_length(p_plan) > 25) then
    raise exception 'El plan de cuotas no viene bien (máximo 25 cuotas)';
  end if;
  if p_aporte_pct is not null and p_aporte_pct not between 0 and 100 then raise exception 'El aporte al club va de 0 a 100%%'; end if;

  drop table if exists _tes_imp;
  create temp table _tes_imp (
    fila int, nombre text, pal text[], nombres text, paterno text, materno text, rut_txt text, rut text, nacimiento date,
    telefono text, correo text, tipo text, descuento numeric, especial int, deuda int, pagado int, comentario text,
    persona_id uuid, como text, estado text, avisos text[] not null default '{}', cambios text[] not null default '{}'
  ) on commit drop;

  insert into _tes_imp (fila, nombre, pal, nombres, paterno, materno, rut_txt, nacimiento, telefono, correo, tipo, descuento, especial, deuda, pagado, comentario)
  select coalesce((f->>'fila')::int, o::int + 1),
         left(trim(f->>'nombre'), 120), public.tes_palabras(f->>'nombre'),
         nullif(left(regexp_replace(trim(coalesce(f->>'nombres', '')), '\s+', ' ', 'g'), 60), ''),
         nullif(left(regexp_replace(trim(coalesce(f->>'apellido_paterno', '')), '\s+', ' ', 'g'), 60), ''),
         nullif(left(regexp_replace(trim(coalesce(f->>'apellido_materno', '')), '\s+', ' ', 'g'), 60), ''),
         nullif(trim(coalesce(f->>'rut', '')), ''),
         null,
         nullif(left(regexp_replace(coalesce(f->>'telefono', ''), '[^0-9+ ]', '', 'g'), 30), ''),
         nullif(left(lower(trim(coalesce(f->>'correo', ''))), 120), ''),
         lower(coalesce(nullif(trim(f->>'tipo'), ''), 'normal')),
         least(100, greatest(0, coalesce((f->>'descuento_pct')::numeric, 0))),
         case when nullif(f->>'monto_especial', '') is null then null
              else least(10000000, greatest(0, (f->>'monto_especial')::numeric))::int end,
         least(10000000, greatest(0, coalesce((f->>'deuda_anterior')::numeric, 0)))::int,
         least(10000000, greatest(0, coalesce((f->>'pagado')::numeric, 0)))::int,
         nullif(left(trim(coalesce(f->>'comentario', '')), 300), '')
    from jsonb_array_elements(p_filas) with ordinality as x(f, o)
   where trim(coalesce(f->>'nombre', '')) <> '';

  -- Revisar cada fila: RUT, fecha, condición y correo.
  for r in select * from _tes_imp loop
    begin
      v_rut := public.rut_normalizar(r.rut_txt);
    exception when others then
      v_rut := null;
      update _tes_imp set avisos = avisos || format('El RUT "%s" no es válido: no se usa', r.rut_txt) where fila = r.fila;
    end;
    update _tes_imp set rut = v_rut where fila = r.fila;
  end loop;
  for r in select x.o::int + 1 as pos, f from jsonb_array_elements(p_filas) with ordinality as x(f, o) loop
    if nullif(trim(coalesce(r.f->>'nacimiento', '')), '') is null then continue; end if;
    begin
      v_nac := (r.f->>'nacimiento')::date;
      if v_nac < date '1930-01-01' or v_nac > current_date - interval '5 years' then raise exception 'fuera de rango'; end if;
      update _tes_imp set nacimiento = v_nac where fila = coalesce((r.f->>'fila')::int, r.pos);
    exception when others then
      update _tes_imp set avisos = avisos || format('La fecha de nacimiento "%s" no se entiende: no se usa', r.f->>'nacimiento')
       where fila = coalesce((r.f->>'fila')::int, r.pos);
    end;
  end loop;
  update _tes_imp set tipo = 'exento' where tipo = 'galleta';
  update _tes_imp set avisos = avisos || format('Condición "%s" no se entiende: queda Normal', tipo), tipo = 'normal'
   where tipo not in ('normal', 'beca', 'exento', 'especial');
  update _tes_imp set avisos = avisos || 'Es Especial sin monto: queda Normal'::text, tipo = 'normal'
   where tipo = 'especial' and especial is null;
  update _tes_imp set especial = null where tipo <> 'especial';
  update _tes_imp set descuento = 0 where tipo not in ('normal', 'beca');
  update _tes_imp set avisos = avisos || format('El correo "%s" no es válido: no se usa', correo), correo = null
   where correo is not null and correo !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$';

  -- Nombre por partes (planilla nueva): sin Nombre o sin Apellido paterno no se toca el nombre de la app.
  update _tes_imp set avisos = avisos || 'Falta el Nombre o el Apellido paterno: el nombre de la app no se cambia'::text,
         nombres = null, paterno = null, materno = null
   where (nombres is null) <> (paterno is null) or (nombres is null and materno is not null);

  -- Regla 3: el mismo RUT dos veces en la pestaña detiene todo.
  select v_errores || coalesce(jsonb_agg(format('El RUT %s aparece en las filas %s', rut, filas)), '[]'::jsonb) into v_errores
    from (select rut, string_agg(fila::text, ' y ' order by fila) filas from _tes_imp
           where rut is not null group by rut having count(*) > 1) d;

  -- Regla 1: calzar. Primero por RUT (en todo el club).
  update _tes_imp i set persona_id = p.id, como = 'RUT'
    from public.persona_contactos pc join public.personas p on p.id = pc.persona_id
   where i.rut is not null and pc.rut = i.rut and p.club_id = v_club;

  -- Después por nombre: igual (en todo el club), luego todas las palabras del
  -- nombre más corto dentro del otro (primero en el plantel, después en el club).
  drop table if exists _tes_nom;
  create temp table _tes_nom on commit drop as
    select p.id, p.nombre, public.tes_palabras(p.nombre) as pal, pc.rut,
           (exists (select 1 from public.persona_equipos pe where pe.persona_id = p.id and pe.equipo_id = p_equipo and pe.rol = 'jugador')
            or exists (select 1 from public.tes_jugadores tj where tj.persona_id = p.id and tj.equipo_id = p_equipo and tj.temporada = p_temporada)) as del_plantel
      from public.personas p left join public.persona_contactos pc on pc.persona_id = p.id
     where p.club_id = v_club and p.estado <> 'inactivo' and cardinality(public.tes_palabras(p.nombre)) > 0;

  update _tes_imp i set persona_id = (select n.id from _tes_nom n where n.pal = i.pal), como = 'nombre'
   where i.persona_id is null and (select count(*) from _tes_nom n where n.pal = i.pal) = 1;
  update _tes_imp i set persona_id = (select n.id from _tes_nom n where n.del_plantel and cardinality(n.pal) >= 2 and cardinality(i.pal) >= 2
                                                                   and (n.pal <@ i.pal or i.pal <@ n.pal)), como = 'nombre parecido'
   where i.persona_id is null
     and (select count(*) from _tes_nom n where n.del_plantel and cardinality(n.pal) >= 2 and cardinality(i.pal) >= 2
                                            and (n.pal <@ i.pal or i.pal <@ n.pal)) = 1;
  update _tes_imp i set persona_id = (select n.id from _tes_nom n where cardinality(n.pal) >= 2 and cardinality(i.pal) >= 2
                                                                   and (n.pal <@ i.pal or i.pal <@ n.pal)), como = 'nombre parecido'
   where i.persona_id is null
     and (select count(*) from _tes_nom n where cardinality(n.pal) >= 2 and cardinality(i.pal) >= 2
                                            and (n.pal <@ i.pal or i.pal <@ n.pal)) = 1;

  -- Si calzó por nombre pero en la app tiene otro RUT, no es la misma persona.
  update _tes_imp i set estado = 'conflicto', persona_id = null,
         avisos = avisos || format('Calza por nombre con %s, pero en la app tiene otro RUT: revisa', n.nombre)
    from _tes_nom n
   where i.como like 'nombre%' and n.id = i.persona_id and n.rut is not null and i.rut is not null and n.rut <> i.rut;

  update _tes_imp i set estado = 'duda',
         avisos = avisos || ('Puede ser: ' || (select string_agg(n.nombre, ' / ' order by n.nombre) from _tes_nom n
                                               where n.pal = i.pal or (cardinality(n.pal) >= 2 and cardinality(i.pal) >= 2 and (n.pal <@ i.pal or i.pal <@ n.pal))))
   where i.persona_id is null and i.estado is null
     and exists (select 1 from _tes_nom n where n.pal = i.pal or (cardinality(n.pal) >= 2 and cardinality(i.pal) >= 2 and (n.pal <@ i.pal or i.pal <@ n.pal)));
  update _tes_imp set estado = 'nuevo' where persona_id is null and estado is null and rut is not null;
  update _tes_imp set estado = 'sin_rut', avisos = avisos || 'Sin RUT y no calza con nadie de la app: no se importa'::text
   where persona_id is null and estado is null;
  update _tes_imp set estado = 'calza' where persona_id is not null;
  update _tes_imp set avisos = avisos || 'Le falta el RUT en la planilla'::text where estado = 'calza' and rut is null;

  -- Regla 3: dos filas que calzan con la misma persona detienen todo.
  select v_errores || coalesce(jsonb_agg(format('Las filas %s son la misma persona (%s)', filas, nombre)), '[]'::jsonb) into v_errores
    from (select string_agg(i.fila::text, ' y ' order by i.fila) filas, min(p.nombre) nombre
            from _tes_imp i join public.personas p on p.id = i.persona_id
           group by i.persona_id having count(*) > 1) d;

  -- Qué cambia en cada fila que se importa (para la vista previa).
  update _tes_imp set cambios = cambios || 'Se suma a la nómina y al plantel'::text where estado = 'nuevo';
  update _tes_imp i set cambios = cambios || 'Se suma al plantel'::text
   where estado = 'calza'
     and not exists (select 1 from public.persona_equipos pe where pe.persona_id = i.persona_id and pe.equipo_id = p_equipo and pe.rol = 'jugador');
  update _tes_imp i set cambios = cambios || array_remove(array[
           case when coalesce(tj.tipo, 'normal') <> i.tipo or coalesce(tj.descuento_pct, 0) <> i.descuento
                     or coalesce(tj.monto_especial, -1) <> coalesce(i.especial, -1) then 'Condición' end,
           case when coalesce(tj.deuda_anterior, 0) <> i.deuda then 'Deuda anterior' end,
           case when not coalesce(tj.activo, true) then 'Vuelve a quedar activo' end,
           case when i.paterno is not null and (p.nombres, p.apellido_paterno, coalesce(p.apellido_materno, ''))
                     is distinct from (i.nombres, i.paterno, coalesce(i.materno, ''))
                then case when p.nombre = i.nombres || ' ' || i.paterno then 'Se actualizan nombre y apellidos'
                          else format('Nombre en la app: %s → %s', p.nombre, i.nombres || ' ' || i.paterno) end end,
           case when pc.rut is null and i.rut is not null then 'Se carga el RUT' end,
           case when pf.nacimiento is null and i.nacimiento is not null then 'Se carga la fecha de nacimiento' end], null)
    from public.personas p
    left join public.tes_jugadores tj on tj.persona_id = p.id and tj.equipo_id = p_equipo and tj.temporada = p_temporada
    left join public.persona_contactos pc on pc.persona_id = p.id
    left join public.perfiles pf on pf.persona_id = p.id
   where i.estado = 'calza' and p.id = i.persona_id;
  update _tes_imp i set cambios = cambios || format('Pagado: $%s → $%s',
           public.tes_pesos(coalesce(g.total, 0)), public.tes_pesos(i.pagado))
    from (select i2.fila, (select sum(monto) from public.tes_pagos g where g.equipo_id = p_equipo and g.temporada = p_temporada
                             and g.persona_id = i2.persona_id and g.medio = 'planilla' and g.anulado_en is null) as total
            from _tes_imp i2) g
   where g.fila = i.fila and i.estado in ('calza', 'nuevo') and coalesce(g.total, 0) <> i.pagado;
  update _tes_imp i set avisos = avisos || format('Además tiene $%s en pagos anotados en la app: revisa que no estén también en la planilla',
           public.tes_pesos(s.total))
    from (select persona_id, sum(monto) total from public.tes_pagos
           where equipo_id = p_equipo and temporada = p_temporada and medio <> 'planilla' and anulado_en is null group by 1) s
   where s.persona_id = i.persona_id and i.estado = 'calza';

  -- Regla 4: quién está en el plantel y no en la planilla.
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'nombre', p.nombre) order by p.nombre), '[]'::jsonb) into v_fuera
    from public.personas p
    left join public.tes_jugadores tj on tj.persona_id = p.id and tj.equipo_id = p_equipo and tj.temporada = p_temporada
   where p.club_id = v_club and p.estado <> 'inactivo' and coalesce(tj.activo, true)
     and (tj.persona_id is not null
          or exists (select 1 from public.persona_equipos pe where pe.persona_id = p.id and pe.equipo_id = p_equipo and pe.rol = 'jugador'))
     and not exists (select 1 from _tes_imp i where i.persona_id = p.id);

  -- Plan de cuotas y aporte: ¿cambian?
  if p_plan is not null then
    v_plan_cambia := (select coalesce(jsonb_agg(jsonb_build_object('numero', numero, 'nombre', nombre, 'vence', vence, 'monto', monto) order by numero), '[]'::jsonb)
                        from public.tes_cuotas where equipo_id = p_equipo and temporada = p_temporada)
                     is distinct from
                     (select coalesce(jsonb_agg(jsonb_build_object('numero', (c->>'numero')::int, 'nombre', trim(c->>'nombre'),
                                                                   'vence', (c->>'vence')::date, 'monto', (c->>'monto')::int) order by (c->>'numero')::int), '[]'::jsonb)
                        from jsonb_array_elements(p_plan) c);
  end if;
  if p_aporte_pct is not null then
    v_aporte_cambia := coalesce((select aporte_pct from public.tes_planes where equipo_id = p_equipo and temporada = p_temporada), 0) <> p_aporte_pct;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'fila', i.fila, 'nombre', i.nombre, 'estado', i.estado, 'como', i.como,
           'en_app', (select nombre from public.personas where id = i.persona_id),
           'cambios', to_jsonb(i.cambios), 'avisos', to_jsonb(i.avisos)) order by i.fila), '[]'::jsonb) into v_filas
    from _tes_imp i;

  v_resumen := jsonb_build_object(
    'filas', (select count(*) from _tes_imp),
    'calzan', (select count(*) from _tes_imp where estado = 'calza'),
    'nuevos', (select count(*) from _tes_imp where estado = 'nuevo'),
    'con_cambios', (select count(*) from _tes_imp where estado in ('calza', 'nuevo') and cardinality(cambios) > 0),
    'no_se_importan', (select count(*) from _tes_imp where estado in ('duda', 'sin_rut', 'conflicto')),
    'fuera', jsonb_array_length(v_fuera),
    'plan_cambia', v_plan_cambia,
    'aporte_cambia', v_aporte_cambia);

  if not coalesce(p_confirmar, false) or jsonb_array_length(v_errores) > 0 then
    return jsonb_build_object('confirmado', false, 'errores', v_errores, 'resumen', v_resumen,
                              'filas', v_filas, 'fuera', v_fuera);
  end if;

  -- =========================================================================
  -- Aplicar (todo o nada: es una sola llamada)
  -- =========================================================================
  -- Nuevos a la nómina.
  for r in select * from _tes_imp where estado = 'nuevo' loop
    insert into public.personas (club_id, nombre, nombres, apellido_paterno, apellido_materno)
    values (v_club, r.nombre, r.nombres, r.paterno, r.materno) returning id into v_id;
    update _tes_imp set persona_id = v_id where fila = r.fila;
  end loop;

  -- Al plantel.
  insert into public.persona_equipos (persona_id, equipo_id, rol)
  select persona_id, p_equipo, 'jugador' from _tes_imp where estado in ('calza', 'nuevo')
  on conflict do nothing;

  -- Nombre: si la planilla lo trae por partes, manda (el trigger arma "Nombre Apellido").
  -- El apodo nunca viene de la planilla: lo elige cada uno en su perfil.
  update public.personas p set nombres = i.nombres, apellido_paterno = i.paterno, apellido_materno = i.materno
    from _tes_imp i
   where i.estado = 'calza' and p.id = i.persona_id and i.paterno is not null
     and (p.nombres, p.apellido_paterno, p.apellido_materno) is distinct from (i.nombres, i.paterno, i.materno);

  -- Perfil: solo lo que está vacío.
  insert into public.perfiles (persona_id, nacimiento)
  select persona_id, nacimiento from _tes_imp where estado in ('calza', 'nuevo') and nacimiento is not null
  on conflict (persona_id) do update set nacimiento = excluded.nacimiento, actualizado_en = now()
   where public.perfiles.nacimiento is null;
  insert into public.persona_contactos (persona_id, rut, telefono)
  select i.persona_id, i.rut, i.telefono from _tes_imp i
   where i.estado in ('calza', 'nuevo') and (i.rut is not null or i.telefono is not null)
  on conflict (persona_id) do update
     set rut = coalesce(public.persona_contactos.rut, excluded.rut),
         telefono = coalesce(public.persona_contactos.telefono, excluded.telefono);
  -- Correo de entrada: solo si no tenía y nadie más lo usa.
  perform set_config('jara.enlazando_ingreso', '1', true);
  insert into public.persona_contactos (persona_id, email)
  select i.persona_id, i.correo from _tes_imp i
   where i.estado in ('calza', 'nuevo') and i.correo is not null
     and not exists (select 1 from public.persona_contactos c where c.email = i.correo)
     and (select count(*) from _tes_imp o where o.correo = i.correo) = 1
  on conflict (persona_id) do update set email = excluded.email where public.persona_contactos.email is null;
  perform set_config('jara.enlazando_ingreso', '', true);

  -- Condición en la temporada (la planilla manda).
  insert into public.tes_jugadores as t (equipo_id, temporada, persona_id, activo, tipo, descuento_pct, monto_especial,
                                         deuda_anterior, telefono, correo, comentario)
  select p_equipo, p_temporada, persona_id, true, tipo, descuento, especial, deuda, telefono, correo, comentario
    from _tes_imp where estado in ('calza', 'nuevo')
  on conflict (equipo_id, temporada, persona_id) do update set
    activo = true, tipo = excluded.tipo, descuento_pct = excluded.descuento_pct, monto_especial = excluded.monto_especial,
    deuda_anterior = excluded.deuda_anterior, telefono = excluded.telefono, correo = excluded.correo,
    comentario = excluded.comentario, actualizado_en = now();

  -- Pagado: se reemplaza el pago de planilla si cambió.
  drop table if exists _tes_pag;
  create temp table _tes_pag on commit drop as
    select i.persona_id, i.pagado,
           coalesce((select sum(monto) from public.tes_pagos g where g.equipo_id = p_equipo and g.temporada = p_temporada
                       and g.persona_id = i.persona_id and g.medio = 'planilla' and g.anulado_en is null), 0) as antes
      from _tes_imp i where i.estado in ('calza', 'nuevo');
  update public.tes_pagos g set anulado_en = now(), anulado_por = v_yo
    from _tes_pag x
   where x.antes <> x.pagado and g.persona_id = x.persona_id and g.equipo_id = p_equipo and g.temporada = p_temporada
     and g.medio = 'planilla' and g.anulado_en is null;
  insert into public.tes_pagos (equipo_id, temporada, persona_id, monto, fecha, medio, nota, registrado_por)
  select p_equipo, p_temporada, persona_id, pagado, current_date, 'planilla', 'Pagado según la planilla común', v_yo
    from _tes_pag where antes <> pagado and pagado > 0;

  -- Plan de cuotas y aporte.
  if v_plan_cambia then
    delete from public.tes_cuotas where equipo_id = p_equipo and temporada = p_temporada;
    insert into public.tes_cuotas (equipo_id, temporada, numero, nombre, vence, monto)
    select p_equipo, p_temporada, (c->>'numero')::int, trim(c->>'nombre'), (c->>'vence')::date, (c->>'monto')::int
      from jsonb_array_elements(p_plan) c;
  end if;
  if v_plan_cambia or v_aporte_cambia then
    insert into public.tes_planes (equipo_id, temporada, aporte_pct) values (p_equipo, p_temporada, coalesce(p_aporte_pct, 0))
    on conflict (equipo_id, temporada) do update
       set aporte_pct = coalesce(p_aporte_pct, public.tes_planes.aporte_pct), actualizado_en = now();
  end if;

  -- Bajas elegidas por el tesorero (solo de los que ya no están en la planilla).
  insert into public.tes_jugadores (equipo_id, temporada, persona_id, activo)
  select p_equipo, p_temporada, (f->>'id')::uuid, false
    from jsonb_array_elements(v_fuera) f
   where (f->>'id')::uuid = any (coalesce(p_bajas, '{}'))
  on conflict (equipo_id, temporada, persona_id) do update set activo = false, actualizado_en = now();
  get diagnostics v_n = row_count;
  v_resumen := v_resumen || jsonb_build_object('bajas', v_n);

  insert into public.tes_importaciones (equipo_id, temporada, archivo, hecha_por, resumen)
  values (p_equipo, p_temporada, left(p_archivo, 200), v_yo, v_resumen);

  return jsonb_build_object('confirmado', true, 'errores', '[]'::jsonb, 'resumen', v_resumen,
                            'filas', v_filas, 'fuera', v_fuera);
end;
$$;

-- ---------------------------------------------------------------------------
-- Tesorería: igual que en 0029, más las partes del nombre para la ficha.
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
               'nombres', p.nombres, 'apellido_paterno', p.apellido_paterno, 'apellido_materno', p.apellido_materno,
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

revoke execute on function public.personas_nombre_por_partes() from public, anon, authenticated;
