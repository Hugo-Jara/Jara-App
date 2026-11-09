// Prueba "Buscarme en las fotos" (0042) en un Postgres en memoria (PGlite),
// con todas las migraciones en orden y un Drive de mentira.
//   npm run test:caras (también corre con npm run test:db)
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

// La tarea de GitHub entra como service_role.
async function tarea(sql, params = []) {
  await db.exec('set role service_role');
  try { const r = await db.query(sql, params); return { rows: r.rows, error: null }; }
  catch (e) { return { rows: [], error: e.message }; }
  finally { await db.exec('reset role'); }
}
const estado = async (quien) => (await como(quien, 'select caras_mi_estado() as e')).rows[0]?.e;
const huella = (k) => `{${Array.from({ length: 512 }, (_, i) => (i === k ? 1 : 0)).join(',')}}`;

let r, x;
console.log('\nBuscarme en las fotos');
await db.exec(`insert into fotos_drive (club_id, llave, raiz) values ('${CLUB}', 'llave-de-mentira-1234567890', '${RAIZ}')`);
await vuelta('capitan', true);
const fotosCobs = (await db.query(`select archivo_id from fotos_archivos where carpeta_id = '${CJ}' order by 1`)).rows.map((f) => f.archivo_id);
ok('Hay fotos de la liga para buscar', fotosCobs.length === 3, String(fotosCobs.length));

x = await estado('jugador');
ok('Al partir está apagado', x.activa === false && x.tiene_foto === false, JSON.stringify(x));
r = await como('jugador', 'select caras_activar(true)');
ok('Sin foto de perfil no se puede activar', /foto de perfil/.test(r.error ?? ''), r.error);
await db.exec(`insert into perfiles (persona_id, foto_ruta, nacimiento) values
  ('${PER.jugador}', '${PER.jugador}/a.jpg', '1995-05-05'), ('${PER.capitan}', '${PER.capitan}/a.jpg', '${new Date().getFullYear() - 16}-01-01')`);
r = await como('jugador', 'select caras_activar(false)');
ok('Hay que declarar ser mayor de 18', /mayores de 18/.test(r.error ?? ''), r.error);
r = await como('capitan', 'select caras_activar(true)');
ok('Con fecha de nacimiento de menor, no se activa aunque declare', /mayores de 18/.test(r.error ?? ''), r.error);
r = await como('jugador', 'select caras_activar(true)');
x = await estado('jugador');
ok('Se activa y queda pendiente', !r.error && x.activa && x.estado === 'pendiente', r.error ?? JSON.stringify(x));

r = await como('jugador', 'select caras_trabajo()');
ok('La app no puede pedir el trabajo de la tarea', /permission denied/.test(r.error ?? ''), r.error);
r = await como('jugador', `select caras_guardar('[]'::jsonb)`);
ok('La app no puede guardar hallazgos', /permission denied/.test(r.error ?? ''), r.error);
r = await como('jugador', 'select * from caras_hallazgos');
ok('La app no lee las tablas', /permission denied/.test(r.error ?? ''), r.error);

r = await tarea('select caras_trabajo() as t');
let t = r.rows[0]?.t;
ok('La tarea ve a quien activó, con su foto y la llave', !r.error && t.personas.length === 1 && t.personas[0].sacar_huella
   && t.personas[0].foto_ruta === `${PER.jugador}/a.jpg` && Object.values(t.llaves)[0] === 'llave-de-mentira-1234567890'
   && t.archivos.length >= 3 && t.archivos.every((a) => !a.revisada), r.error ?? JSON.stringify(t).slice(0, 300));

r = await tarea('select caras_guardar_huella($1, $2, $3::real[], $4)', [PER.jugador, `${PER.jugador}/a.jpg`, huella(0), 'lista']);
ok('La tarea guarda la huella', !r.error, r.error);
r = await tarea('select caras_guardar($1::jsonb)', [JSON.stringify([
  { archivo_id: fotosCobs[0], caras: 3, hallazgos: [{ persona_id: PER.jugador, parecido: 0.62 }] },
  { archivo_id: fotosCobs[1], caras: 2, hallazgos: [{ persona_id: PER.jugador, parecido: 0.5 }] },
  { archivo_id: fotosCobs[2], caras: 1, hallazgos: [] },
  { archivo_id: fotosCobs[2], caras: 1, hallazgos: [{ persona_id: PER.capitan, parecido: 0.9 }] },
])]);
ok('La tarea guarda lo encontrado', !r.error, r.error);
ok('No guarda a quien no activó', (await db.query(`select count(*)::int n from caras_hallazgos where persona_id = '${PER.capitan}'`)).rows[0].n === 0);
await tarea('select caras_terminar($1::uuid[])', [[PER.jugador]]);
t = (await tarea('select caras_trabajo() as t')).rows[0].t;
ok('Después queda completa y las fotos revisadas', t.personas[0].completa && !t.personas[0].sacar_huella
   && fotosCobs.every((f) => t.archivos.find((a) => a.archivo_id === f)?.revisada), JSON.stringify(t.personas));

x = await como('jugador', 'select * from caras_mis_fotos()');
ok('Ve sus fotos con su partido', x.rows.length === 2 && x.rows.every((f) => f.partido_id === P_JR && f.partido_rival === 'Cobs'), x.error ?? JSON.stringify(x.rows));
x = await como('capitan', 'select * from caras_mis_fotos()');
ok('Otro no ve las fotos del jugador', x.rows.length === 0, JSON.stringify(x.rows));
x = await estado('jugador');
ok('El estado cuenta las encontradas', x.estado === 'lista' && Number(x.encontradas) === 2, JSON.stringify(x));

r = await como('jugador', 'select caras_no_soy_yo($1)', [fotosCobs[1]]);
x = await como('jugador', 'select * from caras_mis_fotos()');
ok('"No soy yo" esconde la foto', !r.error && x.rows.length === 1, r.error ?? JSON.stringify(x.rows));

// 0045: mostrar en el perfil.
x = await como('capitan', 'select * from caras_fotos_de($1)', [PER.jugador]);
ok('Por defecto el resto del club no ve sus fotos', !x.error && x.rows.length === 0, x.error ?? JSON.stringify(x.rows));
x = await como('jugador', 'select * from caras_fotos_de($1)', [PER.jugador]);
ok('Uno mismo sí ve las suyas en su perfil', x.rows.length === 1, JSON.stringify(x.rows));
r = await como('jugador', 'select caras_mostrar(true)');
x = await como('capitan', 'select * from caras_fotos_de($1)', [PER.jugador]);
ok('Si elige mostrarlas, el club las ve (sin las escondidas)', !r.error && x.rows.length === 1 && x.rows[0].partido_id === P_JR, r.error ?? JSON.stringify(x.rows));
ok('El estado dice que las muestra', (await estado('jugador')).muestra === true);
r = await como('capitan', 'select caras_mostrar(true)');
ok('Sin activar no se puede mostrar', /Primero activa/.test(r.error ?? ''), r.error);
r = await como('jugador', 'select caras_mostrar(false)');
x = await como('capitan', 'select * from caras_fotos_de($1)', [PER.jugador]);
ok('Si deja de mostrarlas, el club ya no las ve', !r.error && x.rows.length === 0, r.error ?? JSON.stringify(x.rows));
await como('jugador', 'select caras_mostrar(true)');

// Al releer la carpeta (0041 borra y vuelve a anotar las fotos), no se pierde nada.
await db.exec(`update fotos_carpetas set leida_en = null; update fotos_drive set revisada_en = now() - interval '7 hours'`);
await vuelta('capitan', true);
x = await como('jugador', 'select * from caras_mis_fotos()');
ok('Al releer el Drive sigue lo encontrado y lo escondido', x.rows.length === 1, JSON.stringify(x.rows));

// Cambia la foto de perfil: hay que sacar la huella de nuevo.
await db.exec(`update perfiles set foto_ruta = '${PER.jugador}/b.jpg' where persona_id = '${PER.jugador}'`);
t = (await tarea('select caras_trabajo() as t')).rows[0].t;
ok('Con foto nueva, la tarea saca la huella de nuevo', t.personas[0].sacar_huella && !t.personas[0].completa, JSON.stringify(t.personas));
x = await estado('jugador');
ok('La app sabe que cambió la foto', x.foto_cambio === true, JSON.stringify(x));
await tarea('select caras_guardar_huella($1, $2, null, $3)', [PER.jugador, `${PER.jugador}/b.jpg`, 'sin_cara']);
x = await estado('jugador');
const quedan = (await db.query(`select count(*)::int n, count(*) filter (where oculta)::int o from caras_hallazgos`)).rows[0];
ok('Si la foto nueva no tiene cara, avisa y borra lo encontrado (menos los "No soy yo")', x.estado === 'sin_cara' && quedan.n === 1 && quedan.o === 1, JSON.stringify([x, quedan]));
r = await tarea('select caras_guardar_huella($1, $2, null, $3)', [PER.jugador, 'x', 'lista']);
ok('No acepta una huella vacía como lista', /Huella no válida/.test(r.error ?? ''), r.error);

r = await como('jugador', 'select caras_apagar()');
const total = (await db.query('select (select count(*) from caras_personas)::int p, (select count(*) from caras_hallazgos)::int h')).rows[0];
x = await estado('jugador');
ok('Apagar borra la huella y todo lo encontrado', !r.error && total.p === 0 && total.h === 0 && x.activa === false, r.error ?? JSON.stringify(total));
x = await como('capitan', 'select * from caras_fotos_de($1)', [PER.jugador]);
ok('Después de apagar, nadie ve sus fotos', x.rows.length === 0, JSON.stringify(x.rows));

r = await anon('select caras_mi_estado()');
ok('Sin cuenta no hay nada', /permission denied|nómina/.test(r.error ?? '') || r.rows[0]?.caras_mi_estado == null, r.error ?? JSON.stringify(r.rows));

console.log(`\n${pass} pruebas pasaron, ${fail} fallaron.`);
process.exit(fail ? 1 : 0);
