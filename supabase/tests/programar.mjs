// Prueba quién programa partidos (0063): el capitán, el cuerpo técnico en sus
// planteles y Comunicaciones en todos. Postgres en memoria (PGlite).
//   npm run test:db
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

const ids = ['cap', 'dt', 'com', 'jug', 'perfildt', 'prueba'];
const U = Object.fromEntries(ids.map((k, i) => [k, `00000000-0000-0000-0000-0000000001${(0xa1 + i).toString(16)}`]));
const PER = Object.fromEntries(ids.map((k, i) => [k, `20000000-0000-0000-0000-0000000001${(0xa1 + i).toString(16)}`]));
const PLANTEL = '40000000-0000-0000-0000-000000000011';
const OTRO = '40000000-0000-0000-0000-000000000012';
const LIGA = '50000000-0000-0000-0000-000000000011';
await db.exec(`
  insert into auth.users (id, email) values ${ids.map((k) => `('${U[k]}', '${k}@correo.cl')`).join(', ')};
  insert into equipos (id, club_id, nombre, orden) values ('${PLANTEL}', '${CLUB}', 'Plantel Inventado', 1), ('${OTRO}', '${CLUB}', 'Otro Plantel Inventado', 2);
  insert into personas (id, club_id, nombre, user_id) values
    ${ids.map((k) => `('${PER[k]}', '${CLUB}', 'Persona ${k} Inventada', '${U[k]}')`).join(', ')};
  update personas set cuerpo_tecnico = true where id = '${PER.dt}';
  update personas set edita_comunicaciones = true where id in ('${PER.com}', '${PER.prueba}');
  update personas set prueba_roles = '{comunicaciones}', prueba_rol = 'comunicaciones' where id = '${PER.prueba}';
  insert into persona_equipos (persona_id, equipo_id, rol) values
    ('${PER.cap}', '${PLANTEL}', 'encargado'), ('${PER.dt}', '${PLANTEL}', 'jugador'),
    ('${PER.jug}', '${PLANTEL}', 'jugador'), ('${PER.perfildt}', '${PLANTEL}', 'jugador');
  insert into partidos (id, club_id, equipo_id, rival, fecha) values ('${LIGA}', '${CLUB}', '${PLANTEL}', 'Rival de la liga', hoy() + 3);
`);

async function como(quien, sql, params = []) {
  await db.exec('set role authenticated');
  await db.query(`select set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claims', $2, false)`,
                 [U[quien], JSON.stringify({ email: `${quien}@correo.cl` })]);
  try { const r = await db.query(sql, params); return { rows: r.rows, error: null }; }
  catch (e) { return { rows: [], error: e.message }; }
  finally { await db.exec('reset role'); }
}
const crear = (quien, equipo, rival = 'Amistoso Inventado') =>
  como(quien, `select partido_guardar(null, $1, $2, hoy() + 5, '10:00') as id`, [equipo, rival]);
const corregir = (quien, id, equipo, rival) =>
  como(quien, `select partido_guardar($1, $2, $3, hoy() + 6) as id`, [id, equipo, rival]);
const borrar = (quien, id) => como(quien, 'select partido_eliminar($1)', [id]);
const programables = async (quien) => (await como(quien, 'select partidos_programables() as x')).rows[0].x;
let r, x;

console.log('\nCrear partidos');
r = await crear('cap', PLANTEL);
ok('El capitán sigue programando en su plantel', !r.error, r.error);
const delCapitan = r.rows[0]?.id;
r = await crear('dt', PLANTEL);
ok('El cuerpo técnico programa en su plantel', !r.error, r.error);
const delDT = r.rows[0]?.id;
r = await crear('dt', OTRO);
ok('…pero no en un plantel donde no está', /Solo el capitán/.test(r.error ?? ''), r.error);
r = await crear('com', OTRO);
ok('Comunicaciones programa en cualquier plantel', !r.error, r.error);
const deCom = r.rows[0]?.id;
r = await crear('jug', PLANTEL);
ok('Un jugador no programa partidos', /Solo el capitán/.test(r.error ?? ''), r.error);
r = await como('perfildt', 'select perfil_guardar($1, $2)', [PER.perfildt, JSON.stringify({ posicion: 'dt' })]);
r = await crear('perfildt', PLANTEL);
ok('Elegir "DT" en el perfil no da permiso (lo da el administrador)', /Solo el capitán/.test(r.error ?? ''), r.error);
r = await crear('prueba', PLANTEL);
ok('Una cuenta de prueba de Comunicaciones no programa en el club real', /Solo el capitán/.test(r.error ?? ''), r.error);

console.log('\nCorregir y eliminar');
r = await corregir('dt', delDT, PLANTEL, 'Amistoso Corregido');
ok('El cuerpo técnico corrige el partido que programó', !r.error, r.error);
r = await corregir('dt', LIGA, PLANTEL, 'Cambiado');
ok('…y también uno de la liga (0065)', !r.error, r.error);
r = await corregir('dt', delCapitan, PLANTEL, 'Cambiado');
ok('…y uno que programó el capitán (0065)', !r.error, r.error);
r = await corregir('jug', LIGA, PLANTEL, 'Cambiado');
ok('Un jugador no corrige uno de la liga', /Solo el capitán|lo corrige/.test(r.error ?? ''), r.error);
r = await corregir('cap', delDT, PLANTEL, 'El capitán también lo corrige');
ok('El capitán corrige el que programó el cuerpo técnico', !r.error, r.error);
r = await corregir('com', deCom, OTRO, 'Comunicaciones corrige');
ok('Comunicaciones corrige el suyo', !r.error, r.error);
r = await borrar('jug', delDT);
ok('Un jugador no elimina partidos', /lo elimina el capitán/.test(r.error ?? ''), r.error);

console.log('\nLo que ve la app');
x = await programables('dt');
ok('Al cuerpo técnico le salen su plantel y todos sus partidos (0065)',
   x.equipos.length === 1 && x.equipos[0].id === PLANTEL && [LIGA, delCapitan, delDT].every((i) => x.partidos.includes(i)) && !x.partidos.includes(deCom), JSON.stringify(x));
x = await programables('com');
ok('A Comunicaciones le salen todos los planteles y todos los partidos', x.equipos.length === 2 && x.partidos.length === 4, JSON.stringify(x));
x = await programables('jug');
ok('A un jugador no le sale nada', x.equipos.length === 0 && x.partidos.length === 0, JSON.stringify(x));
r = await como('jug', 'select puedo_programar($1)', [PLANTEL]);
ok('La función interna no se llama desde afuera', /permission denied/.test(r.error ?? ''), r.error);

r = await borrar('dt', delDT);
ok('El cuerpo técnico elimina el que programó', !r.error, r.error);
r = await borrar('dt', delCapitan);
ok('El cuerpo técnico elimina uno del capitán (0065)', !r.error, r.error);
r = await borrar('com', LIGA);
ok('Comunicaciones elimina uno de la liga (0065)', !r.error, r.error);
r = await borrar('cap', deCom);
ok('El capitán no elimina uno de otro plantel', /lo elimina el capitán/.test(r.error ?? ''), r.error);
r = await crear('dt', PLANTEL);
await db.exec(`update personas set cuerpo_tecnico = false where id = '${PER.dt}'`);
r = await borrar('dt', r.rows[0]?.id);
ok('Sin el permiso de cuerpo técnico ya no elimina ni lo suyo', /lo elimina el capitán/.test(r.error ?? ''), r.error);

console.log(`\n${pass} pasaron, ${fail} fallaron.`);
if (fail) process.exit(1);
