-- 0055 · La liga no atocha la app cuando entra mucha gente a la vez.
--
-- Al abrir Inicio, la app le pide a la base revisar la liga de cada plantel
-- (liga_refrescar). La base solo va a buscar a la página de la liga si pasaron
-- 3 horas, pero si llegan 70 personas juntas cuando "ya toca", las 70 van a la
-- página al mismo tiempo, cada una ocupando una conexión de la base hasta 4 a
-- 8 segundos. Y si la página de la liga está caída, nadie deja anotado el
-- intento y cada apertura de Inicio vuelve a esperar.
--
-- Ahora:
--   1. Solo una persona a la vez revisa cada plantel; las demás siguen de
--      largo al tiro (ven lo que ya había) y la app recarga cuando termina.
--   2. Si la revisión automática falla, queda anotado y no se reintenta por
--      15 minutos. No se le muestra error a nadie (igual que antes, la app lo
--      ignoraba).
--   3. El botón "Actualizar desde la liga" (forzar) funciona igual que antes:
--      va siempre y avisa si la página no respondió.
--
-- Cómo: la función que lee la liga pasa a llamarse liga_refrescar_leer (sin
-- cambios por dentro, y ya nadie la puede llamar desde la app) y
-- liga_refrescar queda como la puerta de entrada con estas reglas.
-- OJO para migraciones futuras: los cambios a cómo se lee la liga van en
-- liga_refrescar_leer, no en liga_refrescar.
--
-- Se puede correr dos veces sin problema.

alter table public.liga_torneos add column if not exists fallo_en timestamptz;

do $$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'liga_refrescar_leer') then
    alter function public.liga_refrescar(uuid, boolean) rename to liga_refrescar_leer;
  end if;
end $$;

revoke execute on function public.liga_refrescar_leer(uuid, boolean) from public, anon, authenticated;

create or replace function public.liga_refrescar(p_equipo uuid, p_forzar boolean default false)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_faltan int;
begin
  if p_forzar then
    return public.liga_refrescar_leer(p_equipo, true);
  end if;

  -- Si otra persona ya está revisando este plantel, no se espera: se sigue.
  if not pg_try_advisory_xact_lock(hashtext('liga_refrescar'), hashtext(p_equipo::text)) then
    return 0;
  end if;
  -- Falló hace poco: no se insiste todavía.
  if exists (select 1 from public.liga_torneos
              where equipo_id = p_equipo and fallo_en > now() - interval '15 minutes') then
    return 0;
  end if;

  begin
    v_faltan := public.liga_refrescar_leer(p_equipo, false);
  exception when others then
    -- Plantel sin conectar u otro error de permisos: se avisa como siempre.
    if not exists (select 1 from public.liga_torneos
                    where equipo_id = p_equipo and club_id = public.mi_club_id()) then
      raise;
    end if;
    update public.liga_torneos set fallo_en = now() where equipo_id = p_equipo;
    return 0;
  end;
  return v_faltan;
end;
$$;

revoke execute on function public.liga_refrescar(uuid, boolean) from public, anon;
grant execute on function public.liga_refrescar(uuid, boolean) to authenticated;
