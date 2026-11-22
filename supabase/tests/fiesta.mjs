// Prueba las fotos y videos de la fiesta de los 20 años (0061) en un Postgres en
// memoria (PGlite), con todas las migraciones en orden.
//   npm run test:fiesta (también corre con npm run test:db)
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const mig = (f) => readFileSync(join(here, '..', 'migrations', f), 'utf8');
const db = new PGlite();
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ok   ', name); }
  else { fail++; console.log('  FALLA', name, extra); }
};

await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create function auth.jwt() returns jsonb language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
  grant usage on schema auth, public to anon, authenticated;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, metadata jsonb);
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql immutable as $$
    select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
  grant usage on schema storage to anon, authenticated;
  grant select, insert on storage.objects to anon, authenticated;
`);
// La extensión http de Supabase, de mentira: responde según la dirección
// (tabla extensions.paginas) y anota cada pedido.
await db.exec(`
  create schema extensions;
  create table extensions.paginas (patron text, status int, content text);
  create table extensions.pedidas (uri text);
  create type extensions.http_response as (status int, content_type varchar, content varchar);
  create function extensions.http_set_curlopt(curlopt varchar, value varchar) returns boolean language sql as $$ select true $$;
  create function extensions.urlencode(s varchar) returns varchar language sql as $$ select s $$;
  create function extensions.http_get(uri varchar) returns extensions.http_response language plpgsql as $$
  declare r extensions.http_response;
  begin
    insert into extensions.pedidas values (uri);
    select status, 'text/html', content into r from extensions.paginas where uri like patron limit 1;
    if r.status is null then r.status := 404; end if;
    return r;
  end $$;
`);
const CLUB = '10000000-0000-0000-0000-000000000001';
const migs = readdirSync(join(here, '..', 'migrations')).filter((f) => f.endsWith('.sql')).sort();
for (const f of migs) {
  await db.exec(mig(f));
  if (f.startsWith('0001_')) await db.exec(`insert into clubes (id, nombre, slug) values ('${CLUB}', 'Hugo Jara', 'hugo-jara')`);
}
console.log(`Migraciones 0001 a ${migs.at(-1).slice(0, 4)}, aplicadas en orden`);
await db.exec(`grant delete on storage.objects to authenticated`);

const U = { jugador: '00000000-0000-0000-0000-0000000000f1', otro: '00000000-0000-0000-0000-0000000000f2',
            admin: '00000000-0000-0000-0000-0000000000f3', baja: '00000000-0000-0000-0000-0000000000f4',
            extrano: '00000000-0000-0000-0000-0000000000f5' };
const PER = { jugador: '20000000-0000-0000-0000-0000000000f1', otro: '20000000-0000-0000-0000-0000000000f2',
              admin: '20000000-0000-0000-0000-0000000000f3', baja: '20000000-0000-0000-0000-0000000000f4' };
await db.exec(`
  insert into auth.users (id, email) values ${Object.entries(U).map(([k, id]) => `('${id}', '${k}@correo.cl')`).join(', ')};
  insert into personas (id, club_id, nombre, user_id, es_admin, estado) values
    ('${PER.jugador}', '${CLUB}', 'Jugador Inventado', '${U.jugador}', false, 'activo'),
    ('${PER.otro}', '${CLUB}', 'Otro Inventado', '${U.otro}', false, 'activo'),
    ('${PER.admin}', '${CLUB}', 'Admin Inventado', '${U.admin}', true, 'activo'),
    ('${PER.baja}', '${CLUB}', 'De Baja Inventado', '${U.baja}', false, 'inactivo');
`);

async function como(quien, sql, params = []) {
  await db.exec('set role authenticated');
  await db.query(`select set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claims', $2, false)`,
                 [U[quien], JSON.stringify({ email: `${quien}@correo.cl` })]);
  try { const r = await db.query(sql, params); return { rows: r.rows, error: null }; }
  catch (e) { return { rows: [], error: e.message }; }
  finally { await db.exec('reset role'); }
}
async function anon(sql, params = []) {
  await db.exec('set role anon');
  try { const r = await db.query(sql, params); return { rows: r.rows, error: null }; }
  catch (e) { return { rows: [], error: e.message }; }
  finally { await db.exec('reset role'); }
}
const subir = (quien, nombre) => como(quien, `insert into storage.objects (bucket_id, name) values ('fiesta-20', $1)`, [nombre]);
const guardar = (quien, ruta, mini, tipo, bytes) =>
  como(quien, 'select fiesta_guardar($1, $2, $3, $4) as id', [ruta, mini, tipo, bytes]);
const listar = async (quien) => { const r = await como(quien, 'select fiesta_listar() as r'); return r.error ? { error: r.error } : r.rows[0].r; };
const MB = 1024 * 1024;

console.log('\nBucket y subida');
let r = (await db.query(`select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'fiesta-20'`)).rows[0];
ok('El bucket es privado, de 50 MB por archivo', r && r.public === false && Number(r.file_size_limit) === 50 * MB);
ok('Acepta fotos JPEG y videos de iPhone y Android', r.allowed_mime_types.includes('image/jpeg') && r.allowed_mime_types.includes('video/quicktime') && r.allowed_mime_types.includes('video/mp4'));
r = await subir('jugador', `${PER.jugador}/a.jpg`);
ok('El socio sube en su carpeta', !r.error, r.error);
r = await subir('jugador', `${PER.otro}/b.jpg`);
ok('No sube en la carpeta de otro', !!r.error);
r = await subir('baja', `${PER.baja}/c.jpg`);
ok('Una cuenta dada de baja no sube', !!r.error);
r = await anon(`insert into storage.objects (bucket_id, name) values ('fiesta-20', 'x/y.jpg')`);
ok('Sin sesión no sube', !!r.error);

console.log('\nAnotar y listar');
r = await guardar('jugador', `${PER.jugador}/a.jpg`, `${PER.jugador}/a.min.jpg`, 'foto', 400000);
ok('Se anota la foto subida', !r.error && r.rows[0].id, r.error);
const idFoto = r.rows[0]?.id;
r = await guardar('jugador', `${PER.otro}/z.jpg`, null, 'foto', 1000);
ok('No se anota un archivo de otra carpeta', /no es tuyo/.test(r.error ?? ''), r.error);
r = await guardar('jugador', `${PER.jugador}/../${PER.otro}/z.jpg`, null, 'foto', 1000);
ok('No se cuela con ..', /no es tuyo/.test(r.error ?? ''), r.error);
r = await guardar('jugador', `${PER.jugador}/v.mov`, null, 'video', 51 * MB);
ok('Un video de más de 50 MB no entra', /50 MB/.test(r.error ?? ''), r.error);
r = await guardar('jugador', `${PER.jugador}/v.mov`, null, 'audio', 1000);
ok('Solo fotos y videos', /no válido/.test(r.error ?? ''), r.error);
r = await guardar('otro', `${PER.otro}/v.mov`, `${PER.otro}/v.min.jpg`, 'video', 30 * MB);
ok('Otro socio sube un video', !r.error, r.error);
const idVideo = r.rows[0]?.id;
r = await guardar('baja', `${PER.baja}/q.jpg`, null, 'foto', 1000);
ok('Dado de baja no anota', /nómina/.test(r.error ?? ''), r.error);

let l = await listar('jugador');
ok('Todo el club ve la galería (2)', l.archivos?.length === 2, JSON.stringify(l));
ok('Lo más nuevo primero, con nombre', l.archivos?.[0].tipo === 'video' && l.archivos[0].nombre === 'Otro Inventado');
ok('Puedo borrar lo mío y no lo de otro', l.archivos?.find((a) => a.id === idFoto)?.puedo_borrar === true
   && l.archivos?.find((a) => a.id === idVideo)?.puedo_borrar === false);
ok('Dice el espacio usado y el tope', Number(l.usado) === 400000 + 30 * MB && Number(l.tope) === 600 * MB && l.abierta === true);
r = await anon('select fiesta_listar()');
ok('Sin sesión no ve la galería', !!r.error);
r = await como('jugador', 'select * from fiesta_archivos');
ok('La tabla no se lee directo', !!r.error);
r = await como('jugador', `select name from storage.objects where bucket_id = 'fiesta-20'`);
ok('El socio ve los archivos del bucket', r.rows.length >= 1, r.error);
r = await como('baja', `select name from storage.objects where bucket_id = 'fiesta-20'`);
ok('Dado de baja no ve los archivos', r.rows.length === 0);

console.log('\nTope total');
for (let i = 0; i < 14; i++) {
  r = await guardar('jugador', `${PER.jugador}/v${i}.mp4`, null, 'video', 50 * MB);
  if (r.error) break;
}
ok('Al llegar a 600 MB no deja subir más', /llenó/.test(r.error ?? ''), r.error);
l = await listar('jugador');
ok('El total no se pasa del tope', Number(l.usado) <= 600 * MB, l.usado);

console.log('\nBorrar');
r = await como('jugador', 'select fiesta_borrar($1) as r', [idVideo]);
ok('No borro lo de otro', /Solo puedes borrar/.test(r.error ?? ''), r.error);
r = await como('jugador', `delete from storage.objects where bucket_id = 'fiesta-20' and name like $1 returning 1`, [`${PER.otro}/%`]);
ok('Tampoco su archivo del bucket', r.rows.length === 0);
await subir('otro', `${PER.otro}/v.mov`);
r = await como('admin', 'select fiesta_borrar($1) as r', [idVideo]);
ok('El administrador borra cualquiera y recibe las rutas', !r.error && r.rows[0].r.length === 2, r.error);
r = await como('admin', `delete from storage.objects where bucket_id = 'fiesta-20' and name = $1 returning 1`, [`${PER.otro}/v.mov`]);
ok('Y su archivo del bucket', r.rows.length === 1, r.error);
r = await como('jugador', 'select fiesta_borrar($1) as r', [idFoto]);
ok('Borro lo mío', !r.error && r.rows[0].r[0] === `${PER.jugador}/a.jpg`, r.error);
r = await como('jugador', `delete from storage.objects where bucket_id = 'fiesta-20' and name = $1 returning 1`, [`${PER.jugador}/a.jpg`]);
ok('Y su archivo del bucket', r.rows.length === 1, r.error);

console.log('\nSe cierra sola');
await db.exec(`create or replace function public.fiesta_abierta() returns boolean language sql stable set search_path = public as $$ select false $$`);
r = await subir('jugador', `${PER.jugador}/tarde.jpg`);
ok('Cerrada, el bucket no recibe', !!r.error);
r = await guardar('jugador', `${PER.jugador}/tarde.jpg`, null, 'foto', 1000);
ok('Cerrada, no se anota', /se cerró/.test(r.error ?? ''), r.error);
l = await listar('jugador');
ok('Cerrada, la galería se sigue viendo', l.abierta === false && l.archivos.length > 0);

console.log(`\n${pass} pruebas pasaron, ${fail} fallaron.`);
process.exit(fail ? 1 : 0);
