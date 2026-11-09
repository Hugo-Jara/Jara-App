// Prueba las fotos de los partidos (0041) en un Postgres en memoria (PGlite),
// con todas las migraciones en orden y un Drive de mentira.
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

const U = { capitan: '00000000-0000-0000-0000-0000000000e1', jugador: '00000000-0000-0000-0000-0000000000e2',
            admin: '00000000-0000-0000-0000-0000000000e3' };
const PER = { capitan: '20000000-0000-0000-0000-0000000000e1', jugador: '20000000-0000-0000-0000-0000000000e2',
              admin: '20000000-0000-0000-0000-0000000000e3' };
const JUNIOR = '40000000-0000-0000-0000-000000000001';
const SENIOR = '40000000-0000-0000-0000-000000000002';
const JUEVES = '40000000-0000-0000-0000-000000000003';
const P_JR = '50000000-0000-0000-0000-000000000001';
const P_JR2 = '50000000-0000-0000-0000-000000000002';
const P_SR = '50000000-0000-0000-0000-000000000003';
const P_JU = '50000000-0000-0000-0000-000000000004';
await db.exec(`
  insert into auth.users (id, email) values ${Object.entries(U).map(([k, id]) => `('${id}', '${k}@correo.cl')`).join(', ')};
  insert into equipos (id, club_id, nombre, orden) values ('${JUNIOR}', '${CLUB}', 'Junior Sábado', 1),
    ('${SENIOR}', '${CLUB}', 'Senior Sábado', 2), ('${JUEVES}', '${CLUB}', 'Senior Jueves', 3);
  insert into personas (id, club_id, nombre, user_id, es_admin) values
    ('${PER.capitan}', '${CLUB}', 'Capitán Inventado', '${U.capitan}', false),
    ('${PER.jugador}', '${CLUB}', 'Jugador Inventado', '${U.jugador}', false),
    ('${PER.admin}', '${CLUB}', 'Admin Inventado', '${U.admin}', true);
  insert into persona_equipos (persona_id, equipo_id, rol) values
    ('${PER.capitan}', '${JUNIOR}', 'encargado'), ('${PER.jugador}', '${JUNIOR}', 'jugador');
  insert into partidos (id, club_id, equipo_id, rival, fecha) values
    ('${P_JR}', '${CLUB}', '${JUNIOR}', 'Cobs', '2026-11-01'),
    ('${P_JR2}', '${CLUB}', '${JUNIOR}', 'Rival Dos', '2026-10-25'),
    ('${P_SR}', '${CLUB}', '${SENIOR}', 'Fasolita', '2026-09-26'),
    ('${P_JU}', '${CLUB}', '${JUEVES}', 'Fasolita', '2026-09-24');
`);

// El Drive de mentira: Junior y Senior / {Junior Clausura, Senior Clausura} / Fecha / partido.
const id = (s) => `${s}`.padEnd(20, 'x');
const RAIZ = id('raiz'), JC = id('juniorclausura'), SC = id('seniorclausura'), F7 = id('fecha7'), F1 = id('fecha1');
const CJ = id('cobsvsjara'), OTRO = id('zaravsmecanica'), CS = id('fasolitavsjara'), SUELTA = id('cargadaamano');
const carpetas = (lista) => JSON.stringify({ files: lista.map(([i, n]) => ({ id: i, name: n, createdTime: '2026-11-04T13:58:00Z' })) });
const fotos = (n, t) => JSON.stringify({ files: Array.from({ length: n }, (_, k) => ({
  id: id(`foto${t.slice(5, 10)}${k}`), name: `IMG_${k}.jpg`, imageMediaMetadata: { time: t.replace(/-/g, ':') + ' 10:0' + k + ':00', width: 4000, height: 3000 } })) });
const pagina = (padre, tipo, contenido, status = 200) =>
  db.query('insert into extensions.paginas values ($1, $2, $3)', [`%'${padre}' in parents%${tipo}%`, status, contenido]);
await pagina(RAIZ, 'folder', carpetas([[JC, 'Junior Clausura'], [SC, 'Senior Clausura']]));
await pagina(JC, 'folder', carpetas([[F7, 'Fecha 7']]));
await pagina(SC, 'folder', carpetas([[F1, 'Fecha 1 Senior Clausura']]));
await pagina(F7, 'folder', carpetas([[CJ, 'COBS vs Hugo Jara Jr'], [OTRO, 'Zara vs N. Mecánica Jr']]));
await pagina(F1, 'folder', carpetas([[CS, 'Fasolita Sr vs Hugo Jara Sr']]));
for (const c of [CJ, OTRO, CS, SUELTA]) await pagina(c, 'folder', carpetas([]));
await pagina(CJ, 'image', fotos(3, '2026-11-01'));
await pagina(CS, 'image', fotos(2, '2026-09-26'));
await pagina(SUELTA, 'image', fotos(4, '2026-10-25'));
for (const c of [RAIZ, JC, SC, F7, F1]) await pagina(c, 'image', fotos(0, '2026-01-01'));

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
const pedidas = async () => (await db.query('select count(*)::int as n from extensions.pedidas')).rows[0].n;
const revisar = async (quien, forzar = false) => {
  const r = await como(quien, 'select fotos_revisar($1) as r', [forzar]);
  return r.error ? { error: r.error } : r.rows[0].r;
};
// Como la app: repite mientras queden pendientes.
const vuelta = async (quien, forzar = false) => {
  let r, veces = 0, enlazadas = 0;
  do { r = await revisar(quien, veces === 0 && forzar); veces++; enlazadas += r.enlazadas ?? 0; } while (r.pendientes > 0 && veces < 10);
  return { ...r, veces, enlazadas };
};
const enlaces = async (quien) => (await como(quien, 'select * from fotos_enlaces()')).rows;
const enlazar = (quien, partido, carpeta, nombre = null) => como(quien, 'select fotos_enlazar($1, $2, $3)', [partido, carpeta, nombre]);

let r, x;
console.log('\nFotos de los partidos');

r = await revisar('jugador');
ok('Sin llave no sale al Drive', r.sin_llave === true && (await pedidas()) === 0, JSON.stringify(r));

await db.exec(`insert into fotos_drive (club_id, llave, raiz) values ('${CLUB}', 'AIzaLlaveDePruebaInventada123', '${RAIZ}')`);
r = await vuelta('jugador');
ok('Al abrir la app, la vuelta recorre el Drive de a poco', !r.error && r.pendientes === 0 && r.veces >= 2, JSON.stringify(r));
x = (await db.query('select carpeta_id, rival, categoria, dia::text, fotos from fotos_carpetas order by nombre')).rows;
ok('Encuentra solo las carpetas del club', x.length === 2 && x.every((c) => [CJ, CS].includes(c.carpeta_id)), JSON.stringify(x));
const cj = x.find((c) => c.carpeta_id === CJ), cs = x.find((c) => c.carpeta_id === CS);
ok('Lee rival y categoría del nombre', cj?.rival === 'COBS' && cj.categoria === 'jr' && cs?.rival === 'Fasolita' && cs.categoria === 'sr', JSON.stringify(x));
ok('Saca el día y cuenta las fotos', cj?.dia === '2026-11-01' && cj.fotos === 3 && cs?.dia === '2026-09-26' && cs.fotos === 2, JSON.stringify(x));
x = await enlaces('jugador');
ok('Enlaza sola las seguras (Junior y Senior Sábado)', r.enlazadas === 2 && x.length === 2
   && x.find((e) => e.partido_id === P_JR)?.carpeta_id === CJ && x.find((e) => e.partido_id === P_SR)?.carpeta_id === CS
   && x.every((e) => e.automatico), JSON.stringify(x));
ok('No se confunde con el Senior Jueves', !x.some((e) => e.partido_id === P_JU));
x = (await como('jugador', 'select * from fotos_de_partido($1)', [P_JR])).rows;
ok('Todo el club ve las fotos del partido, en orden', x.length === 3 && x[0].nombre === 'IMG_0.jpg' && x[0].ancho === 4000, JSON.stringify(x[0]));

let antes = await pedidas();
r = await revisar('jugador');
ok('Antes de 6 horas no vuelve a salir al Drive', (await pedidas()) === antes && r.pendientes === 0, JSON.stringify(r));
r = await revisar('jugador', true);
ok('Un jugador no fuerza otra vuelta antes de 5 minutos', (await pedidas()) === antes, JSON.stringify(r));
r = await vuelta('capitan', true);
ok('El capitán fuerza la búsqueda cuando quiere', (await pedidas()) > antes && !r.error, JSON.stringify(r));
x = await enlaces('jugador');
ok('Una vuelta nueva no duplica ni cambia enlaces', x.length === 2, JSON.stringify(x));

await db.exec(`update fotos_drive set revisada_en = now() - interval '7 hours'`);
await db.query(`update extensions.paginas set status = 403 where patron like $1`, [`%${RAIZ}%`]);
r = await vuelta('jugador');
ok('Si el Drive rechaza la llave, queda el error y no se cae', /rechazó la llave/.test(r.error ?? ''), JSON.stringify(r));
await db.query(`update extensions.paginas set status = 200`);
await db.exec(`update fotos_drive set revisada_en = now() - interval '7 hours'`);
r = await vuelta('jugador');
ok('Al volver el Drive, se borra el error', !r.error && r.pendientes === 0, JSON.stringify(r));

// A mano
r = await enlazar('jugador', P_JR2, SUELTA);
ok('Un jugador no enlaza fotos', /Solo el capitán/.test(r.error ?? ''), r.error);
r = await enlazar('capitan', P_JR2, 'https://drive.google.com/x');
ok('Un link que no es carpeta se rechaza', /no parece una carpeta/.test(r.error ?? ''), r.error);
r = await enlazar('capitan', P_JR2, CJ);
ok('Una carpeta no se enlaza a dos partidos', /otro partido/.test(r.error ?? ''), r.error);
r = await enlazar('capitan', P_SR, SUELTA);
ok('El capitán no enlaza en otro plantel', /Solo el capitán/.test(r.error ?? ''), r.error);
r = await enlazar('capitan', P_JR2, SUELTA, 'Carpeta pegada');
ok('El capitán pega el link de una carpeta nueva', !r.error, r.error);
r = await vuelta('capitan');
x = (await como('jugador', 'select * from fotos_de_partido($1)', [P_JR2])).rows;
ok('En la siguiente vuelta se leen sus fotos', x.length === 4, JSON.stringify(r));
x = await enlaces('capitan');
ok('Queda como enlazada a mano y el capitán la puede cambiar', x.find((e) => e.partido_id === P_JR2)?.automatico === false
   && x.find((e) => e.partido_id === P_JR2)?.puedo_cambiar === true, JSON.stringify(x));
ok('El jugador no la puede cambiar', (await enlaces('jugador')).every((e) => e.puedo_cambiar === false));

r = await como('capitan', 'select fotos_desenlazar($1)', [P_JR]);
await db.exec(`update fotos_drive set revisada_en = now() - interval '7 hours'`);
await vuelta('jugador');
x = await enlaces('capitan');
ok('Si el capitán quita una enlazada sola, no se vuelve a enlazar', !r.error && !x.some((e) => e.partido_id === P_JR), r.error ?? JSON.stringify(x));
r = await enlazar('admin', P_JR, CJ);
ok('Un administrador enlaza en cualquier plantel', !r.error, r.error);

x = await como('jugador', 'select * from fotos_carpetas_ver()');
ok('Un jugador no ve la lista de carpetas', /Solo los capitanes/.test(x.error ?? ''), x.error);
x = await como('capitan', 'select * from fotos_carpetas_ver()');
ok('El capitán ve las carpetas con su partido', x.rows.length === 3 && x.rows.every((c) => c.partido_id), JSON.stringify(x.rows));

r = await anon('select fotos_revisar(false)');
ok('Sin cuenta no se revisa el Drive', /permission denied/.test(r.error ?? ''), r.error);
r = await como('jugador', 'select llave from fotos_drive');
ok('La llave no se lee desde la app', /permission denied/.test(r.error ?? ''), r.error);
r = await como('capitan', 'select fotos_drive_listar($1, $2, $3, $4)', [CLUB, 'x', RAIZ, 'carpetas']);
ok('Las funciones internas no se llaman desde la app', /permission denied/.test(r.error ?? ''), r.error);

await db.exec(`delete from partidos where id = '${P_SR}'`);
x = (await db.query(`select count(*)::int as n from partido_fotos where partido_id = '${P_SR}'`)).rows[0].n;
ok('Al borrar el partido se borra su enlace', x === 0, String(x));

console.log(`\n${pass} pruebas pasaron, ${fail} fallaron.`);
process.exit(fail ? 1 : 0);
