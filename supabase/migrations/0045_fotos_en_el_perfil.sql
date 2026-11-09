-- Jara App · 0045 · Las fotos encontradas, también en el perfil del jugador
--
-- Hasta ahora (0042) cada uno veía solo sus fotos encontradas. Ahora cada
-- persona elige si se ven en su perfil para el resto del club:
--   - caras_personas.muestra: false por defecto. Quien ya lo había activado
--     (con el aviso "solo tú ves tus fotos") sigue privado hasta que lo cambie.
--   - caras_mostrar(p_muestra): la persona lo prende o lo apaga.
--   - caras_fotos_de(p_persona): las fotos de un jugador del club, solo si él
--     eligió mostrarlas (o si es uno mismo). Nunca las escondidas con "No soy yo".
--   - caras_mi_estado ahora dice también 'muestra'.
--
-- Revisión: cambia quién ve qué (siempre con el permiso de la persona). No toca
-- plata. La revisa el administrador de la app.

alter table public.caras_personas add column muestra boolean not null default false;

create or replace function public.caras_mostrar(p_muestra boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.mi_persona_id() is null then raise exception 'Tu cuenta no está en la nómina del club'; end if;
  update public.caras_personas set muestra = coalesce(p_muestra, false)
   where persona_id = public.mi_persona_id();
  if not found then raise exception 'Primero activa "Buscarme en las fotos"'; end if;
end;
$$;

create or replace function public.caras_fotos_de(p_persona uuid)
returns table (archivo_id text, nombre text, tomada timestamp, ancho int, alto int, parecido real,
               carpeta_id text, carpeta_nombre text, dia date,
               partido_id uuid, partido_fecha date, partido_rival text, equipo text)
language plpgsql stable security definer set search_path = public as $$
begin
  if public.mi_persona_id() is null then raise exception 'Tu cuenta no está en la nómina del club'; end if;
  if not exists (select 1 from public.caras_personas c
                  where c.persona_id = p_persona and c.club_id = public.mi_club_id()
                    and (c.muestra or c.persona_id = public.mi_persona_id())) then
    return;
  end if;
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
     where h.persona_id = p_persona and not h.oculta
     order by coalesce(p.fecha, k.dia, a.tomada::date) desc nulls last, a.tomada, a.archivo_id;
end;
$$;

-- Igual que en 0042, más 'muestra'.
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
    'muestra', coalesce(c.muestra, false),
    'aceptada_en', c.aceptada_en,
    'revisada_en', c.revisada_en,
    'foto_cambio', c.persona_id is not null and c.foto_ruta is distinct from v_foto,
    'encontradas', (select count(*) from public.caras_hallazgos h
                     where h.persona_id = c.persona_id and not h.oculta
                       and exists (select 1 from public.fotos_archivos a where a.archivo_id = h.archivo_id)));
end;
$$;

revoke all on function public.caras_mostrar(boolean), public.caras_fotos_de(uuid) from public, anon;
grant execute on function public.caras_mostrar(boolean), public.caras_fotos_de(uuid) to authenticated;
