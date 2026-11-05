-- Jara App · 0034 · La votación del jugador del partido dura la semana
--
-- Pedido del administrador (5/11): dos días era poco. Ahora la votación cierra
-- a las 23:59 del sexto día después del partido, hora de Chile: el día antes
-- del partido de la semana siguiente (sábado → viernes; jueves → miércoles).
-- Solo cambia mvp_cierre; mvp_abierta, partido_charla y mvp_votar la usan tal
-- cual. Los partidos que ya cerraron con la regla anterior y tienen menos de
-- seis días se vuelven a abrir. Revisión: la revisa el administrador de la app
-- antes de correrla.

create or replace function public.mvp_cierre(p public.partidos)
returns timestamptz language sql stable set search_path = public as $$
  select ((p.fecha + 7)::timestamp at time zone 'America/Santiago') - interval '1 second';
$$;

revoke execute on function public.mvp_cierre(public.partidos) from public, anon, authenticated;
