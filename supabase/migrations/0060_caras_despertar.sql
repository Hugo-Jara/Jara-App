-- Jara App · 0060 · La búsqueda de caras parte sola, sin depender del reloj de GitHub
--
-- La tarea "Buscar caras" (.github/workflows/caras.yml) está programada en
-- GitHub cada 30 minutos, pero GitHub se salta muchas de esas corridas (hubo
-- días con 2 al día). Ahora la base la despierta: cada 10 minutos (pg_cron,
-- se programa aparte con conectar-despertar-caras.sql) revisa si hay algo que
-- hacer (alguien activó la búsqueda, subió selfie, cambió su foto, o hay fotos
-- nuevas) y, solo si hay, le pide a GitHub que la corra.
--   - caras_github: la llave de GitHub (solo puede correr tareas de este repo).
--     Cerrada a la app; se carga por SQL.
--   - caras_hay_trabajo(): lo mismo que scripts/caras/hay_trabajo.py.
--   - caras_despertar(p_forzar): si hay trabajo, pide la corrida (máximo una
--     cada 20 minutos, para no apilar mientras una corre). Con p_forzar la pide
--     igual (para probar la llave). Devuelve qué hizo.
--
-- Revisión: no toca datos de personas ni plata. La revisa el administrador.

create table public.caras_github (
  id            boolean primary key default true check (id),
  token         text,
  ultimo_aviso  timestamptz,
  ultimo_estado int
);
alter table public.caras_github enable row level security;
revoke all on public.caras_github from anon, authenticated;
insert into public.caras_github (id) values (true) on conflict do nothing;

create or replace function public.caras_hay_trabajo()
returns boolean language sql stable security definer set search_path = public as $$
  with t as (select public.caras_trabajo() as j),
  p as (select x from t, jsonb_array_elements(t.j->'personas') x),
  a as (select x from t, jsonb_array_elements(t.j->'archivos') x)
  select exists (select 1 from p
                  where (x->>'sacar_huella')::boolean
                     or (x->>'estado' = 'lista' and not (x->>'completa')::boolean)
                     or ((x->>'sin_foto')::boolean and x->>'estado' is distinct from 'sin_foto'))
      or exists (select 1 from a
                  where not (a.x->>'revisada')::boolean
                    and a.x->>'club_id' in (select p.x->>'club_id' from p where p.x->>'estado' = 'lista'));
$$;

create or replace function public.caras_despertar(p_forzar boolean default false)
returns text language plpgsql security definer set search_path = public as $$
declare
  g public.caras_github;
  v_status int;
begin
  select * into g from public.caras_github where id for update;
  if g.token is null then return 'sin llave de GitHub'; end if;
  if not p_forzar then
    if not public.caras_hay_trabajo() then return 'nada que hacer'; end if;
    if g.ultimo_aviso > now() - interval '20 minutes' then return 'ya se pidió hace poco'; end if;
  end if;
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '8000');
  select status into v_status
    from extensions.http(('POST',
      'https://api.github.com/repos/Hugo-Jara/Jara-App/actions/workflows/caras.yml/dispatches',
      array[extensions.http_header('Authorization', 'Bearer ' || g.token),
            extensions.http_header('Accept', 'application/vnd.github+json'),
            extensions.http_header('User-Agent', 'jara-app')],
      'application/json', '{"ref":"main"}')::extensions.http_request);
  update public.caras_github set ultimo_aviso = now(), ultimo_estado = v_status where id;
  return case when v_status = 204 then 'pedida' else 'GitHub respondió ' || v_status end;
end;
$$;

revoke all on function public.caras_hay_trabajo(), public.caras_despertar(boolean) from public, anon, authenticated;
