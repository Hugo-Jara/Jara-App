// Prueba el pedido de pago de los honorarios del entrenador (0047) en un
// Postgres en memoria (PGlite), con todas las migraciones en orden.
//   npm run test:honorarios (también corre con npm run test:db)
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

// fondo: equipo del fondo · hacienda: ministro de Hacienda · hprueba: Hacienda de prueba · socio: sin permisos
const ids = ['fondo', 'hacienda', 'hprueba', 'socio'];
const U = Object.fromEntries(ids.map((k, i) => [k, `00000000-0000-0000-0000-0000000000${(0xc1 + i).toString(16)}`]));
const PER = Object.fromEntries(ids.map((k, i) => [k, `20000000-0000-0000-0000-0000000000${(0xc1 + i).toString(16)}`]));
const AREA = '30000000-0000-0000-0000-000000000001';
await db.exec(`
  insert into auth.users (id, email) values ${ids.map((k) => `('${U[k]}', '${k}@correo.cl')`).join(', ')};
  insert into personas (id, club_id, nombre, user_id) values
    ${ids.map((k) => `('${PER[k]}', '${CLUB}', 'Persona ${k} Inventada', '${U[k]}')`).join(', ')};
  update personas set equipo_fondo = true where id = '${PER.fondo}';
  update personas set prueba_roles = array['socio', 'hacienda'], prueba_rol = 'hacienda' where id = '${PER.hprueba}';
  insert into areas (id, club_id, nombre, aprueba_compras) values ('${AREA}', '${CLUB}', 'Hacienda', true);
  insert into persona_areas (persona_id, area_id, rol) values ('${PER.hacienda}', '${AREA}', 'ministro'), ('${PER.hprueba}', '${AREA}', 'ministro');
`);

async function como(quien, sql, params = []) {
  await db.exec('set role authenticated');
  await db.query(`select set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claims', $2, false)`,
                 [U[quien], JSON.stringify({ email: `${quien}@correo.cl` })]);
  try { const r = await db.query(sql, params); return { rows: r.rows, error: null }; }
  catch (e) { return { rows: [], error: e.message }; }
  finally { await db.exec('reset role'); }
}
const cuota = async (mes) => (await db.query(`select * from fondo_gastos where item = 'personal' and mes = $1`, [mes])).rows[0];
const porPagar = async (quien) => (await como(quien, 'select honorarios_por_pagar() as h')).rows[0]?.h;
const pedir = (quien, id, doc = '45', fecha = '2026-11-03') => como(quien, 'select fondo_honorario_pedir($1, $2, $3)', [id, doc, fecha]);
let r;

const nov = (await cuota(11)).id;
const dic = (await cuota(12)).id;

console.log('\nPedir el pago');
r = await pedir('socio', nov);
ok('Un socio no pide el pago', /Solo el equipo del fondo/.test(r.error ?? ''), r.error);
r = await pedir('fondo', nov);
ok('Sin la boleta subida no se puede pedir', /Primero sube la boleta/.test(r.error ?? ''), r.error);
await como('fondo', `insert into storage.objects (bucket_id, name) values ('fondo', $1)`, [`${nov}/boleta.pdf`]);
r = await como('fondo', `select fondo_respaldo($1, 'boleta', true, $2, 'boleta.pdf')`, [nov, `${nov}/boleta.pdf`]);
ok('El equipo del fondo sube la boleta', !r.error, r.error);
r = await pedir('fondo', nov, '');
ok('Pide el N° de boleta', /Falta el N°/.test(r.error ?? ''), r.error);
r = await pedir('fondo', nov, '45', '2026-09-30');
ok('No acepta una boleta anterior al 1 de octubre', /anterior al 1 de octubre/.test(r.error ?? ''), r.error);
r = await pedir('fondo', nov, '45', '2099-01-01');
ok('…ni con fecha futura', /futura/.test(r.error ?? ''), r.error);
const otro = (await db.query(`insert into fondo_gastos (club_id, item, que, monto) values ($1, 'bienes', 'Conos', 1000) returning id`, [CLUB])).rows[0].id;
r = await pedir('fondo', otro);
ok('Solo sirve para cuotas de honorarios', /no es una cuota de honorarios/.test(r.error ?? ''), r.error);
ok('Antes de pedir, Hacienda no tiene nada por pagar', (await porPagar('hacienda'))?.length === 0);
r = await pedir('fondo', nov);
let g = await cuota(11);
ok('El equipo del fondo pide el pago y quedan el N° y la fecha', !r.error && g.pago_pedido_en && g.pago_pedido_por === PER.fondo
   && g.documento === '45' && String(g.fecha.toISOString?.() ?? g.fecha).startsWith('2026-11-03') && g.pago === null, r.error ?? JSON.stringify(g));
r = await pedir('fondo', nov);
ok('No se pide dos veces', /ya está pedido/.test(r.error ?? ''), r.error);

console.log('\nLo que ve cada uno');
let h = await porPagar('hacienda');
ok('Hacienda lo ve en Inicio, con el monto bruto', h?.length === 1 && h[0].id === nov && h[0].monto === 212500 && h[0].mes === 11, JSON.stringify(h));
ok('Al equipo del fondo Inicio no le pide pagar', (await porPagar('fondo'))?.length === 0);
ok('Hacienda de prueba tampoco (no paga)', (await porPagar('hprueba'))?.length === 0);
ok('Un socio recibe una lista vacía, sin error', (await porPagar('socio'))?.length === 0);
r = await como('fondo', 'select fondo_honorarios_pedidos() as p');
ok('En el fondo se ve quién pidió el pago', r.rows[0]?.p?.[0]?.pedido_por === 'Persona fondo Inventada', r.error ?? JSON.stringify(r.rows));
r = await como('socio', 'select fondo_honorarios_pedidos()');
ok('Un socio no ve los pedidos', /Solo el equipo del fondo/.test(r.error ?? ''), r.error);
await db.exec('set role anon');
r = await db.query('select honorarios_por_pagar()').then(() => null, (e) => e.message);
await db.exec('reset role');
ok('Sin sesión no se puede preguntar', /permission denied/.test(r ?? ''), r);

console.log('\nPagar');
const pagar = (quien, id, ruta) => como(quien, `select fondo_honorario_pagado($1, $2, 'comprobante.pdf')`, [id, ruta]);
r = await pagar('fondo', nov, null);
ok('El equipo del fondo no la marca pagada', /Solo Hacienda/.test(r.error ?? ''), r.error);
r = await pagar('hprueba', nov, null);
ok('Hacienda de prueba tampoco', /Cuenta de prueba/.test(r.error ?? ''), r.error);
r = await pagar('hacienda', dic, null);
ok('No se paga una cuota que nadie pidió', /nadie pidió/.test(r.error ?? ''), r.error);
r = await pagar('hacienda', nov, `${nov}/no-existe.pdf`);
ok('Pide el comprobante de la transferencia', /Falta el comprobante/.test(r.error ?? ''), r.error);
r = await como('hacienda', `insert into storage.objects (bucket_id, name) values ('fondo', $1)`, [`${nov}/transferencia.pdf`]);
ok('Hacienda sube el comprobante al bucket del fondo', !r.error, r.error);
r = await pagar('hacienda', nov, `${nov}/transferencia.pdf`);
g = await cuota(11);
const resp = (await db.query(`select tipo, ruta from fondo_respaldos where gasto_id = $1 order by tipo`, [nov])).rows;
ok('Hacienda la marca pagada por transferencia, con el comprobante como respaldo',
   !r.error && g.pago === 'transferencia' && resp.some((x) => x.tipo === 'comprobante' && x.ruta === `${nov}/transferencia.pdf`), r.error ?? JSON.stringify(resp));
ok('…y desaparece de lo que Hacienda tiene por pagar', (await porPagar('hacienda'))?.length === 0);
r = await pagar('hacienda', nov, `${nov}/transferencia.pdf`);
ok('No se paga dos veces', /ya está pagada/.test(r.error ?? ''), r.error);
r = await como('fondo', 'select fondo_honorario_anular($1)', [nov]);
ok('Una cuota pagada no se anula', /ya está pagada/.test(r.error ?? ''), r.error);
r = await como('fondo', 'select fondo_ver() as f');
const vista = r.rows[0]?.f?.gastos?.find((x) => x.id === nov);
ok('En el fondo la cuota queda pagada, y sigue pendiente por el F29, la certificación y el original',
   vista?.pago === 'transferencia' && vista.estado === 'pendiente' && vista.marcados.includes('boleta') && vista.marcados.includes('comprobante'), JSON.stringify(vista));

console.log('\nAnular un pedido');
await como('fondo', `insert into storage.objects (bucket_id, name) values ('fondo', $1)`, [`${dic}/boleta.pdf`]);
await como('fondo', `select fondo_respaldo($1, 'boleta', true, $2, 'boleta.pdf')`, [dic, `${dic}/boleta.pdf`]);
r = await como('fondo', 'select fondo_honorario_anular($1)', [dic]);
ok('No se anula lo que no está pedido', /no está pedido/.test(r.error ?? ''), r.error);
await pedir('fondo', dic, '50', '2026-11-05');
r = await como('socio', 'select fondo_honorario_anular($1)', [dic]);
ok('Un socio no anula', /Solo el equipo del fondo/.test(r.error ?? ''), r.error);
r = await como('fondo', 'select fondo_honorario_anular($1)', [dic]);
g = await cuota(12);
ok('El equipo del fondo anula el pedido', !r.error && g.pago_pedido_en === null && (await porPagar('hacienda'))?.length === 0, r.error);

console.log(`\n${pass} pruebas pasaron, ${fail} fallaron.`);
process.exit(fail ? 1 : 0);
