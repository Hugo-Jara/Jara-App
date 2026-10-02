// Prueba los pedidos de compra por link en un Postgres en memoria (PGlite).
//   npm run test:pedidos
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
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
  create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
  create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
  grant usage on schema auth, public to anon, authenticated;
`);
for (const f of ['0001_base.sql', '0002_cotizaciones.sql', '0004_funciones_de_trigger_privadas.sql', '0005_pedidos_de_compra.sql']) {
  await db.exec(mig(f));
}
await db.exec(`
  insert into clubes (id, nombre, slug) values ('10000000-0000-0000-0000-000000000001', 'Hugo Jara', 'hugo-jara');
  insert into pedidos (club_id, nombre, token, token_hacienda, carpeta)
  values ('10000000-0000-0000-0000-000000000001', 'Fiesta 20 años', 'tok-pedir', 'tok-hacienda', 'carpeta1'),
         ('10000000-0000-0000-0000-000000000001', 'Otro evento', 'tok-otro', 'tok-otro-h', 'carpeta2');
`);

// Todo se ejecuta como visitante sin cuenta, igual que la página.
async function anon(sql, params = []) {
  await db.exec('set role anon');
  try { const r = await db.query(sql, params); return { rows: r.rows, error: null }; }
  catch (e) { return { rows: [], error: e.message }; }
  finally { await db.exec('reset role'); }
}
const ver = async (t) => (await anon('select pedido_ver($1) as p', [t])).rows[0]?.p;

console.log('Acceso');
let r = await anon('select count(*) from pedidos');
ok('Sin el link no se pueden leer los pedidos', !!r.error);
r = await anon('select count(*) from pedido_items');
ok('…ni las compras', !!r.error);
r = await anon(`select pedido_ver('inventado')`);
ok('Un link inventado se rechaza', /no es válido/.test(r.error ?? ''), r.error);
let p = await ver('tok-pedir');
ok('El link de pedir abre el pedido sin permisos de Hacienda', p?.nombre === 'Fiesta 20 años' && p.es_hacienda === false && p.items.length === 0);
ok('La respuesta no revela los códigos de acceso', !JSON.stringify(p).includes('tok-'));
p = await ver('tok-hacienda');
ok('El link de Hacienda abre el mismo pedido con permisos', p?.es_hacienda === true);

console.log('\nAgregar compras');
const agregar = (token, quien, que, monto, cot, ref, refRuta) =>
  anon(`select pedido_agregar($1, $2, $3, $4, $5, 'cot.pdf', $6, $7, $8) as id`, [token, quien, que, monto, cot, ref, refRuta, refRuta ? 'ref.jpg' : null]);
r = await agregar('tok-pedir', 'Pancho', 'Carne', 187500, null, 'https://x.cl', null);
ok('Sin cotización no se agrega', /cotización/.test(r.error ?? ''), r.error);
r = await agregar('tok-pedir', 'Pancho', 'Carne', 187500, 'carpeta1/a-cot.pdf', null, null);
ok('Sin referencia (ni link ni archivo) no se agrega', /referencia/.test(r.error ?? ''), r.error);
r = await agregar('tok-pedir', 'Pancho', 'Carne', 0, 'carpeta1/a-cot.pdf', 'https://x.cl', null);
ok('Sin monto no se agrega', /monto/.test(r.error ?? ''), r.error);
r = await agregar('tok-pedir', 'Pancho', 'Carne', 187500, 'carpeta2/a-cot.pdf', 'https://x.cl', null);
ok('No se acepta un archivo de otro pedido', /cotización/.test(r.error ?? ''), r.error);
r = await agregar('tok-pedir', 'Pancho', 'Carne', 187500, 'carpeta1/a-cot.pdf', 'https://x.cl', null);
const carne = r.rows[0]?.id;
ok('Con cotización y link de referencia se agrega', !!carne, r.error);
r = await agregar('tok-pedir', 'Lalo', 'Parlantes', 90000, 'carpeta1/b-cot.jpg', null, 'carpeta1/b-ref.jpg');
const parlantes = r.rows[0]?.id;
ok('La referencia también puede ser un archivo', !!parlantes, r.error);
p = await ver('tok-pedir');
ok('El pedido muestra las dos compras por revisar', p.items.length === 2 && p.items.every((i) => i.estado === 'pendiente'));
ok('El otro pedido no las ve', (await ver('tok-otro')).items.length === 0);

console.log('\nRevisión de Hacienda');
const revisar = (token, item, accion, comentario = null) =>
  anon('select pedido_revisar($1, $2, $3, $4)', [token, item, accion, comentario]);
r = await revisar('tok-pedir', carne, 'aprobar');
ok('Con el link de pedir no se puede aprobar', /Solo Hacienda/.test(r.error ?? ''), r.error);
r = await revisar('tok-otro-h', carne, 'aprobar');
ok('Hacienda de otro pedido tampoco', /no está en este pedido/.test(r.error ?? ''), r.error);
r = await revisar('tok-hacienda', carne, 'aprobar');
ok('Hacienda aprueba', !r.error, r.error);
r = await revisar('tok-hacienda', parlantes, 'devolver');
ok('No se puede devolver sin decir qué falta', /qué falta/.test(r.error ?? ''), r.error);
r = await revisar('tok-hacienda', parlantes, 'devolver', 'Cotizar una segunda opción');
ok('Hacienda devuelve con motivo', !r.error, r.error);
r = await revisar('tok-hacienda', parlantes, 'entregar');
ok('No se entrega plata de algo devuelto', !!r.error);
p = await ver('tok-pedir');
ok('Quien pidió ve el motivo de la devolución', p.items.find((i) => i.id === parlantes)?.comentario === 'Cotizar una segunda opción');

console.log('\nCorregir, entregar y respaldar');
r = await anon(`select pedido_corregir($1, $2, 'Pancho', 'Carne', 1, 'carpeta1/a-cot.pdf', 'cot.pdf', 'x')`, ['tok-pedir', carne]);
ok('Una compra aprobada no se puede modificar', /Solo se puede corregir/.test(r.error ?? ''), r.error);
r = await anon(`select pedido_corregir($1, $2, 'Lalo', 'Parlantes (2 opciones)', 85000, 'carpeta1/c-cot.pdf', 'cot2.pdf', 'https://y.cl')`, ['tok-pedir', parlantes]);
ok('La devuelta se corrige y vuelve a quedar por revisar', !r.error, r.error);
p = await ver('tok-pedir');
const it = p.items.find((i) => i.id === parlantes);
ok('…con el monto nuevo y sin el motivo anterior', it.estado === 'pendiente' && it.monto === 85000 && it.comentario === null);
r = await anon(`select pedido_boleta($1, $2, 'carpeta1/z-boleta.jpg', 'boleta.jpg')`, ['tok-pedir', carne]);
ok('No se sube boleta antes de recibir la plata', /plata ya fue entregada/.test(r.error ?? ''), r.error);
r = await revisar('tok-hacienda', carne, 'entregar');
ok('Hacienda marca la plata entregada', !r.error, r.error);
r = await anon(`select pedido_boleta($1, $2, 'carpeta1/z-boleta.jpg', 'boleta.jpg')`, ['tok-pedir', carne]);
ok('Quien compró sube la boleta y queda respaldado', !r.error && (await ver('tok-pedir')).items.find((i) => i.id === carne).estado === 'respaldado', r.error);

r = await db.query(`select string_agg(a_estado || '/' || por, ' > ' order by id) as camino from pedido_item_eventos where item_id = $1`, [carne]);
ok('El historial guarda cada paso y quién lo hizo',
   r.rows[0].camino === 'pendiente/solicitante > aprobado/hacienda > entregado/hacienda > respaldado/solicitante', r.rows[0].camino);

await db.exec(`update pedidos set abierto = false where token = 'tok-pedir'`);
r = await agregar('tok-pedir', 'Tito', 'Hielo', 5000, 'carpeta1/h.pdf', 'x', null);
ok('A un pedido cerrado no se le agregan compras', /cerrado/.test(r.error ?? ''), r.error);
r = await anon(`select pedido_carpeta_abierta('carpeta1') as a, pedido_carpeta_abierta('carpeta2') as b`);
ok('…ni se le pueden subir archivos', r.rows[0]?.a === false && r.rows[0]?.b === true);

console.log(`\n${pass} pruebas pasaron, ${fail} fallaron.`);
process.exit(fail ? 1 : 0);
