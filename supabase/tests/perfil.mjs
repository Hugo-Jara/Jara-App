// Prueba el perfil del jugador (0028) en un Postgres en memoria
// (PGlite), con todas las migraciones en orden.
//   npm run test:perfil (también corre con npm run test:db)
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


const U = { hacienda: '00000000-0000-0000-0000-0000000000b1', tesorero: '00000000-0000-0000-0000-0000000000b2',
            jugador: '00000000-0000-0000-0000-0000000000b3', otro: '00000000-0000-0000-0000-0000000000b4',
            prueba: '00000000-0000-0000-0000-0000000000d1' };
const PER = { hacienda: '20000000-0000-0000-0000-0000000000b1', tesorero: '20000000-0000-0000-0000-0000000000b2',
              jugador: '20000000-0000-0000-0000-0000000000b3', otro: '20000000-0000-0000-0000-0000000000b4',
              prueba: '20000000-0000-0000-0000-0000000000d1', sinCuenta: '20000000-0000-0000-0000-0000000000c1' };
const JUNIOR = '40000000-0000-0000-0000-000000000001';
const SENIOR = '40000000-0000-0000-0000-000000000002';
await db.exec(`
  insert into auth.users (id, email) values ${Object.entries(U).map(([k, id]) => `('${id}', '${k}@correo.cl')`).join(', ')};
  insert into equipos (id, club_id, nombre, orden) values ('${JUNIOR}', '${CLUB}', 'Junior Inventado', 1), ('${SENIOR}', '${CLUB}', 'Senior Inventado', 2);
  insert into personas (id, club_id, nombre, user_id) values
    ('${PER.hacienda}', '${CLUB}', 'Hacienda Inventada', '${U.hacienda}'),
    ('${PER.tesorero}', '${CLUB}', 'Tesorero Inventado', '${U.tesorero}'),
    ('${PER.jugador}', '${CLUB}', 'Jugador Inventado', '${U.jugador}'),
    ('${PER.otro}', '${CLUB}', 'Otro Jugador Inventado', '${U.otro}');
  insert into personas (id, club_id, nombre) values ('${PER.sinCuenta}', '${CLUB}', 'Sin Cuenta Inventado');
  insert into personas (id, club_id, nombre, user_id, prueba_roles) values
    ('${PER.prueba}', '${CLUB}', 'Cuenta de Prueba Inventada', '${U.prueba}', array['socio', 'tesorero', 'hacienda']);
  insert into persona_contactos (persona_id, email, telefono) values ('${PER.jugador}', 'jugador@correo.cl', '911111111');
  insert into areas (id, club_id, nombre, aprueba_compras) values ('30000000-0000-0000-0000-000000000001', '${CLUB}', 'Hacienda', true);
  insert into persona_areas (persona_id, area_id, rol) values ('${PER.hacienda}', '30000000-0000-0000-0000-000000000001', 'ministro');
  insert into persona_equipos (persona_id, equipo_id, rol) values
    ('${PER.tesorero}', '${JUNIOR}', 'tesorero'), ('${PER.tesorero}', '${JUNIOR}', 'jugador'),
    ('${PER.jugador}', '${JUNIOR}', 'jugador'), ('${PER.otro}', '${JUNIOR}', 'jugador'),
    ('${PER.otro}', '${SENIOR}', 'jugador');
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
// Encargado del Junior, para probar que también carga dorsal y posición.
const U_ENC = '00000000-0000-0000-0000-0000000000b5';
const PER_ENC = '20000000-0000-0000-0000-0000000000b5';
U.encargado = U_ENC;
await db.exec(`
  insert into auth.users (id, email) values ('${U_ENC}', 'encargado@correo.cl');
  insert into personas (id, club_id, nombre, user_id) values ('${PER_ENC}', '${CLUB}', 'Encargado Inventado', '${U_ENC}');
  insert into persona_equipos (persona_id, equipo_id, rol) values ('${PER_ENC}', '${JUNIOR}', 'encargado');
`);

let r, x;
const ver = async (quien, persona = null) => {
  const q = await como(quien, 'select perfil_ver($1) as v', [persona]);
  return { v: q.rows[0]?.v, error: q.error };
};
const guardar = (quien, persona, datos) => como(quien, 'select perfil_guardar($1, $2)', [persona, JSON.stringify(datos)]);

console.log('\nPerfil del jugador');

// El jugador edita lo suyo
r = await guardar('jugador', PER.jugador, {
  apodo: 'el Inventado', posicion: 'volante', pie: 'izquierdo', nacimiento: '1990-03-14',
  estatura_cm: 178, peso_kg: 80, dorsales: { [JUNIOR]: 10 },
});
ok('El jugador guarda su perfil', !r.error, r.error);
x = await ver('jugador');
ok('Sin persona, perfil_ver devuelve el mío', x.v?.id === PER.jugador && x.v.propio, x.error);
ok('Ve todos sus datos', x.v?.posicion === 'volante' && x.v.pie === 'izquierdo' && x.v.nacimiento === '1990-03-14'
   && x.v.estatura_cm === 178 && x.v.peso_kg === 80 && x.v.apodo === 'el Inventado', JSON.stringify(x.v));
ok('Ve su celular y su correo', x.v?.telefono === '911111111' && x.v.correo === 'jugador@correo.cl', JSON.stringify(x.v));
ok('Ve su dorsal en su plantel', x.v?.planteles?.length === 1 && x.v.planteles[0].dorsal === 10, JSON.stringify(x.v?.planteles));

// Otro socio lo mira
x = await ver('otro', PER.jugador);
ok('Otro socio ve foto, posición, pie, dorsal y apodo', x.v?.posicion === 'volante' && x.v.planteles[0].dorsal === 10 && x.v.apodo === 'el Inventado' && !x.v.propio, x.error);
ok('Otro socio ve solo el día del cumpleaños', x.v?.cumple === '03-14' && x.v.nacimiento === null, JSON.stringify(x.v));
ok('Otro socio no ve celular ni correo', x.v?.telefono === null && x.v.correo === null);
ok('Sin elegir mostrarlo, no ve estatura ni peso', x.v?.estatura_cm === null && x.v.peso_kg === null);
ok('Otro socio no puede cargar el perfil', x.v?.puedo_cargar === false);
r = await guardar('jugador', PER.jugador, { muestra_fisico: true });
x = await ver('otro', PER.jugador);
ok('Si elige mostrarlo, se ve estatura y peso', x.v?.estatura_cm === 178 && x.v.peso_kg === 80, r.error);

// Lo que no se puede
r = await guardar('jugador', PER.jugador, { nombre: 'Otro Nombre' });
ok('El jugador no cambia su nombre', /tesorero o Hacienda/.test(r.error ?? ''), r.error);
r = await guardar('jugador', PER.jugador, { telefono: '999' });
ok('El jugador no cambia su celular', /tesorero o Hacienda/.test(r.error ?? ''), r.error);
r = await guardar('jugador', PER.jugador, { correo: 'x@correo.cl' });
ok('El jugador no cambia su correo', /tesorero o Hacienda/.test(r.error ?? ''), r.error);
r = await guardar('otro', PER.jugador, { posicion: 'arquero' });
ok('Otro socio no cambia el perfil ajeno', /Solo el jugador/.test(r.error ?? ''), r.error);
r = await guardar('jugador', PER.jugador, { dorsales: { [SENIOR]: 7 } });
ok('Dorsal solo en planteles donde juega', /donde juega/.test(r.error ?? ''), r.error);
r = await guardar('jugador', PER.jugador, { dorsales: { [JUNIOR]: 100 } });
ok('Dorsal del 1 al 99', /1 al 99/.test(r.error ?? ''), r.error);
r = await guardar('jugador', PER.jugador, { posicion: 'portero' });
ok('Posición de la lista', /posición/.test(r.error ?? ''), r.error);
r = await guardar('jugador', PER.jugador, { nacimiento: '2024-01-01' });
ok('Fecha de nacimiento razonable', /fecha/.test(r.error ?? ''), r.error);
r = await guardar('jugador', PER.jugador, { estatura_cm: 300 });
ok('Estatura razonable', /estatura/i.test(r.error ?? ''), r.error);

// Tesorero, encargado y Hacienda cargan lo deportivo
r = await guardar('tesorero', PER.otro, { posicion: 'arquero', pie: 'derecho', dorsales: { [JUNIOR]: 1 } });
ok('El tesorero del plantel carga dorsal, posición y pie', !r.error, r.error);
r = await guardar('encargado', PER.sinCuenta, { posicion: 'defensa' });
ok('El encargado no carga a quien no está en su plantel', /Solo el jugador/.test(r.error ?? ''), r.error);
await db.exec(`insert into persona_equipos (persona_id, equipo_id, rol) values ('${PER.sinCuenta}', '${JUNIOR}', 'jugador')`);
r = await guardar('encargado', PER.sinCuenta, { posicion: 'defensa', dorsales: { [JUNIOR]: 4 } });
ok('El encargado carga a un jugador de su plantel sin cuenta', !r.error, r.error);
x = await ver('encargado', PER.sinCuenta);
ok('El encargado ve que puede cargarlo', x.v?.puedo_cargar === true && x.v.posicion === 'defensa', x.error);
r = await guardar('tesorero', PER.otro, { dorsales: { [SENIOR]: 9 } });
ok('El tesorero del Junior no pone dorsal en el Senior', /tu plantel/.test(r.error ?? ''), r.error);
r = await guardar('tesorero', PER.otro, { nacimiento: '1985-01-01' });
ok('El tesorero no cambia la fecha de nacimiento', /solo el jugador/.test(r.error ?? ''), r.error);
r = await guardar('tesorero', PER.otro, { apodo: 'el Pulpo' });
ok('El tesorero no cambia el apodo desde el perfil', /solo el jugador/.test(r.error ?? ''), r.error);
r = await guardar('hacienda', PER.jugador, { pie: 'ambos' });
ok('Hacienda carga lo deportivo de cualquiera', !r.error, r.error);
r = await guardar('prueba', PER.jugador, { pie: 'derecho' });
ok('Una cuenta de prueba no carga perfiles ajenos', /Solo el jugador/.test(r.error ?? ''), r.error);
r = await guardar('prueba', PER.prueba, { pie: 'derecho' });
ok('Una cuenta de prueba sí edita su propio perfil', !r.error, r.error);

// Foto
r = await como('jugador', `select perfil_foto_guardar($1) as antes`, [`${PER.jugador}/a.jpg`]);
ok('El jugador guarda su foto', !r.error && r.rows[0].antes === null, r.error);
r = await como('jugador', `select perfil_foto_guardar($1) as antes`, [`${PER.jugador}/b.jpg`]);
ok('Cambiar la foto devuelve la anterior para borrarla', r.rows[0]?.antes === `${PER.jugador}/a.jpg`, r.error);
r = await como('jugador', `select perfil_foto_guardar($1)`, [`${PER.otro}/c.jpg`]);
ok('No puede poner una foto de otra carpeta', /no es tuya/.test(r.error ?? ''), r.error);
r = await como('jugador', `insert into storage.objects (bucket_id, name) values ('fotos-perfil', $1)`, [`${PER.jugador}/b.jpg`]);
ok('Sube a su carpeta', !r.error, r.error);
r = await como('jugador', `insert into storage.objects (bucket_id, name) values ('fotos-perfil', $1)`, [`${PER.otro}/x.jpg`]);
ok('No sube a la carpeta de otro', /row-level security/.test(r.error ?? ''), r.error);
r = await como('otro', `select name from storage.objects where bucket_id = 'fotos-perfil'`);
ok('Otro socio ve la foto', r.rows.length === 1, r.error);
r = await anon(`select name from storage.objects where bucket_id = 'fotos-perfil'`);
ok('Sin cuenta no se ven las fotos', r.rows.length === 0 || /permission denied/.test(r.error ?? ''), r.error);
r = await anon(`select perfil_ver(null)`);
ok('Sin cuenta no se lee un perfil', /permission denied/.test(r.error ?? ''), r.error);

// Planteles
r = await como('otro', 'select planteles_fichas() as p');
x = r.rows[0]?.p ?? [];
const junior = x.find((e) => e.id === JUNIOR);
ok('Planteles trae cada plantel con sus jugadores', x.length === 2 && junior?.jugadores.length === 4, JSON.stringify(x));
ok('Ordenados por dorsal', junior?.jugadores[0].dorsal === 1 && junior.jugadores[0].id === PER.otro, JSON.stringify(junior?.jugadores));
ok('Trae la foto y el apodo', junior?.jugadores.some((j) => j.foto_ruta === `${PER.jugador}/b.jpg` && j.apodo === 'el Inventado'));
ok('No trae datos de contacto', !JSON.stringify(x).includes('correo.cl') && !JSON.stringify(x).includes('911111111'));

// Las tablas siguen cerradas al navegador
r = await como('jugador', 'select * from perfiles');
ok('La tabla perfiles no se lee directo', /permission denied/.test(r.error ?? ''), r.error);
r = await como('jugador', 'select * from dorsales');
ok('La tabla dorsales no se lee directo', /permission denied/.test(r.error ?? ''), r.error);

console.log(`\n${pass} pruebas pasaron, ${fail} fallaron.`);
process.exit(fail ? 1 : 0);
