-- Jara App · 0052 · Importar la planilla común de tesorería con un botón
--
-- Los tesoreros siguen llevando su plantel en la planilla común (Excel o
-- Google Sheets). Cuando quieren, la descargan como .xlsx y la suben en
-- Tesorería > Importar planilla. La app lee la pestaña de su plantel y
-- la hoja "Cuotas" en el navegador y llama a tes_importar_planilla():
--
--   - Primero con p_confirmar = false: no cambia nada y devuelve la vista
--     previa (quién calza, quién es nuevo, qué cambia, qué filas tienen
--     problemas y quién ya no está en la planilla).
--   - Después con p_confirmar = true: aplica todo o nada.
--
-- Reglas:
--   1. El RUT es la llave. Si no calza por RUT, se busca por nombre (la
--      primera vez nadie tiene RUT en la app). Si el nombre calza con dos o
--      más personas, la fila queda en DUDA y no se importa.
--   2. Una fila sin RUT que no calza con nadie no se importa (no se crean
--      personas sin RUT). Si calza por nombre, se importa con un aviso.
--   3. El mismo RUT dos veces en la pestaña, o dos filas que calzan con la
--      misma persona, detienen la importación: hay que arreglar la planilla.
--   4. Nadie se borra solo. Quien está en el plantel y no en la planilla
--      aparece como "ya no está"; el tesorero elige si darlo de baja
--      (queda inactivo en la tesorería de la temporada, no sale del plantel).
--   5. La planilla manda en: condición, descuento, monto especial, deuda
--      anterior, Pagado (temporada), contacto para cobrar, comentario y el
--      plan de cuotas (si la hoja "Cuotas" trae el plantel).
--      "Pagado" se reemplaza, no se suma: se anula el pago de planilla
--      anterior y queda uno nuevo por el total. Importar dos veces la misma
--      planilla no cambia nada.
--   6. La planilla no pisa: apodo, fecha de nacimiento, RUT, celular y
--      correo del perfil solo se llenan si están vacíos. El correo con que
--      se entra a la app nunca se cambia, y solo se llena si nadie lo usa.
--   7. Cada importación confirmada queda registrada (tes_importaciones).
--
-- Quién: los mismos de tes_exigir (tesorero del plantel, Hacienda y
-- administradores; las cuentas de prueba no).
--
-- Revisión: mueve plata, datos personales y crea personas en la nómina.
-- La revisan el administrador de la app y Hacienda.

create table public.tes_importaciones (
  id          bigint generated always as identity primary key,
  equipo_id   uuid not null references public.equipos(id) on delete cascade,
  temporada   int  not null,
  archivo     text check (length(archivo) <= 200),
  hecha_por   uuid references public.personas(id) on delete set null,
  hecha_en    timestamptz not null default now(),
  resumen     jsonb not null
);
create index tes_importaciones_idx on public.tes_importaciones (equipo_id, temporada, hecha_en desc);
alter table public.tes_importaciones enable row level security;
revoke all on public.tes_importaciones from anon, authenticated;

-- Nombre en palabras, sin tildes ni signos: 'José  Pérez-Soto' -> {jose,perez,soto}
create or replace function public.tes_palabras(t text)
returns text[] language sql immutable set search_path = public as $$
  select coalesce(array_agg(w order by w), '{}')
    from unnest(string_to_array(regexp_replace(public.sin_tildes(t), '[^a-z]+', ' ', 'g'), ' ')) w
   where w <> '';
$$;

-- 1234567 -> '1.234.567'
create or replace function public.tes_pesos(n numeric)
returns text language sql immutable set search_path = public as $$
  select replace(to_char(coalesce(n, 0), 'FM999,999,999,990'), ',', '.');
$$;

-- ---------------------------------------------------------------------------
-- La importación
-- p_filas: [{fila, nombre, apodo, rut, nacimiento (aaaa-mm-dd), telefono, correo,
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
    fila int, nombre text, pal text[], apodo text, rut_txt text, rut text, nacimiento date,
    telefono text, correo text, tipo text, descuento numeric, especial int, deuda int, pagado int, comentario text,
    persona_id uuid, como text, estado text, avisos text[] not null default '{}', cambios text[] not null default '{}'
  ) on commit drop;

  insert into _tes_imp (fila, nombre, pal, apodo, rut_txt, nacimiento, telefono, correo, tipo, descuento, especial, deuda, pagado, comentario)
  select coalesce((f->>'fila')::int, o::int + 1),
         left(trim(f->>'nombre'), 120), public.tes_palabras(f->>'nombre'),
         nullif(left(trim(coalesce(f->>'apodo', '')), 20), ''),
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
    insert into public.personas (club_id, nombre) values (v_club, r.nombre) returning id into v_id;
    update _tes_imp set persona_id = v_id where fila = r.fila;
  end loop;

  -- Al plantel.
  insert into public.persona_equipos (persona_id, equipo_id, rol)
  select persona_id, p_equipo, 'jugador' from _tes_imp where estado in ('calza', 'nuevo')
  on conflict do nothing;

  -- Perfil: solo lo que está vacío.
  update public.personas p set apodo = i.apodo
    from _tes_imp i where i.estado in ('calza', 'nuevo') and p.id = i.persona_id and i.apodo is not null and p.apodo is null;
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

-- La última importación del plantel (null si nunca se importó): para que la
-- app muestre "viene de la planilla" y no deje editar lo que la planilla pisa.
create or replace function public.tes_ultima_importacion(p_equipo uuid, p_temporada int)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.tes_puedo_ver(p_equipo) then
    raise exception 'Solo el tesorero del plantel, Hacienda o un administrador pueden ver esto';
  end if;
  return (select jsonb_build_object('hecha_en', i.hecha_en, 'archivo', i.archivo, 'resumen', i.resumen,
                                    'por', (select nombre from public.personas where id = i.hecha_por))
            from public.tes_importaciones i
           where i.equipo_id = p_equipo and i.temporada = p_temporada
           order by i.hecha_en desc, i.id desc limit 1);
end;
$$;

revoke execute on function public.tes_palabras(text) from public, anon, authenticated;
revoke execute on function public.tes_pesos(numeric) from public, anon, authenticated;
revoke execute on function public.tes_importar_planilla(uuid, int, jsonb, jsonb, numeric, uuid[], text, boolean) from public, anon;
revoke execute on function public.tes_ultima_importacion(uuid, int) from public, anon;
grant execute on function public.tes_importar_planilla(uuid, int, jsonb, jsonb, numeric, uuid[], text, boolean) to authenticated;
grant execute on function public.tes_ultima_importacion(uuid, int) to authenticated;
