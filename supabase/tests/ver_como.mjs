// Prueba el selector "Ver como" de las cuentas de prueba (0022) en un
// Postgres en memoria (PGlite), con todas las migraciones en orden.
//   npm run test:vercomo (también corre con npm run test:db)
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

const U = { hacienda: '00000000-0000-0000-0000-0000000000b1', socio: '00000000-0000-0000-0000-0000000000b2',
            prueba: '00000000-0000-0000-0000-0000000000d1', benja: '00000000-0000-0000-0000-0000000000d2' };
const PER = { hacienda: '20000000-0000-0000-0000-0000000000b1', socio: '20000000-0000-0000-0000-0000000000b2',
              prueba: '20000000-0000-0000-0000-0000000000d1', benja: '20000000-0000-0000-0000-0000000000d2' };
const PLANTEL = '40000000-0000-0000-0000-000000000001';
await db.exec(`
  insert into auth.users (id, email) values ${Object.entries(U).map(([k, id]) => `('${id}', '${k}@correo.cl')`).join(', ')};
  insert into equipos (id, club_id, nombre, orden) values ('${PLANTEL}', '${CLUB}', 'Plantel Inventado', 1);
  insert into personas (id, club_id, nombre, user_id) values
    ('${PER.hacienda}', '${CLUB}', 'Hacienda Inventada', '${U.hacienda}'),
    ('${PER.socio}', '${CLUB}', 'Socio Inventado', '${U.socio}');
  insert into personas (id, club_id, nombre, user_id, prueba_roles) values
    ('${PER.prueba}', '${CLUB}', 'Cuenta de Prueba Inventada', '${U.prueba}',
     array['socio', 'equipo_fondo', 'hacienda', 'anota_partidos', 'entrenamientos', 'tesorero', 'comunicaciones']),
    ('${PER.benja}', '${CLUB}', 'Prueba Comunicaciones Inventada', '${U.benja}', array['socio', 'comunicaciones', 'anota_partidos']);
  insert into areas (id, club_id, nombre, aprueba_compras) values ('30000000-0000-0000-0000-000000000001', '${CLUB}', 'Hacienda', true);
  insert into persona_areas (persona_id, area_id, rol) values ('${PER.hacienda}', '30000000-0000-0000-0000-000000000001', 'ministro');
  insert into storage.objects (bucket_id, name) values ('comprobantes', 'algo/c0.jpg');
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
const falla = async (sql, params = []) => { try { await db.query(sql, params); return null; } catch (e) { return e.message; } };
const obj = (nombre) => db.query(`insert into storage.objects (bucket_id, name, metadata) values ('pedidos', $1, $2::jsonb)`,
                                 [nombre, JSON.stringify({ mimetype: 'application/pdf', size: 1000 })]);
const carpetaF = (await db.query(`select carpeta from pedidos where topico = 'fondo' and abierto`)).rows[0].carpeta;
let r, x;

console.log('\nVer como: cuentas de prueba');
const verComo = (quien, rol, equipo = null) => como(quien, `select prueba_ver_como($1, $2)`, [rol, equipo]);
const yo = async (quien) => (await como(quien, 'select mi_persona() as p')).rows[0].p;
const fila = async (id) => (await db.query(`select * from personas where id = $1`, [id])).rows[0];
const areasDe = async (id) => (await db.query(`select count(*)::int n from persona_areas where persona_id = $1`, [id])).rows[0].n;
const equiposDe = async (id) => (await db.query(`select count(*)::int n from persona_equipos where persona_id = $1`, [id])).rows[0].n;

// Quién puede cambiar de rol
r = await verComo('socio', 'hacienda');
ok('Una cuenta normal no puede cambiar de rol', /Solo las cuentas de prueba/.test(r.error ?? ''), r.error);
r = await verComo('hacienda', 'socio');
ok('…ni Hacienda de verdad', /Solo las cuentas de prueba/.test(r.error ?? ''), r.error);
r = await anon(`select prueba_ver_como('socio')`);
ok('…ni alguien sin cuenta', /permission denied/.test(r.error ?? ''), r.error);
r = await como('prueba', `update personas set prueba_roles = array['hacienda'] where id = '${PER.benja}'`);
ok('Nadie cambia la lista de roles desde la app', /permission denied/.test(r.error ?? ''), r.error);
r = await verComo('benja', 'hacienda');
ok('Una cuenta de prueba no elige un rol que no está en su lista', /no tiene ese rol/.test(r.error ?? ''), r.error);
r = await verComo('prueba', 'admin');
ok('Administrador no es un rol de prueba', /no tiene ese rol/.test(r.error ?? ''), r.error);
r = await falla(`update personas set prueba_roles = array['socio', 'admin'] where id = $1`, [PER.benja]);
ok('…ni se puede poner en la lista por SQL', /prueba_roles_validos/.test(r ?? ''), r);
r = await falla(`update personas set es_admin = true where id = $1`, [PER.prueba]);
ok('Una cuenta de prueba nunca queda como administradora', /prueba_nunca_admin/.test(r ?? ''), r);

// Benja: comunicaciones y anotar partidos
r = await verComo('benja', 'comunicaciones');
x = await fila(PER.benja);
ok('Comunicaciones prende edita_comunicaciones', !r.error && x.edita_comunicaciones && x.prueba_rol === 'comunicaciones', r.error);
r = await verComo('benja', 'anota_partidos');
x = await fila(PER.benja);
ok('Al pasar a anotar partidos se apaga comunicaciones', !r.error && x.anota_partidos && !x.edita_comunicaciones, r.error);
x = await yo('benja');
ok('mi_persona trae sus roles y el actual', JSON.stringify(x.prueba.roles) === JSON.stringify(['socio', 'comunicaciones', 'anota_partidos'])
   && x.prueba.rol === 'anota_partidos' && x.prueba.planteles.length >= 1, JSON.stringify(x.prueba));
ok('…y una cuenta normal no trae nada de prueba', (await yo('socio')).prueba === null);

// Volver a socio apaga todo, aunque se haya prendido algo a mano
await db.query(`update personas set ve_compras = true, ve_comprobantes = true, equipo_fondo = true, cobra_entrenamientos = true where id = $1`, [PER.prueba]);
await db.query(`insert into persona_areas (persona_id, area_id, rol) values ($1, '30000000-0000-0000-0000-000000000001', 'ministro')`, [PER.prueba]);
await db.query(`insert into persona_equipos (persona_id, equipo_id, rol) values ($1, $2, 'encargado')`, [PER.prueba, PLANTEL]);
r = await verComo('prueba', 'socio');
x = await fila(PER.prueba);
ok('Socio apaga todos los permisos, áreas y planteles',
   !r.error && !x.es_admin && !x.ve_compras && !x.ve_comprobantes && !x.equipo_fondo && !x.cobra_entrenamientos
   && !x.anota_partidos && !x.administra_entrenamientos && !x.edita_comunicaciones
   && (await areasDe(PER.prueba)) === 0 && (await equiposDe(PER.prueba)) === 0, r.error);
ok('…y como socio no ve el fondo', (await como('prueba', 'select fondo_acceso() as a')).rows[0].a === false);

// Compras para probar Hacienda de prueba
await obj(`${carpetaF}/cot-prueba.pdf`);
const compraP = (await como('socio', `select compra_agregar('fondo', 'Petos (prueba)', 20000, $1, 'cot.pdf') as id`, [`${carpetaF}/cot-prueba.pdf`])).rows[0]?.id;
const compraP2 = (await como('socio', `select compra_agregar('fondo', 'Mallas (prueba)', 30000, $1, 'cot.pdf') as id`, [`${carpetaF}/cot-prueba.pdf`])).rows[0]?.id;
await como('hacienda', `select compra_revisar($1, 'aprobar')`, [compraP2]);

// Hacienda de prueba: solo mirar
r = await verComo('prueba', 'hacienda');
ok('Hacienda de prueba queda como ministro del área que aprueba', !r.error && (await areasDe(PER.prueba)) === 1, r.error);
x = await yo('prueba');
ok('mi_persona: ve lo de Hacienda, solo mirar y no es administrador', x.aprueba_compras && x.hacienda_solo_mirar && !x.es_admin, JSON.stringify(x));
ok('Hacienda de verdad no es solo mirar', (await yo('hacienda')).hacienda_solo_mirar === false);
let cvP = (await como('prueba', 'select compras_ver() as c')).rows[0].c;
ok('Ve la pantalla de Hacienda con todas las compras', cvP.es_hacienda && cvP.hacienda_solo_mirar && cvP.ve_todas && cvP.items.some((i) => i.id === compraP), JSON.stringify(cvP).slice(0, 200));
ok('…sin el link público de los tópicos', cvP.topicos.every((t) => !t.token_envio));
ok('…y sin comprobantes', !cvP.puedo_ver_comprobantes && cvP.items.every((i) => !i.comprobante_ruta));
for (const [que, sql, params] of [
  ['aprobar', `select compra_revisar($1, 'aprobar')`, [compraP]],
  ['devolver', `select compra_revisar($1, 'devolver', 'falta algo')`, [compraP]],
  ['entregar', `select compra_revisar($1, 'entregar')`, [compraP2]],
  ['subir comprobante', `select compra_comprobante($1, $2, 'c.jpg')`, [compraP2, `${carpetaF}/c.jpg`]],
  ['editar', `select compra_editar($1, 'Otro', 'Otra cosa', 1)`, [compraP]],
  ['eliminar', `select compra_eliminar($1)`, [compraP]],
  ['corregir una compra ajena', `select compra_corregir($1, 'x', 1, $2, 'c.pdf')`, [compraP, `${carpetaF}/cot-prueba.pdf`]],
  ['subir la boleta de otro', `select compra_boleta($1, $2, 'b.pdf')`, [compraP2, `${carpetaF}/cot-prueba.pdf`]],
  ['cerrar un tópico', `select topico_cambiar('fondo', false)`, []],
]) {
  r = await como('prueba', sql, params);
  ok(`Hacienda de prueba no puede ${que}`, /Solo/.test(r.error ?? ''), r.error);
}
x = (await db.query(`select estado from pedido_items where id = any($1::uuid[]) order by que desc`, [[compraP, compraP2]])).rows.map((y) => y.estado);
ok('…y las compras quedaron igual', JSON.stringify(x) === JSON.stringify(['pendiente', 'aprobado']), JSON.stringify(x));
r = await como('prueba', `select count(*)::int n from storage.objects where bucket_id = 'comprobantes'`);
ok('…no abre los archivos de comprobantes', !r.error && r.rows[0].n === 0, r.error);
ok('Hacienda de verdad sí los abre', (await como('hacienda', `select count(*)::int n from storage.objects where bucket_id = 'comprobantes'`)).rows[0].n > 0);
ok('Ve el fondo en Más', (await como('prueba', 'select fondo_acceso() as a')).rows[0].a === true);
r = await como('prueba', 'select fondo_ver() as f');
ok('…y lo puede mirar', !r.error && r.rows[0].f.rendiciones.length === 2, r.error);
r = await como('prueba', `select fondo_clasificar($1, 'bienes')`, [compraP]);
ok('…pero no pasa compras al fondo', /solo mirar/.test(r.error ?? ''), r.error);
r = await como('prueba', `select fondo_documento('cartola', false)`);
ok('…ni cambia documentos', /solo mirar/.test(r.error ?? ''), r.error);
r = await como('prueba', `select fondo_presentar(2)`);
ok('…ni presenta rendiciones', /solo mirar/.test(r.error ?? ''), r.error);
r = await como('prueba', `select fondo_subida(1, false)`);
ok('…ni marca subidas', /solo mirar/.test(r.error ?? ''), r.error);
r = await como('prueba', `insert into storage.objects (bucket_id, name) values ('fondo', 'x/prueba.pdf')`);
ok('…ni sube respaldos del fondo', /row-level security/.test(r.error ?? ''), r.error);
r = await como('hacienda', `select compra_revisar($1, 'aprobar')`, [compraP]);
ok('Hacienda de verdad sigue aprobando', !r.error, r.error);

// Equipo del fondo de prueba: trabaja, pero no presenta ni marca subidas
r = await verComo('prueba', 'equipo_fondo');
x = await fila(PER.prueba);
ok('Equipo del fondo de prueba: deja de ser Hacienda', !r.error && x.equipo_fondo && (await areasDe(PER.prueba)) === 0 && !(await yo('prueba')).aprueba_compras, r.error);
r = await como('prueba', `select fondo_documento('cartola', true)`);
ok('…marca documentos del fondo', !r.error, r.error);
r = await como('prueba', `select fondo_presentar(2)`);
ok('…pero no presenta rendiciones', /Cuenta de prueba: no puede presentar/.test(r.error ?? ''), r.error);
r = await como('prueba', `select fondo_subida(1, false)`);
ok('…ni marca una rendición como subida', /Cuenta de prueba: no puede marcar/.test(r.error ?? ''), r.error);
r = await como('prueba', `select compra_revisar($1, 'entregar')`, [compraP2]);
ok('…ni aprueba ni paga compras', /Solo Hacienda/.test(r.error ?? ''), r.error);

// Tesorero de prueba
r = await verComo('prueba', 'tesorero');
ok('Tesorero pide elegir un plantel', /Elige un plantel/.test(r.error ?? ''), r.error);
r = await verComo('prueba', 'tesorero', '40000000-0000-0000-0000-0000000000ff');
ok('…que sea del club', /Elige un plantel/.test(r.error ?? ''), r.error);
r = await verComo('prueba', 'tesorero', PLANTEL);
x = await yo('prueba');
ok('Queda como tesorero de ese plantel y sin equipo del fondo', !r.error && x.equipos.length === 1 && x.equipos[0].tesorero && !(await fila(PER.prueba)).equipo_fondo, r.error);
x = (await como('prueba', 'select compras_ver() as c')).rows[0].c;
ok('…pero una cuenta de prueba no abre comprobantes ni como tesorero', !x.puedo_ver_comprobantes);

// Entrenamientos
r = await verComo('prueba', 'entrenamientos');
x = await fila(PER.prueba);
ok('Entrenamientos prende administrar y cobrar, y saca el plantel', !r.error && x.administra_entrenamientos && x.cobra_entrenamientos && (await equiposDe(PER.prueba)) === 0, r.error);

x = await fila(PER.prueba);
ok('En ningún momento quedó como administradora', !x.es_admin && (await yo('prueba')).es_admin === false);

console.log(`\n${pass} pruebas pasaron, ${fail} fallaron.`);
process.exit(fail ? 1 : 0);
