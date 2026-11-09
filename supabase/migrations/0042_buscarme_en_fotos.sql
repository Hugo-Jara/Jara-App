-- Jara App · 0042 · Buscarme en las fotos (reconocimiento facial con permiso)
--
-- Quien quiere, activa "Buscarme en las fotos" en su perfil. Una tarea de
-- GitHub (.github/workflows/caras.yml, cada 3 horas) toma su foto de perfil,
-- la convierte en una huella de la cara (512 números, motor ArcFace, código
-- abierto y gratis) y la compara con las caras de las fotos de la liga (0041).
-- Solo se guarda "esta foto tiene a esta persona".
--
-- Cuidados (son datos biométricos):
--   - Solo entra quien lo activa, con su propia cuenta, y declara ser mayor de
--     18. Si su fecha de nacimiento dice otra cosa, la base no lo deja.
--   - De las demás caras de las fotos no se guarda nada.
--   - Apagarlo borra al tiro la huella y todo lo encontrado.
--   - "No soy yo" esconde una foto para siempre.
--   - Si cambia su foto de perfil, la huella se vuelve a sacar.
--   - Cada uno ve solo sus fotos encontradas.
--
-- Tablas (cerradas al navegador):
--   - caras_personas: quién lo activó, su huella y en qué va.
--   - caras_hallazgos: foto (id del Drive) ↔ persona, con el parecido.
--   - caras_archivos: qué fotos ya revisó la tarea.
-- Sin llave foránea a fotos_archivos a propósito: 0041 borra y vuelve a anotar
-- las fotos de una carpeta cada vez que la relee, y no queremos perder lo
-- encontrado ni los "No soy yo". Al leer se cruza con las fotos que existen.
--
-- Funciones para la app: caras_mi_estado, caras_activar, caras_apagar,
-- caras_mis_fotos, caras_no_soy_yo.
-- Funciones para la tarea (solo service_role, nunca el navegador):
-- caras_trabajo, caras_guardar_huella, caras_guardar, caras_terminar.
--
-- Revisión: datos biométricos y permisos nuevos. No toca plata. La revisa el
-- administrador de la app.

create table public.caras_personas (
  persona_id   uuid primary key references public.personas(id) on delete cascade,
  club_id      uuid not null references public.clubes(id) on delete cascade,
  aceptada_en  timestamptz not null default now(),
  foto_ruta    text,           -- la foto de perfil de la que salió la huella
  huella       real[] check (huella is null or cardinality(huella) = 512),
  estado       text not null default 'pendiente'
               check (estado in ('pendiente', 'lista', 'sin_cara', 'sin_foto')),
  revisada_en  timestamptz     -- null: falta revisar todas las fotos con su cara
);

create table public.caras_hallazgos (
  persona_id    uuid not null references public.caras_personas(persona_id) on delete cascade,
  archivo_id    text not null check (archivo_id ~ '^[A-Za-z0-9_-]{10,100}$'),
  parecido      real not null check (parecido between -1 and 1),
  oculta        boolean not null default false,
  encontrada_en timestamptz not null default now(),
  primary key (persona_id, archivo_id)
);
create index caras_hallazgos_archivo_idx on public.caras_hallazgos (archivo_id);

create table public.caras_archivos (
  archivo_id  text primary key check (archivo_id ~ '^[A-Za-z0-9_-]{10,100}$'),
  caras       smallint,
  revisada_en timestamptz not null default now()
);

alter table public.caras_personas  enable row level security;
alter table public.caras_hallazgos enable row level security;
alter table public.caras_archivos  enable row level security;
revoke all on public.caras_personas, public.caras_hallazgos, public.caras_archivos from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Para la app
-- ---------------------------------------------------------------------------

-- En qué va lo mío.
create or replace function public.caras_mi_estado()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  c public.caras_personas;
  v_foto text;
begin
  if public.mi_persona_id() is null then raise exception 'Tu cuenta no está en la nómina del club'; end if;
  select foto_ruta into v_foto from public.perfiles where persona_id = public.mi_persona_id();
  select * into c from public.caras_personas where persona_id = public.mi_persona_id();
  return jsonb_build_object(
    'activa', c.persona_id is not null,
    'tiene_foto', v_foto is not null,
    'estado', c.estado,
    'aceptada_en', c.aceptada_en,
    'revisada_en', c.revisada_en,
    'foto_cambio', c.persona_id is not null and c.foto_ruta is distinct from v_foto,
    'encontradas', (select count(*) from public.caras_hallazgos h
                     where h.persona_id = c.persona_id and not h.oculta
                       and exists (select 1 from public.fotos_archivos a where a.archivo_id = h.archivo_id)));
end;
$$;

-- Activar. p_mayor: la persona declara tener 18 o más.
create or replace function public.caras_activar(p_mayor boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_yo  uuid := public.mi_persona_id();
  v_nac date;
  v_foto text;
begin
  if v_yo is null then raise exception 'Tu cuenta no está en la nómina del club'; end if;
  if public.soy_cuenta_de_prueba() then raise exception 'La cuenta de prueba no puede activar esto'; end if;
  if not coalesce(p_mayor, false) then raise exception 'Buscarte en las fotos es solo para mayores de 18'; end if;
  select nacimiento, foto_ruta into v_nac, v_foto from public.perfiles where persona_id = v_yo;
  if v_nac is not null and v_nac > current_date - interval '18 years' then
    raise exception 'Buscarte en las fotos es solo para mayores de 18';
  end if;
  if v_foto is null then raise exception 'Primero sube una foto de perfil donde se te vea la cara'; end if;
  insert into public.caras_personas (persona_id, club_id)
  values (v_yo, public.mi_club_id())
  on conflict (persona_id) do nothing;
end;
$$;

-- Apagar: borra la huella y todo lo encontrado.
create or replace function public.caras_apagar()
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.mi_persona_id() is null then raise exception 'Tu cuenta no está en la nómina del club'; end if;
  delete from public.caras_personas where persona_id = public.mi_persona_id();
end;
$$;

-- Mis fotos encontradas, con su partido si la carpeta tiene uno.
create or replace function public.caras_mis_fotos()
returns table (archivo_id text, nombre text, tomada timestamp, ancho int, alto int, parecido real,
               carpeta_id text, carpeta_nombre text, dia date,
               partido_id uuid, partido_fecha date, partido_rival text, equipo text)
language plpgsql stable security definer set search_path = public as $$
begin
  if public.mi_persona_id() is null then raise exception 'Tu cuenta no está en la nómina del club'; end if;
  return query
    select a.archivo_id, a.nombre, a.tomada, a.ancho, a.alto, h.parecido,
           k.carpeta_id, k.nombre, k.dia,
           p.id, p.fecha, p.rival, e.nombre
      from public.caras_hallazgos h
      join public.fotos_archivos a on a.archivo_id = h.archivo_id
      join public.fotos_carpetas k on k.carpeta_id = a.carpeta_id and k.club_id = public.mi_club_id()
      left join public.partido_fotos f on f.carpeta_id = k.carpeta_id
      left join public.partidos p on p.id = f.partido_id
      left join public.equipos e on e.id = p.equipo_id
     where h.persona_id = public.mi_persona_id() and not h.oculta
     order by coalesce(p.fecha, k.dia, a.tomada::date) desc nulls last, a.tomada, a.archivo_id;
end;
$$;

create or replace function public.caras_no_soy_yo(p_archivo text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.mi_persona_id() is null then raise exception 'Tu cuenta no está en la nómina del club'; end if;
  update public.caras_hallazgos set oculta = true
   where persona_id = public.mi_persona_id() and archivo_id = p_archivo;
end;
$$;

-- ---------------------------------------------------------------------------
-- Para la tarea de GitHub (service_role)
-- ---------------------------------------------------------------------------

-- Lo que hay que hacer: las personas (con su foto de perfil actual y si la
-- huella hay que sacarla de nuevo), las fotos de la liga con su club y si ya
-- se revisaron, y la llave del Drive de cada club.
create or replace function public.caras_trabajo()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'personas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'persona_id', c.persona_id, 'club_id', c.club_id,
               'foto_ruta', f.foto_ruta, 'huella', c.huella, 'estado', c.estado,
               'sacar_huella', f.foto_ruta is not null and (c.huella is null or c.foto_ruta is distinct from f.foto_ruta),
               'sin_foto', f.foto_ruta is null,
               'completa', c.revisada_en is not null and c.foto_ruta is not distinct from f.foto_ruta))
        from public.caras_personas c
        left join public.perfiles f on f.persona_id = c.persona_id), '[]'::jsonb),
    'archivos', coalesce((
      select jsonb_agg(jsonb_build_object('archivo_id', a.archivo_id, 'club_id', k.club_id,
                                          'revisada', exists (select 1 from public.caras_archivos r where r.archivo_id = a.archivo_id)))
        from public.fotos_archivos a
        join public.fotos_carpetas k on k.carpeta_id = a.carpeta_id), '[]'::jsonb),
    'llaves', coalesce((
      select jsonb_object_agg(club_id, llave) from public.fotos_drive where llave is not null), '{}'::jsonb));
$$;

-- La huella nueva de una persona (o que su foto no sirve). Una huella nueva
-- borra lo encontrado con la anterior, salvo los "No soy yo".
create or replace function public.caras_guardar_huella(p_persona uuid, p_foto_ruta text, p_huella real[], p_estado text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_estado not in ('lista', 'sin_cara', 'sin_foto') then raise exception 'Estado no válido'; end if;
  if p_estado = 'lista' and (p_huella is null or cardinality(p_huella) <> 512) then raise exception 'Huella no válida'; end if;
  update public.caras_personas
     set foto_ruta = p_foto_ruta,
         huella = case when p_estado = 'lista' then p_huella end,
         estado = p_estado,
         revisada_en = null
   where persona_id = p_persona;
  delete from public.caras_hallazgos where persona_id = p_persona and not oculta;
end;
$$;

-- Resultado de un lote de fotos:
--   [{archivo_id, caras, hallazgos: [{persona_id, parecido}]}]
create or replace function public.caras_guardar(p_lote jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare
  x jsonb;
  h jsonb;
  n int := 0;
begin
  for x in select * from jsonb_array_elements(coalesce(p_lote, '[]'::jsonb)) loop
    insert into public.caras_archivos (archivo_id, caras, revisada_en)
    values (x->>'archivo_id', (x->>'caras')::smallint, now())
    on conflict (archivo_id) do update set caras = excluded.caras, revisada_en = now();
    for h in select * from jsonb_array_elements(coalesce(x->'hallazgos', '[]'::jsonb)) loop
      insert into public.caras_hallazgos (persona_id, archivo_id, parecido)
      select c.persona_id, x->>'archivo_id', (h->>'parecido')::real
        from public.caras_personas c
       where c.persona_id = (h->>'persona_id')::uuid and c.estado = 'lista'
      on conflict (persona_id, archivo_id) do update set parecido = greatest(caras_hallazgos.parecido, excluded.parecido);
      n := n + 1;
    end loop;
  end loop;
  return n;
end;
$$;

-- Estas personas ya quedaron comparadas con todas las fotos.
create or replace function public.caras_terminar(p_personas uuid[])
returns void language sql security definer set search_path = public as $$
  update public.caras_personas set revisada_en = now()
   where persona_id = any(coalesce(p_personas, '{}')) and estado = 'lista';
$$;

revoke all on function public.caras_trabajo(), public.caras_guardar_huella(uuid, text, real[], text),
  public.caras_guardar(jsonb), public.caras_terminar(uuid[]) from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.caras_trabajo(), public.caras_guardar_huella(uuid, text, real[], text),
      public.caras_guardar(jsonb), public.caras_terminar(uuid[]) to service_role;
  end if;
end $$;

-- Las de la app, solo con sesión iniciada.
revoke all on function public.caras_mi_estado(), public.caras_activar(boolean), public.caras_apagar(),
  public.caras_mis_fotos(), public.caras_no_soy_yo(text) from public, anon;
grant execute on function public.caras_mi_estado(), public.caras_activar(boolean), public.caras_apagar(),
  public.caras_mis_fotos(), public.caras_no_soy_yo(text) to authenticated;
