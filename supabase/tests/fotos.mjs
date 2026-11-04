// Prueba las fotos de los partidos (0031) en un Postgres en memoria
// (PGlite), con todas las migraciones en orden.
//   npm run test:fotos (también corre con npm run test:db)
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
  create role anon nologin; create role authenticated nologin;
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
// El club existe antes de las migraciones, como en Supabase: así se crean sus
// tópicos, listas y el fondo.
const CLUB = '10000000-0000-0000-0000-000000000001';
const migs = readdirSync(join(here, '..', 'migrations')).filter((f) => f.endsWith('.sql')).sort();
for (const f of migs) {
  await db.exec(mig(f));
  if (f.startsWith('0001_')) await db.exec(`insert into clubes (id, nombre, slug) values ('${CLUB}', 'Hugo Jara', 'hugo-jara')`);
}
console.log(`Migraciones 0001 a ${migs.at(-1).slice(0, 4)}, aplicadas en orden`);



const U = { capitan: '00000000-0000-0000-0000-0000000000e1', jugador: '00000000-0000-0000-0000-0000000000e2',
            admin: '00000000-0000-0000-0000-0000000000e3' };
const PER = { capitan: '20000000-0000-0000-0000-0000000000e1', jugador: '20000000-0000-0000-0000-0000000000e2',
              admin: '20000000-0000-0000-0000-0000000000e3' };
const JUNIOR = '40000000-0000-0000-0000-000000000001';
const SENIOR = '40000000-0000-0000-0000-000000000002';
const P_JR = '50000000-0000-0000-0000-000000000001';
const P_JR2 = '50000000-0000-0000-0000-000000000002';
const P_SR = '50000000-0000-0000-0000-000000000003';
await db.exec(`
  insert into auth.users (id, email) values ${Object.entries(U).map(([k, id]) => `('${id}', '${k}@correo.cl')`).join(', ')};
  insert into equipos (id, club_id, nombre, orden) values ('${JUNIOR}', '${CLUB}', 'Junior Inventado', 1), ('${SENIOR}', '${CLUB}', 'Senior Inventado', 2);
  insert into personas (id, club_id, nombre, user_id, es_admin) values
    ('${PER.capitan}', '${CLUB}', 'Capitán Inventado', '${U.capitan}', false),
    ('${PER.jugador}', '${CLUB}', 'Jugador Inventado', '${U.jugador}', false),
    ('${PER.admin}', '${CLUB}', 'Admin Inventado', '${U.admin}', true);
  insert into persona_equipos (persona_id, equipo_id, rol) values
    ('${PER.capitan}', '${JUNIOR}', 'encargado'), ('${PER.jugador}', '${JUNIOR}', 'jugador');
  insert into partidos (id, club_id, equipo_id, rival, fecha) values
    ('${P_JR}', '${CLUB}', '${JUNIOR}', 'Rival Uno', '2026-11-01'),
    ('${P_JR2}', '${CLUB}', '${JUNIOR}', 'Rival Dos', '2026-10-25'),
    ('${P_SR}', '${CLUB}', '${SENIOR}', 'Rival Tres', '2026-11-01');
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
const enlazar = (quien, partido, carpeta, nombre = 'Rival Uno vs Club Jr') =>
  como(quien, 'select fotos_enlazar($1, $2, $3)', [partido, carpeta, nombre]);
const enlaces = async (quien) => (await como(quien, 'select * from fotos_enlaces()')).rows;
const CARPETA = '1AbCdEfGhIjKlMnOpQrStUvWxYz012345';
const OTRA = '1ZyXwVuTsRqPoNmLkJiHgFeDcBa543210';

let r, x;
console.log('\nFotos de los partidos');

r = await enlazar('capitan', P_JR, CARPETA);
ok('El capitán enlaza la carpeta de un partido de su plantel', !r.error, r.error);
x = await enlaces('jugador');
ok('Un socio ve el enlace', x.length === 1 && x[0].carpeta_id === CARPETA && x[0].carpeta_nombre === 'Rival Uno vs Club Jr', JSON.stringify(x));
ok('El socio no lo puede cambiar', x[0]?.puedo_cambiar === false);
x = await enlaces('capitan');
ok('El capitán sí lo puede cambiar', x[0]?.puedo_cambiar === true);

r = await enlazar('jugador', P_JR2, OTRA);
ok('Un jugador no enlaza fotos', /Solo el capitán/.test(r.error ?? ''), r.error);
r = await enlazar('capitan', P_SR, OTRA);
ok('El capitán no enlaza en otro plantel', /Solo el capitán/.test(r.error ?? ''), r.error);
r = await enlazar('admin', P_SR, OTRA);
ok('Un administrador enlaza en cualquier plantel', !r.error, r.error);

r = await enlazar('capitan', P_JR2, CARPETA);
ok('Una carpeta no se enlaza a dos partidos', /otro partido/.test(r.error ?? ''), r.error);
r = await enlazar('capitan', P_JR2, 'https://drive.google.com/x');
ok('Un link que no es id de carpeta se rechaza', /no parece una carpeta/.test(r.error ?? ''), r.error);
r = await enlazar('capitan', '50000000-0000-0000-0000-0000000000ff', OTRA);
ok('Un partido que no existe se rechaza', /No encontramos/.test(r.error ?? ''), r.error);

r = await enlazar('capitan', P_JR, OTRA.replace('1Z', '1Q'), 'Otra carpeta');
x = await enlaces('capitan');
ok('Enlazar de nuevo cambia la carpeta', !r.error && x.find((e) => e.partido_id === P_JR)?.carpeta_nombre === 'Otra carpeta', r.error);

r = await como('jugador', 'select fotos_desenlazar($1)', [P_JR]);
ok('Un jugador no quita el enlace', /Solo el capitán/.test(r.error ?? ''), r.error);
r = await como('capitan', 'select fotos_desenlazar($1)', [P_JR]);
x = await enlaces('capitan');
ok('El capitán quita el enlace', !r.error && !x.some((e) => e.partido_id === P_JR), r.error);

r = await anon('select * from fotos_enlaces()');
ok('Sin cuenta no se ven los enlaces', /permission denied/.test(r.error ?? ''), r.error);
r = await como('jugador', 'select * from partido_fotos');
ok('La tabla no se lee directo', /permission denied/.test(r.error ?? ''), r.error);
r = await como('capitan', 'select fotos_exigir($1)', [P_JR]);
ok('La función interna no se llama desde la app', /permission denied/.test(r.error ?? ''), r.error);

await db.exec(`delete from partidos where id = '${P_SR}'`);
x = (await db.query('select count(*)::int as n from partido_fotos')).rows[0].n;
ok('Al borrar el partido se borra su enlace', x === 0, String(x));

console.log(`\n${pass} pruebas pasaron, ${fail} fallaron.`);
process.exit(fail ? 1 : 0);
