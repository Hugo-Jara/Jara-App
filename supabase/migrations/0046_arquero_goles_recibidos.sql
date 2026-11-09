-- Jara App · 0046 · Goles recibidos del arquero, para su perfil
--
-- En el perfil de un jugador con posición "Arquero" se muestran los goles que
-- recibió su equipo en los partidos que jugó, el promedio por partido y las
-- vallas invictas. La app no anota quién estuvo al arco en cada partido, así
-- que cuenta todos los partidos en que el arquero aparece como que jugó.
--
-- Solo agrega una función de lectura. No toca plata, permisos ni datos.

create or replace function public.arquero_cifras(p_persona uuid, p_anio int default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if public.mi_persona_id() is null then raise exception 'Tu cuenta no está en la nómina del club'; end if;
  return (
    select jsonb_build_object(
             'pj', count(*)::int,
             'recibidos', coalesce(sum(p.goles_contra), 0)::int,
             'invictas', count(*) filter (where p.goles_contra = 0)::int)
      from public.partidos p
     where p.club_id = public.mi_club_id()
       and p.goles_favor is not null and p.goles_contra is not null
       and (p_anio is null or extract(year from p.fecha) = p_anio)
       and (exists (select 1 from public.partido_jugadores j where j.partido_id = p.id and j.persona_id = p_persona)
            or exists (select 1 from public.partido_estadisticas g where g.partido_id = p.id and g.persona_id = p_persona)));
end;
$$;

revoke execute on function public.arquero_cifras(uuid, int) from public, anon;
grant execute on function public.arquero_cifras(uuid, int) to authenticated;
