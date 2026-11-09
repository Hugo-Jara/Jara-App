-- Jara App · 0041 · Fotos de cada partido, desde el Drive del fotógrafo de la liga
--
-- Las fotos de los partidos están en el Drive del fotógrafo de la liga,
-- ordenadas como "Junior Clausura / Fecha 7 / Rival vs Hugo Jara Jr". La liga
-- las sube el martes o miércoles después del partido. La app no copia las
-- fotos: la base revisa el Drive, guarda la lista de fotos de cada carpeta del
-- club y las muestra en su partido.
--
-- Cómo se mantiene al día (igual que "Actualizar la liga"):
--   - fotos_revisar() la llama la app al abrir un partido o "Fotos de los
--     partidos". Si pasaron 6 horas desde la última vuelta, recorre el Drive de
--     a pocas carpetas por llamada (la app la repite mientras queden
--     pendientes). El botón "Buscar fotos nuevas" la fuerza: el capitán cuando
--     quiera, el resto con 5 minutos entre vueltas.
--   - Una carpeta se enlaza sola cuando es seguro: su categoría (Jr o Sr) y el
--     día de las fotos (±1) calzan con un solo partido jugado del club. Las
--     demás quedan para que el capitán confirme.
--
-- La llave de Google (Drive API) vive en fotos_drive y nunca sale de la base:
-- la carga el administrador por SQL. Sin llave, el capitán igual puede pegar el
-- link de la carpeta en el partido (se lee la lista de fotos cuando haya llave).
--
-- Cambios:
--   - fotos_drive: llave, carpeta raíz y última vuelta, una fila por club.
--   - fotos_cola: carpetas por recorrer en la vuelta actual.
--   - fotos_carpetas: carpetas de partidos del club que se encontraron.
--   - fotos_archivos: las fotos de cada carpeta (id del Drive, nombre, hora).
--   - partido_fotos: qué carpeta es de cada partido (sola o confirmada).
--   - fotos_revisar, fotos_enlaces, fotos_carpetas_ver, fotos_de_partido,
--     fotos_enlazar, fotos_desenlazar.
--
-- Revisión: tablas y permisos nuevos, sale a internet (googleapis.com) con la
-- extensión http. No toca plata. Los nombres de las carpetas son de equipos de
-- la liga (públicos). La revisa el administrador de la app.

-- ---------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------

create table public.fotos_drive (
  club_id      uuid primary key references public.clubes(id) on delete cascade,
  llave        text check (llave is null or llave ~ '^[A-Za-z0-9_-]{20,100}$'),
  raiz         text not null default '1J_7BA3viY3khWTOBo16Isn8_Zi8r9Kbs' check (raiz ~ '^[A-Za-z0-9_-]{10,100}$'),
  revisada_en  timestamptz,
  error        text
);

create table public.fotos_cola (
  carpeta_id  text not null,
  club_id     uuid not null references public.clubes(id) on delete cascade,
  ruta        text[] not null default '{}',
  nivel       int not null default 0,
  primary key (club_id, carpeta_id)
);

create table public.fotos_carpetas (
  carpeta_id  text primary key check (carpeta_id ~ '^[A-Za-z0-9_-]{10,100}$'),
  club_id     uuid not null references public.clubes(id) on delete cascade,
  nombre      text not null check (length(nombre) <= 200),
  ruta        text[] not null default '{}',
  rival       text,
  categoria   text check (categoria in ('jr', 'sr')),
  creada      timestamptz,
  dia         date,
  fotos       int,
  leida_en    timestamptz,
  -- El capitán la quitó de un partido: no se vuelve a enlazar sola.
  sin_auto    boolean not null default false,
  encontrada_en timestamptz not null default now()
);
create index fotos_carpetas_club_idx on public.fotos_carpetas (club_id);

create table public.fotos_archivos (
  archivo_id  text primary key check (archivo_id ~ '^[A-Za-z0-9_-]{10,100}$'),
  carpeta_id  text not null references public.fotos_carpetas(carpeta_id) on delete cascade,
  nombre      text,
  tomada      timestamp,
  ancho       int,
  alto        int
);
create index fotos_archivos_carpeta_idx on public.fotos_archivos (carpeta_id);

create table public.partido_fotos (
  partido_id    uuid primary key references public.partidos(id) on delete cascade,
  carpeta_id    text not null unique references public.fotos_carpetas(carpeta_id) on delete cascade,
  automatico    boolean not null default false,
  enlazado_por  uuid references public.personas(id) on delete set null,
  enlazado_en   timestamptz not null default now()
);

alter table public.fotos_drive    enable row level security;
alter table public.fotos_cola     enable row level security;
alter table public.fotos_carpetas enable row level security;
alter table public.fotos_archivos enable row level security;
alter table public.partido_fotos  enable row level security;
revoke all on public.fotos_drive, public.fotos_cola, public.fotos_carpetas, public.fotos_archivos, public.partido_fotos
  from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Leer el Drive
-- ---------------------------------------------------------------------------

-- Minúsculas y sin tildes: "Acharán Jr." → "acharan jr."
create or replace function public.fotos_normalizar(p text)
returns text language sql immutable as $$
  select regexp_replace(translate(lower(coalesce(p, '')), 'áéíóúüñ', 'aeiouun'), '\s+', ' ', 'g');
$$;

-- "COBS vs Hugo Jara Jr" → rival COBS, categoría jr. Null si no es del club.
create or replace function public.fotos_leer_nombre(p_nombre text, p_ruta text[], out es_del_club boolean, out rival text, out categoria text)
language plpgsql immutable as $$
declare
  lados text[] := regexp_split_to_array(trim(p_nombre), '\s+vs\.?\s+', 'i');
  n text[];
  nuestro int;
  r text;
begin
  es_del_club := false;
  if cardinality(lados) <> 2 then return; end if;
  n := array[public.fotos_normalizar(lados[1]), public.fotos_normalizar(lados[2])];
  nuestro := case when n[1] like '%hugo jara%' then 1 when n[2] like '%hugo jara%' then 2 end;
  if nuestro is null then return; end if;
  es_del_club := true;
  rival := trim(regexp_replace(trim(lados[3 - nuestro]), '\s+(jr|sr|junior|senior)\.?$', '', 'i'));
  categoria := case
    when n[nuestro] ~ '\s(jr|junior)\.?$' then 'jr'
    when n[nuestro] ~ '\s(sr|senior)\.?$' then 'sr'
    when n[3 - nuestro] ~ '\s(jr|junior)\.?$' then 'jr'
    when n[3 - nuestro] ~ '\s(sr|senior)\.?$' then 'sr'
  end;
  if categoria is null then
    r := public.fotos_normalizar(array_to_string(p_ruta, ' '));
    categoria := case when r like '%junior%' and r not like '%senior%' then 'jr'
                      when r like '%senior%' and r not like '%junior%' then 'sr' end;
  end if;
end;
$$;

-- Lista lo que hay dentro de una carpeta del Drive (carpetas o imágenes).
-- Devuelve null si el Drive no respondió bien (y deja el error anotado).
create or replace function public.fotos_drive_listar(p_club uuid, p_llave text, p_padre text, p_tipo text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_q text := format('''%s'' in parents and trashed = false', p_padre)
           || case when p_tipo = 'carpetas' then ' and mimeType = ''application/vnd.google-apps.folder'''
                   else ' and mimeType contains ''image/''' end;
  v_campos text := case when p_tipo = 'carpetas' then 'files(id,name,createdTime)'
                        else 'files(id,name,imageMediaMetadata(time,width,height))' end;
  v_status int;
  v_cuerpo text;
begin
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '4000');
  select status, content into v_status, v_cuerpo
    from extensions.http_get('https://www.googleapis.com/drive/v3/files?pageSize=1000&orderBy=name'
      || '&supportsAllDrives=true&includeItemsFromAllDrives=true'
      || '&q=' || extensions.urlencode(v_q)
      || '&fields=' || extensions.urlencode(v_campos)
      || '&key=' || p_llave);
  if v_status is distinct from 200 then
    update public.fotos_drive set error = case
        when v_status in (400, 403) then 'El Drive rechazó la llave de Google: revisa que tenga la Drive API activada.'
        when v_status = 404 then 'Una carpeta del Drive ya no existe o dejó de estar compartida.'
        else format('El Drive no respondió (%s). Se reintenta más rato.', coalesce(v_status::text, 'sin respuesta')) end
     where club_id = p_club;
    return null;
  end if;
  update public.fotos_drive set error = null where club_id = p_club and error is not null;
  return coalesce(v_cuerpo::jsonb -> 'files', '[]'::jsonb);
exception when others then
  update public.fotos_drive set error = 'El Drive respondió algo que no se pudo leer.' where club_id = p_club;
  return null;
end;
$$;

-- Una vuelta corta por el Drive: hasta 5 pedidos. Devuelve cuántas carpetas
-- quedan pendientes (la app vuelve a llamar mientras sea más que cero), cuántos
-- partidos se enlazaron solos y si hay error o falta la llave.
create or replace function public.fotos_revisar(p_forzar boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_club uuid := public.mi_club_id();
  cfg public.fotos_drive;
  v_presupuesto int := 5;
  v_nueva_vuelta boolean;
  c record;
  h jsonb;
  v_lista jsonb;
  v_leido record;
  v_enlazadas int := 0;
  v_hoy date := (now() at time zone 'America/Santiago')::date;
begin
  if public.mi_persona_id() is null then
    raise exception 'Tu cuenta no está en la nómina del club';
  end if;
  select * into cfg from public.fotos_drive where club_id = v_club;
  if cfg.llave is null then
    return jsonb_build_object('sin_llave', true, 'pendientes', 0, 'enlazadas', 0);
  end if;

  -- ¿Toca empezar una vuelta nueva?
  v_nueva_vuelta := not exists (select 1 from public.fotos_cola where club_id = v_club)
    and (cfg.revisada_en is null
         or cfg.revisada_en < now() - interval '6 hours'
         or (p_forzar and (public.soy_encargado_de_alguno() or cfg.revisada_en < now() - interval '5 minutes')));
  if v_nueva_vuelta then
    insert into public.fotos_cola (carpeta_id, club_id) values (cfg.raiz, v_club) on conflict do nothing;
    -- Carpetas que estaban vacías o sin fecha: se vuelven a leer (la liga sube de a poco).
    update public.fotos_carpetas set leida_en = null
     where club_id = v_club and (coalesce(fotos, 0) = 0 or dia is null or leida_en < now() - interval '10 days');
    update public.fotos_drive set revisada_en = now(), error = null where club_id = v_club;
  end if;

  -- 1. Recorrer carpetas.
  while v_presupuesto > 0 loop
    delete from public.fotos_cola
     where (club_id, carpeta_id) = (select club_id, carpeta_id from public.fotos_cola
                                     where club_id = v_club order by nivel, carpeta_id limit 1 for update skip locked)
    returning * into c;
    exit when c is null;
    v_presupuesto := v_presupuesto - 1;
    v_lista := public.fotos_drive_listar(v_club, cfg.llave, c.carpeta_id, 'carpetas');
    if v_lista is null then
      insert into public.fotos_cola values (c.carpeta_id, c.club_id, c.ruta, c.nivel) on conflict do nothing;
      exit;
    end if;
    for h in select * from jsonb_array_elements(v_lista) loop
      continue when coalesce(h->>'id', '') !~ '^[A-Za-z0-9_-]{10,100}$';
      if (h->>'name') ~* '\svs\.?\s' then
        select * into v_leido from public.fotos_leer_nombre(h->>'name', c.ruta);
        if v_leido.es_del_club then
          insert into public.fotos_carpetas (carpeta_id, club_id, nombre, ruta, rival, categoria, creada)
          values (h->>'id', v_club, left(trim(h->>'name'), 200), c.ruta, v_leido.rival, v_leido.categoria,
                  (h->>'createdTime')::timestamptz)
          on conflict (carpeta_id) do update
            set nombre = excluded.nombre, ruta = excluded.ruta, rival = excluded.rival, categoria = excluded.categoria;
        end if;
      elsif c.nivel < 4 then
        insert into public.fotos_cola values (h->>'id', v_club, c.ruta || left(trim(h->>'name'), 80), c.nivel + 1)
        on conflict do nothing;
      end if;
    end loop;
  end loop;

  -- 2. Leer las fotos de las carpetas nuevas o pendientes.
  while v_presupuesto > 0 loop
    select * into c from public.fotos_carpetas
     where club_id = v_club and leida_en is null order by encontrada_en limit 1 for update skip locked;
    exit when c is null;
    v_presupuesto := v_presupuesto - 1;
    v_lista := public.fotos_drive_listar(v_club, cfg.llave, c.carpeta_id, 'imagenes');
    exit when v_lista is null;
    delete from public.fotos_archivos where carpeta_id = c.carpeta_id;
    insert into public.fotos_archivos (archivo_id, carpeta_id, nombre, tomada, ancho, alto)
    select f->>'id', c.carpeta_id, left(f->>'name', 200),
           case when f->'imageMediaMetadata'->>'time' ~ '^\d{4}:\d{2}:\d{2} \d{2}:\d{2}:\d{2}'
                then to_timestamp(left(f->'imageMediaMetadata'->>'time', 19), 'YYYY:MM:DD HH24:MI:SS')::timestamp end,
           nullif(f->'imageMediaMetadata'->>'width', '')::int, nullif(f->'imageMediaMetadata'->>'height', '')::int
      from jsonb_array_elements(v_lista) f
     where coalesce(f->>'id', '') ~ '^[A-Za-z0-9_-]{10,100}$'
    on conflict (archivo_id) do nothing;
    update public.fotos_carpetas k set leida_en = now(),
           fotos = (select count(*) from public.fotos_archivos a where a.carpeta_id = k.carpeta_id),
           dia = (select a.tomada::date from public.fotos_archivos a
                   where a.carpeta_id = k.carpeta_id and a.tomada is not null
                   group by 1 order by count(*) desc, 1 desc limit 1)
     where k.carpeta_id = c.carpeta_id;
  end loop;

  -- 3. Enlazar solas las seguras: un solo partido jugado de esa categoría
  --    a ±1 día de las fotos, y esa carpeta es la única para ese partido.
  with candidatos as (
    select k.carpeta_id, p.id as partido_id,
           count(*) over (partition by k.carpeta_id) as por_carpeta,
           count(*) over (partition by p.id) as por_partido
      from public.fotos_carpetas k
      join public.partidos p on p.club_id = k.club_id and p.fecha between k.dia - 1 and k.dia + 1 and p.fecha <= v_hoy
      join public.equipos e on e.id = p.equipo_id
     where k.club_id = v_club and k.dia is not null and k.categoria is not null and coalesce(k.fotos, 0) > 0
       and not k.sin_auto
       and public.fotos_normalizar(e.nombre) like case k.categoria when 'jr' then '%junior%' else '%senior%' end
       and not exists (select 1 from public.partido_fotos f where f.carpeta_id = k.carpeta_id)
       and not exists (select 1 from public.partido_fotos f where f.partido_id = p.id)
  )
  insert into public.partido_fotos (partido_id, carpeta_id, automatico)
  select partido_id, carpeta_id, true from candidatos where por_carpeta = 1 and por_partido = 1
  on conflict do nothing;
  get diagnostics v_enlazadas = row_count;

  select * into cfg from public.fotos_drive where club_id = v_club;
  return jsonb_build_object(
    'pendientes', (select count(*) from public.fotos_cola where club_id = v_club)
                + (select count(*) from public.fotos_carpetas where club_id = v_club and leida_en is null),
    'enlazadas', v_enlazadas,
    'error', cfg.error,
    'revisada_en', cfg.revisada_en);
end;
$$;

-- ---------------------------------------------------------------------------
-- Lo que ve la app
-- ---------------------------------------------------------------------------

-- Los enlaces de los partidos del club (todo el club).
create or replace function public.fotos_enlaces()
returns table (partido_id uuid, carpeta_id text, carpeta_nombre text, fotos int, automatico boolean, puedo_cambiar boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if public.mi_persona_id() is null then
    raise exception 'Tu cuenta no está en la nómina del club';
  end if;
  return query
    select f.partido_id, f.carpeta_id, k.nombre, k.fotos, f.automatico, public.soy_encargado(p.equipo_id)
      from public.partido_fotos f
      join public.partidos p on p.id = f.partido_id
      join public.fotos_carpetas k on k.carpeta_id = f.carpeta_id
     where p.club_id = public.mi_club_id();
end;
$$;

-- Las carpetas encontradas, con su partido si lo tienen (capitanes y admin).
create or replace function public.fotos_carpetas_ver()
returns table (carpeta_id text, nombre text, ruta text[], rival text, categoria text, dia date,
               creada timestamptz, fotos int, partido_id uuid, automatico boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.soy_encargado_de_alguno() then
    raise exception 'Solo los capitanes y los administradores ven las carpetas del Drive';
  end if;
  return query
    select k.carpeta_id, k.nombre, k.ruta, k.rival, k.categoria, k.dia, k.creada, k.fotos, f.partido_id, f.automatico
      from public.fotos_carpetas k
      left join public.partido_fotos f on f.carpeta_id = k.carpeta_id
     where k.club_id = public.mi_club_id()
     order by k.dia desc nulls last, k.nombre;
end;
$$;

-- Las fotos de un partido, en orden de cuando se tomaron (todo el club).
create or replace function public.fotos_de_partido(p_partido uuid)
returns table (archivo_id text, nombre text, tomada timestamp, ancho int, alto int)
language plpgsql stable security definer set search_path = public as $$
begin
  if public.mi_persona_id() is null then
    raise exception 'Tu cuenta no está en la nómina del club';
  end if;
  return query
    select a.archivo_id, a.nombre, a.tomada, a.ancho, a.alto
      from public.partido_fotos f
      join public.partidos p on p.id = f.partido_id and p.club_id = public.mi_club_id()
      join public.fotos_archivos a on a.carpeta_id = f.carpeta_id
     where f.partido_id = p_partido
     order by a.tomada nulls last, a.nombre;
end;
$$;

-- ---------------------------------------------------------------------------
-- Enlazar a mano (capitán del plantel o administrador)
-- ---------------------------------------------------------------------------

create or replace function public.fotos_exigir(p_partido uuid)
returns void language plpgsql stable security definer set search_path = public as $$
declare
  v_equipo uuid;
begin
  select equipo_id into v_equipo from public.partidos
   where id = p_partido and club_id = public.mi_club_id();
  if v_equipo is null then
    raise exception 'No encontramos ese partido';
  end if;
  if not public.soy_encargado(v_equipo) then
    raise exception 'Solo el capitán del plantel o un administrador enlaza las fotos';
  end if;
end;
$$;

-- Enlaza (o cambia) la carpeta de un partido. Si la carpeta no se había
-- encontrado (link pegado a mano), queda anotada y sus fotos se leen en la
-- próxima vuelta.
create or replace function public.fotos_enlazar(p_partido uuid, p_carpeta text, p_nombre text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_carpeta text := trim(coalesce(p_carpeta, ''));
begin
  perform public.fotos_exigir(p_partido);
  if v_carpeta !~ '^[A-Za-z0-9_-]{10,100}$' then
    raise exception 'Ese link no parece una carpeta del Drive';
  end if;
  if exists (select 1 from public.partido_fotos where carpeta_id = v_carpeta and partido_id <> p_partido) then
    raise exception 'Esa carpeta ya está enlazada a otro partido';
  end if;
  insert into public.fotos_carpetas (carpeta_id, club_id, nombre)
  values (v_carpeta, public.mi_club_id(), coalesce(nullif(left(trim(coalesce(p_nombre, '')), 200), ''), 'Carpeta del Drive'))
  on conflict (carpeta_id) do nothing;
  if not exists (select 1 from public.fotos_carpetas where carpeta_id = v_carpeta and club_id = public.mi_club_id()) then
    raise exception 'Esa carpeta es de otro club';
  end if;
  insert into public.partido_fotos (partido_id, carpeta_id, automatico, enlazado_por)
  values (p_partido, v_carpeta, false, public.mi_persona_id())
  on conflict (partido_id) do update
    set carpeta_id = excluded.carpeta_id, automatico = false,
        enlazado_por = excluded.enlazado_por, enlazado_en = now();
end;
$$;

-- Quita la carpeta de un partido (las fotos siguen en el Drive). Para que no
-- se vuelva a enlazar sola, queda marcada sin_auto.
create or replace function public.fotos_desenlazar(p_partido uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_carpeta text;
begin
  perform public.fotos_exigir(p_partido);
  delete from public.partido_fotos where partido_id = p_partido returning carpeta_id into v_carpeta;
  update public.fotos_carpetas set sin_auto = true where carpeta_id = v_carpeta;
end;
$$;

-- ---------------------------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------------------------

revoke execute on function public.fotos_normalizar(text) from public, anon;
revoke execute on function public.fotos_leer_nombre(text, text[]) from public, anon, authenticated;
revoke execute on function public.fotos_drive_listar(uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.fotos_exigir(uuid) from public, anon, authenticated;
revoke execute on function public.fotos_revisar(boolean) from public, anon;
revoke execute on function public.fotos_enlaces() from public, anon;
revoke execute on function public.fotos_carpetas_ver() from public, anon;
revoke execute on function public.fotos_de_partido(uuid) from public, anon;
revoke execute on function public.fotos_enlazar(uuid, text, text) from public, anon;
revoke execute on function public.fotos_desenlazar(uuid) from public, anon;
grant execute on function public.fotos_normalizar(text) to authenticated;
grant execute on function public.fotos_revisar(boolean) to authenticated;
grant execute on function public.fotos_enlaces() to authenticated;
grant execute on function public.fotos_carpetas_ver() to authenticated;
grant execute on function public.fotos_de_partido(uuid) to authenticated;
grant execute on function public.fotos_enlazar(uuid, text, text) to authenticated;
grant execute on function public.fotos_desenlazar(uuid) to authenticated;
