// Prueba la tabla de posiciones (0026) en un Postgres en memoria (PGlite),
// con todas las migraciones en orden.
//   npm run test:tabla (también corre con npm run test:db)
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
const CLUB = '10000000-0000-0000-0000-000000000001';
const migs = readdirSync(join(here, '..', 'migrations')).filter((f) => f.endsWith('.sql')).sort();
for (const f of migs) {
  await db.exec(mig(f));
  if (f.startsWith('0001_')) await db.exec(`insert into clubes (id, nombre, slug) values ('${CLUB}', 'Hugo Jara', 'hugo-jara')`);
}
console.log(`Migraciones 0001 a ${migs.at(-1).slice(0, 4)}, aplicadas en orden`);

const U = { admin: '00000000-0000-0000-0000-0000000000e1', encargado: '00000000-0000-0000-0000-0000000000e2',
            jugador: '00000000-0000-0000-0000-0000000000e3', prueba: '00000000-0000-0000-0000-0000000000e4' };
const PER = { admin: '20000000-0000-0000-0000-0000000000e1', encargado: '20000000-0000-0000-0000-0000000000e2',
              jugador: '20000000-0000-0000-0000-0000000000e3', prueba: '20000000-0000-0000-0000-0000000000e4' };
const JUNIOR = '40000000-0000-0000-0000-0000000000e1';
const SENIOR = '40000000-0000-0000-0000-0000000000e2';
await db.exec(`
  insert into auth.users (id, email) values ${Object.entries(U).map(([k, id]) => `('${id}', '${k}@correo.cl')`).join(', ')};
  insert into equipos (id, club_id, nombre, orden) values ('${JUNIOR}', '${CLUB}', 'Junior Inventado', 1), ('${SENIOR}', '${CLUB}', 'Senior Inventado', 2);
  insert into personas (id, club_id, nombre, user_id, es_admin) values
    ('${PER.admin}', '${CLUB}', 'Admin Inventado', '${U.admin}', true),
    ('${PER.encargado}', '${CLUB}', 'Encargado Inventado', '${U.encargado}', false),
    ('${PER.jugador}', '${CLUB}', 'Jugador Inventado', '${U.jugador}', false);
  insert into personas (id, club_id, nombre, user_id, prueba_roles) values
    ('${PER.prueba}', '${CLUB}', 'Cuenta de Prueba Inventada', '${U.prueba}', array['socio']);
  insert into persona_equipos (persona_id, equipo_id, rol) values
    ('${PER.encargado}', '${JUNIOR}', 'encargado'), ('${PER.jugador}', '${JUNIOR}', 'jugador'),
    ('${PER.prueba}', '${JUNIOR}', 'encargado');
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
const fila = (equipo, n, extra = {}) => ({ equipo, pj: n, pg: n, pe: 0, pp: 0, gf: n * 2, gc: 0, pts: n * 3, ...extra });
const guardar = (quien, equipo, filas, fuente = 'https://liga.ejemplo/tabla') =>
  como(quien, 'select tabla_guardar($1, $2, $3::jsonb, $4)', [equipo, 'Liga Inventada', JSON.stringify(filas), fuente]);
const tablas = async (quien) => (await como(quien, 'select tablas_posiciones() as t')).rows[0]?.t;
let r, x;

console.log('\nTabla de posiciones');

x = await tablas('jugador');
ok('Todos los planteles vienen, aunque no tengan tabla', x.length === 2 && x[0].equipo === 'Junior Inventado' && x[0].filas.length === 0, JSON.stringify(x));
ok('El jugador no puede editar', x.every((t) => !t.puedo_editar));
ok('El encargado puede editar solo su plantel', (await tablas('encargado')).map((t) => t.puedo_editar).join() === 'true,false');
ok('La cuenta de prueba encargada no puede editar', (await tablas('prueba')).every((t) => !t.puedo_editar));

r = await guardar('encargado', JUNIOR, [fila('Rival Uno', 5), fila('Hugo Jara', 4, { es_jara: true, extra: 'x' }), fila('Rival Dos', 1)]);
ok('El encargado guarda la tabla de su plantel', !r.error, r.error);
x = (await tablas('jugador'))[0];
ok('El club la ve en orden, con el Jara marcado', x.filas.map((f) => f.equipo).join() === 'Rival Uno,Hugo Jara,Rival Dos' && x.filas[1].es_jara && x.fuente === 'https://liga.ejemplo/tabla' && x.torneo === 'Liga Inventada', JSON.stringify(x));
ok('Solo se guardan los campos conocidos', !('extra' in x.filas[1]) && x.filas[1].pts === 12, JSON.stringify(x.filas[1]));

r = await guardar('encargado', JUNIOR, [fila('Hugo Jara', 5, { es_jara: true }), fila('Rival Uno', 5)]);
x = (await tablas('jugador'))[0];
ok('Guardar de nuevo reemplaza la tabla', !r.error && x.filas.length === 2 && x.filas[0].equipo === 'Hugo Jara', r.error);

r = await guardar('encargado', SENIOR, [fila('Rival', 1)]);
ok('El encargado no toca la tabla de otro plantel', /Solo el encargado/.test(r.error ?? ''), r.error);
r = await guardar('jugador', JUNIOR, [fila('Rival', 1)]);
ok('El jugador no cambia la tabla', /Solo el encargado/.test(r.error ?? ''), r.error);
r = await guardar('prueba', JUNIOR, [fila('Rival', 1)]);
ok('La cuenta de prueba no cambia la tabla', /Cuenta de prueba/.test(r.error ?? ''), r.error);
r = await guardar('admin', SENIOR, [fila('Rival', 1, { pts: -2 })]);
ok('Un administrador guarda cualquier plantel (y los puntos pueden ser negativos)', !r.error, r.error);

r = await guardar('encargado', JUNIOR, [fila('Rival', 1, { pj: -1 })]);
ok('No pasan partidos negativos', /Revisa los números/.test(r.error ?? ''), r.error);
r = await guardar('encargado', JUNIOR, [fila('Rival', 1, { gf: 'muchos' })]);
ok('No pasan números que no son números', /Revisa los números/.test(r.error ?? ''), r.error);
r = await guardar('encargado', JUNIOR, [fila('', 1)]);
ok('No pasan filas sin equipo', /sin nombre/.test(r.error ?? ''), r.error);
r = await guardar('encargado', JUNIOR, [fila('A', 1, { es_jara: true }), fila('B', 1, { es_jara: true })]);
ok('Solo una fila es el Jara', /solo una fila/.test(r.error ?? ''), r.error);
r = await guardar('encargado', JUNIOR, [fila('A', 1)], 'javascript:alert(1)');
ok('El link de la liga tiene que ser https', /https/.test(r.error ?? ''), r.error);
x = (await tablas('jugador'))[0];
ok('Un guardado fallido no cambia la tabla', x.filas[0].equipo === 'Hugo Jara', JSON.stringify(x.filas));

r = await como('jugador', 'select * from tablas_posiciones');
ok('La tabla no se lee directo desde el navegador', /permission denied/.test(r.error ?? ''), r.error);
r = await anon('select tablas_posiciones()');
ok('Sin cuenta no se ve la tabla', /permission denied/.test(r.error ?? ''), r.error);

console.log(`\n${pass} pruebas pasaron, ${fail} fallaron.`);
process.exit(fail ? 1 : 0);
