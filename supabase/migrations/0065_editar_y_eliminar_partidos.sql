-- Jara App · 0065 · Corregir y eliminar cualquier partido del plantel
--
-- En 0063 el cuerpo técnico y Comunicaciones podían crear partidos, pero solo
-- corregían o eliminaban los que habían creado ellos. Ahora quien puede crear
-- partidos en un plantel también corrige y elimina cualquiera de ese plantel
-- (los de la liga, los del capitán y los de otros):
--   - el capitán (encargado), en su plantel;
--   - el cuerpo técnico (personas.cuerpo_tecnico), en sus planteles;
--   - Comunicaciones (personas.edita_comunicaciones), en todos.
-- Las cuentas de prueba siguen sin poder (el club es real).
--
-- Solo cambian puedo_cambiar_partido y partidos_programables (la lista de
-- partidos que la app deja editar). partido_guardar y partido_eliminar ya
-- usan puedo_cambiar_partido, así que no se tocan. La app no cambia.
--
-- Revisión: cambia permisos (quién corrige y elimina partidos). No toca plata.
-- La revisa el administrador de la app.

create or replace function public.puedo_cambiar_partido(p_partido uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.partidos p
     where p.id = p_partido and p.club_id = public.mi_club_id()
       and public.puedo_programar(p.equipo_id));
$$;

create or replace function public.partidos_programables()
returns jsonb language sql stable security definer set search_path = public as $$
  with mios as (
    select e.id, e.nombre, e.orden from public.equipos e
     where e.club_id = public.mi_club_id() and public.puedo_programar(e.id))
  select jsonb_build_object(
    'equipos', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'nombre', m.nombre) order by m.orden, m.nombre) from mios m), '[]'::jsonb),
    'partidos', coalesce((
      select jsonb_agg(p.id) from public.partidos p
       where p.club_id = public.mi_club_id() and p.equipo_id in (select id from mios)), '[]'::jsonb));
$$;

revoke execute on function public.puedo_cambiar_partido(uuid) from public, anon, authenticated;
revoke execute on function public.partidos_programables() from public, anon;
grant execute on function public.partidos_programables() to authenticated;
