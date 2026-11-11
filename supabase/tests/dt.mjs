// Prueba el perfil del DT y los partidos dirigidos (0048) en un Postgres en
// memoria (PGlite), con todas las migraciones en orden.
//   npm run test:dt (también corre con npm run test:db)
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

const ids = ['enc', 'a', 'b', 'dt', 'ayu', 'otro'];
const U = Object.fromEntries(ids.map((k, i) => [k, `00000000-0000-0000-0000-0000000000${(0xe1 + i).toString(16)}`]));
const PER = Object.fromEntries(ids.map((k, i) => [k, `20000000-0000-0000-0000-0000000000${(0xe1 + i).toString(16)}`]));
const PLANTEL = '40000000-0000-0000-0000-000000000001';
const OTRO = '40000000-0000-0000-0000-000000000002';
const P = { p1: '50000000-0000-0000-0000-000000000001', p2: '50000000-0000-0000-0000-000000000002',
            p3: '50000000-0000-0000-0000-000000000003', p4: '50000000-0000-0000-0000-000000000004',
            sin: '50000000-0000-0000-0000-000000000005' };
await db.exec(`
  insert into auth.users (id, email) values ${ids.map((k) => `('${U[k]}', '${k}@correo.cl')`).join(', ')};
  insert into equipos (id, club_id, nombre, orden) values ('${PLANTEL}', '${CLUB}', 'Plantel Inventado', 1), ('${OTRO}', '${CLUB}', 'Otro Plantel Inventado', 2);
  insert into personas (id, club_id, nombre, user_id) values
    ${ids.map((k) => `('${PER[k]}', '${CLUB}', 'Persona ${k} Inventada', '${U[k]}')`).join(', ')};
  update personas set cuerpo_tecnico = true where id = '${PER.dt}';
  insert into persona_equipos (persona_id, equipo_id, rol) values
    ('${PER.enc}', '${PLANTEL}', 'encargado'), ('${PER.a}', '${PLANTEL}', 'jugador'), ('${PER.b}', '${PLANTEL}', 'jugador'),
    ('${PER.dt}', '${PLANTEL}', 'jugador'), ('${PER.ayu}', '${PLANTEL}', 'jugador'), ('${PER.ayu}', '${OTRO}', 'jugador'),
    ('${PER.otro}', '${OTRO}', 'jugador');
  insert into partidos (id, club_id, equipo_id, rival, fecha, goles_favor, goles_contra) values
    ('${P.p1}', '${CLUB}', '${PLANTEL}', 'Rival Inventado', hoy() - 20, 3, 0),
    ('${P.p2}', '${CLUB}', '${PLANTEL}', 'Rival Inventado', hoy() - 13, 1, 1),
    ('${P.p3}', '${CLUB}', '${PLANTEL}', 'Rival Inventado', hoy() - 6, 0, 2),
    ('${P.p4}', '${CLUB}', '${OTRO}', 'Rival Inventado', hoy() - 5, 2, 1),
    ('${P.sin}', '${CLUB}', '${PLANTEL}', 'Rival Inventado', hoy(), null, null);
  insert into partido_jugadores (partido_id, persona_id)
    select p, x from unnest(array['${P.p1}', '${P.p2}', '${P.p3}']::uuid[]) p, unnest(array['${PER.a}', '${PER.b}']::uuid[]) x;
  insert into partido_estadisticas (partido_id, persona_id, goles) values
    ('${P.p1}', '${PER.a}', 2), ('${P.p1}', '${PER.b}', 1), ('${P.p2}', '${PER.a}', 1);
  insert into partido_votos (partido_id, votante_id, elegido_id) values ('${P.p1}', '${PER.a}', '${PER.b}');
`);

async function como(quien, sql, params = []) {
  await db.exec('set role authenticated');
  await db.query(`select set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claims', $2, false)`,
                 [U[quien], JSON.stringify({ email: `${quien}@correo.cl` })]);
  try { const r = await db.query(sql, params); return { rows: r.rows, error: null }; }
  catch (e) { return { rows: [], error: e.message }; }
  finally { await db.exec('reset role'); }
}
const cifras = async (quien, persona, anio = null) => {
  const r = await como(quien, 'select dt_cifras($1, $2) as c', [persona, anio]);
  if (r.error) throw new Error(r.error);
  return r.rows[0].c;
};
const banca = (quien, partido, lista) => como(quien, 'select partido_banca_guardar($1, $2)', [partido, JSON.stringify(lista)]);
let r, x;

console.log('\nPosición DT y Ayudante técnico');
r = await como('ayu', 'select perfil_guardar($1, $2)', [PER.ayu, JSON.stringify({ posicion: 'ayudante' })]);
ok('Uno elige "Ayudante técnico" como posición', !r.error, r.error);
r = await como('dt', 'select perfil_guardar($1, $2)', [PER.dt, JSON.stringify({ posicion: 'dt' })]);
ok('Otro elige "DT"', !r.error, r.error);
r = await como('a', 'select perfil_guardar($1, $2)', [PER.a, JSON.stringify({ posicion: 'entrenador' })]);
ok('Una posición fuera de la lista se rechaza', /Elige una posición/.test(r.error ?? ''), r.error);
r = await como('a', 'select perfil_guardar($1, $2)', [PER.a, JSON.stringify({ posicion: 'delantero' })]);
ok('Las posiciones de antes siguen funcionando', !r.error, r.error);
x = (await como('b', 'select perfil_ver($1) as p', [PER.dt])).rows[0].p;
ok('El perfil del DT dice que es cuerpo técnico y qué plantel dirige',
   x.posicion === 'dt' && x.cuerpo_tecnico === true && x.dirige.length === 1 && x.dirige[0].id === PLANTEL, JSON.stringify(x));
x = (await como('b', 'select perfil_ver($1) as p', [PER.ayu])).rows[0].p;
ok('El ayudante (por su perfil) dirige sus dos planteles', x.dirige.length === 2 && x.cuerpo_tecnico === false, JSON.stringify(x));
x = (await como('b', 'select perfil_ver($1) as p', [PER.a])).rows[0].p;
ok('Un jugador no dirige nada', x.dirige.length === 0, JSON.stringify(x));

console.log('\nPartidos dirigidos');
x = await cifras('b', PER.dt);
ok('Sin nadie marcado, al DT le cuentan los partidos con resultado de su plantel',
   x.pj === 3 && x.g === 1 && x.e === 1 && x.p === 1 && x.gf === 4 && x.gc === 3 && x.invictas === 1, JSON.stringify(x));
ok('…con el goleador de sus partidos', x.goleador?.persona_id === PER.a && x.goleador.goles === 3, JSON.stringify(x.goleador));
ok('…y el jugador del partido más repetido (votaciones cerradas)', x.mvp?.persona_id === PER.b && x.mvp.veces === 1, JSON.stringify(x.mvp));
ok('…y su récord por plantel', x.por_plantel.length === 1 && x.por_plantel[0].pj === 3, JSON.stringify(x.por_plantel));
x = await cifras('b', PER.ayu);
ok('Al ayudante le cuentan los dos planteles', x.pj === 4 && x.g === 2 && x.por_plantel.length === 2, JSON.stringify(x));
x = await cifras('b', PER.a);
ok('Un jugador no tiene partidos dirigidos', x.pj === 0 && x.goleador === null, JSON.stringify(x));
x = await cifras('b', PER.dt, 1999);
ok('Filtra por año', x.pj === 0, JSON.stringify(x));

x = (await como('b', 'select partido_banca($1) as b', [P.p3])).rows[0].b;
ok('Cualquiera del club ve el cuerpo técnico sugerido del partido',
   x.tecnicos.length === 0 && x.sugeridos.map((s) => s.id).sort().join() === [PER.dt, PER.ayu].sort().join(), JSON.stringify(x));
r = await banca('a', P.p3, [PER.ayu]);
ok('Un jugador que no anota no puede marcar quién dirigió', /Solo quien anota/.test(r.error ?? ''), r.error);
r = await como('enc', 'select partido_banca_guardar($1, $2)', [P.p3, '{"x":1}']);
ok('Una lista mal formada se rechaza', /no es válida/.test(r.error ?? ''), r.error);
r = await banca('enc', P.p3, [PER.ayu]);
x = await cifras('b', PER.dt);
ok('El encargado marca que en un partido dirigió solo el ayudante: al DT ya no le cuenta', !r.error && x.pj === 2 && x.p === 0, r.error ?? JSON.stringify(x));
x = await cifras('b', PER.ayu);
ok('…y al ayudante sí', x.pj === 4, JSON.stringify(x));
x = (await como('b', 'select partido_banca($1) as b', [P.p3])).rows[0].b;
ok('…y se ve marcado', x.tecnicos.length === 1 && x.tecnicos[0] === PER.ayu, JSON.stringify(x));
r = await banca('enc', P.p3, [PER.otro]);
x = await cifras('b', PER.otro);
ok('Se puede marcar a alguien que no es del cuerpo técnico (por ejemplo, un DT de reemplazo)', !r.error && x.pj === 1, r.error ?? JSON.stringify(x));
r = await banca('enc', P.p3, []);
x = await cifras('b', PER.dt);
ok('Al desmarcar todo vuelve a contar el cuerpo técnico del plantel', !r.error && x.pj === 3, r.error ?? JSON.stringify(x));

r = await como('a', 'select * from partido_tecnicos');
ok('La tabla no se lee desde el navegador', !!r.error);
r = await como('a', 'select es_tecnico_de($1, $2)', [PER.dt, PLANTEL]);
ok('La función interna no se llama desde el navegador', !!r.error);
await db.exec('set role anon');
r = await db.query('select dt_cifras($1)', [PER.dt]).then(() => null, (e) => e.message);
await db.exec('reset role');
ok('Sin sesión no se puede', !!r);

console.log(`\n${pass} pruebas pasaron, ${fail} fallaron.`);
process.exit(fail ? 1 : 0);
