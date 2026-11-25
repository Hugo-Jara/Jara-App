// Prueba el historial de entrenamientos (0064): quién lo ve y qué trae.
// Postgres en memoria (PGlite).
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

const ids = ['entrena', 'jug', 'otro', 'capi'];
const U = Object.fromEntries(ids.map((k, i) => [k, `00000000-0000-0000-0000-0000000002${(0xa1 + i).toString(16)}`]));
const PER = Object.fromEntries(ids.map((k, i) => [k, `20000000-0000-0000-0000-0000000002${(0xa1 + i).toString(16)}`]));
const PLANTEL = '40000000-0000-0000-0000-000000000021';
const E = ['60000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000003'];
await db.exec(`
  insert into auth.users (id, email) values ${ids.map((k) => `('${U[k]}', '${k}@correo.cl')`).join(', ')};
  insert into equipos (id, club_id, nombre, orden) values ('${PLANTEL}', '${CLUB}', 'Plantel Inventado', 1);
  insert into personas (id, club_id, nombre, user_id) values
    ${ids.map((k) => `('${PER[k]}', '${CLUB}', 'Persona ${k} Inventada', '${U[k]}')`).join(', ')};
  update personas set administra_entrenamientos = true where id = '${PER.entrena}';
  insert into persona_equipos (persona_id, equipo_id, rol) values
    ('${PER.jug}', '${PLANTEL}', 'jugador'), ('${PER.otro}', '${PLANTEL}', 'jugador'), ('${PER.capi}', '${PLANTEL}', 'encargado');
  insert into entrenamientos (id, club_id, fecha, hora_inicio, lugar, cupo) values
    ('${E[0]}', '${CLUB}', hoy() - 14, '20:00', 'Cancha de ejemplo', 20),
    ('${E[1]}', '${CLUB}', hoy() - 7, '20:00', 'Cancha de ejemplo', 20),
    ('${E[2]}', '${CLUB}', hoy() + 2, '20:00', 'Cancha de ejemplo', 20);
  insert into entrenamiento_inscritos (entrenamiento_id, persona_id, invitado_nombre, invitado_por, estado, monto) values
    ('${E[0]}', '${PER.jug}', null, null, 'inscrito', 4000),
    ('${E[0]}', '${PER.otro}', null, null, 'inscrito', 4000),
    ('${E[0]}', null, 'Primo Inventado', '${PER.jug}', 'inscrito', 5000),
    ('${E[1]}', '${PER.jug}', null, null, 'inscrito', 4000),
    ('${E[1]}', '${PER.otro}', null, null, 'baja_tarde', 1000),
    ('${E[2]}', '${PER.jug}', null, null, 'inscrito', 4000);
`);

async function como(quien, sql, params = []) {
  await db.exec('set role authenticated');
  await db.query(`select set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claims', $2, false)`,
                 [U[quien], JSON.stringify({ email: `${quien}@correo.cl` })]);
  try { const r = await db.query(sql, params); return { rows: r.rows, error: null }; }
  catch (e) { return { rows: [], error: e.message }; }
  finally { await db.exec('reset role'); }
}

console.log('\nQuién ve el historial');
let r = await como('jug', 'select entrenamientos_historial() as x');
ok('Un jugador no ve el historial', /Solo quienes administran/.test(r.error ?? ''), r.error);
r = await como('capi', 'select entrenamientos_historial() as x');
ok('Un capitán de plantel no ve el historial', /Solo quienes administran/.test(r.error ?? ''), r.error);
r = await como('entrena', 'select entrenamientos_historial() as x');
ok('Quien administra entrenamientos sí lo ve', !r.error, r.error);

console.log('\nQué trae');
const s = r.rows[0]?.x?.sesiones ?? [];
ok('Solo los entrenamientos que ya pasaron', s.length === 2, String(s.length));
ok('Del más nuevo al más viejo', s[0]?.id === E[1] && s[1]?.id === E[0]);
ok('Asistentes con invitados', s[1]?.asistentes.length === 3 && s[1].asistentes.some((a) => a.invitado && a.invitado_por === 'Persona jug Inventada'));
ok('Quien se bajó el mismo día no cuenta como asistente', s[0]?.asistentes.length === 1 && s[0].bajas_tarde.length === 1
   && s[0].bajas_tarde[0].persona_id === PER.otro);
ok('No muestra montos ni pagos', !JSON.stringify(s).includes('monto') && !JSON.stringify(s).includes('pagado'));

console.log(`\n${pass} pasaron, ${fail} fallaron.`);
if (fail) process.exit(1);
