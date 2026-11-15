-- 0058 · Socio que no juega: entrena con precio de socio
--
-- Un socio del club que no está en ningún plantel (por ejemplo, alguien que
-- solo va a los entrenamientos) entra a la app como cualquier socio: pide su
-- pase, Tesorería lo aprueba y queda en la nómina sin plantel.
--
-- Hasta ahora, al inscribirse a un entrenamiento pagaba precio de invitado,
-- porque el precio salía solo del plantel. Desde ahora:
--   - juega en un plantel senior        -> precio senior (igual que antes)
--   - juega solo en junior              -> precio junior (igual que antes)
--   - es socio del club, sin plantel    -> precio senior (antes: invitado)
--   - invitado que inscribe un socio    -> precio invitado (igual que antes;
--     esos no son personas de la nómina)
--
-- Solo cambia entrenamiento_precio. No cambia ningún permiso ni lo que ve
-- cada persona. Las inscripciones ya hechas guardan su monto y no cambian.
-- Se puede correr más de una vez.

create or replace function public.entrenamiento_precio(e public.entrenamientos, p_persona uuid)
returns integer language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from public.persona_equipos pe join public.equipos q on q.id = pe.equipo_id
                  where pe.persona_id = p_persona and q.categoria = 'senior') then e.precio_senior
    when exists (select 1 from public.persona_equipos pe join public.equipos q on q.id = pe.equipo_id
                  where pe.persona_id = p_persona and q.categoria = 'junior') then e.precio_junior
    -- Socio del club sin plantel.
    when exists (select 1 from public.personas p
                  where p.id = p_persona and p.club_id = e.club_id and p.estado <> 'inactivo') then e.precio_senior
    else e.precio_invitado end;
$$;

revoke execute on function public.entrenamiento_precio(public.entrenamientos, uuid) from public, anon, authenticated;
