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
for (const f of ['0001_base.sql', '0002_cotizaciones.sql', '0004_funciones_de_trigger_privadas.sql', '0005_pedidos_de_compra.sql', '0007_comprobante_de_transferencia.sql', '0008_hacienda_edita_y_elimina.sql']) {
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

console.log('\nComprobante de transferencia');
const comprobante = (token, item, ruta) =>
  anon(`select pedido_comprobante($1, $2, $3, 'transferencia.jpg')`, [token, item, ruta]);
const item = async (token, id) => (await ver(token)).items.find((i) => i.id === id);
r = await comprobante('tok-pedir', parlantes, 'carpeta1/t1.jpg');
ok('Con el link de pedir no se sube el comprobante', /Solo Hacienda/.test(r.error ?? ''), r.error);
r = await comprobante('tok-hacienda', parlantes, 'carpeta1/t1.jpg');
ok('No se sube comprobante de una compra sin aprobar', /aprobada/.test(r.error ?? ''), r.error);
await revisar('tok-hacienda', parlantes, 'aprobar');
r = await comprobante('tok-hacienda', parlantes, 'carpeta2/t1.jpg');
ok('No se acepta un comprobante guardado en otro pedido', /Falta el archivo/.test(r.error ?? ''), r.error);
r = await comprobante('tok-otro-h', parlantes, 'carpeta2/t1.jpg');
ok('Hacienda de otro pedido no puede subirlo', /no está en este pedido/.test(r.error ?? ''), r.error);
r = await comprobante('tok-hacienda', parlantes, 'carpeta1/t1.jpg');
let c = await item('tok-hacienda', parlantes);
ok('Al subir el comprobante la plata queda entregada', !r.error && c.estado === 'entregado', r.error);
ok('Hacienda puede abrir el comprobante', c.con_comprobante === true && c.comprobante_ruta === 'carpeta1/t1.jpg' && c.comprobante_nombre === 'transferencia.jpg');
c = await item('tok-pedir', parlantes);
ok('Quien pidió ve que hay comprobante, pero no el archivo', c.con_comprobante === true && c.comprobante_ruta === null && !JSON.stringify(c).includes('t1.jpg'));
r = await comprobante('tok-hacienda', parlantes, 'carpeta1/t2.jpg');
ok('El comprobante se puede reemplazar', !r.error && (await item('tok-hacienda', parlantes)).comprobante_ruta === 'carpeta1/t2.jpg', r.error);
ok('La compra entregada sin comprobante lo dice', (await item('tok-pedir', carne)).con_comprobante === false);
r = await comprobante('tok-hacienda', carne, 'carpeta1/t3.jpg');
c = await item('tok-hacienda', carne);
ok('Se puede agregar después, sin cambiar el estado', !r.error && c.estado === 'respaldado' && c.comprobante_ruta === 'carpeta1/t3.jpg', r.error);
r = await anon(`select pedido_boleta($1, $2, 'carpeta1/z2-boleta.jpg', 'boleta.jpg')`, ['tok-pedir', parlantes]);
ok('La boleta se sube igual después del comprobante', !r.error && (await item('tok-pedir', parlantes)).estado === 'respaldado', r.error);
r = await db.query(`select string_agg(comentario, ' > ' order by id) as c from pedido_item_eventos where item_id = $1 and por = 'hacienda' and comentario like 'Comprobante%'`, [parlantes]);
ok('El historial registra el comprobante y su reemplazo', r.rows[0].c === 'Comprobante de transferencia adjunto > Comprobante de transferencia reemplazado', r.rows[0].c);

console.log('\nHacienda edita y elimina');
const editar = (token, id, quien, que, monto) =>
  anon('select pedido_editar($1, $2, $3, $4, $5)', [token, id, quien, que, monto]);
const eliminar = (token, id) => anon('select pedido_eliminar($1, $2)', [token, id]);
r = await editar('tok-pedir', carne, 'Pancho', 'Carne y carbón', 200000);
ok('Con el link de pedir no se edita', /Solo Hacienda/.test(r.error ?? ''), r.error);
r = await editar('tok-otro-h', carne, 'Pancho', 'Carne y carbón', 200000);
ok('Hacienda de otro pedido tampoco', /no está en este pedido/.test(r.error ?? ''), r.error);
r = await editar('tok-hacienda', carne, 'Pancho', '  ', 200000);
ok('No se deja la glosa vacía', /qué se compra/.test(r.error ?? ''), r.error);
r = await editar('tok-hacienda', carne, 'Pancho', 'Carne', 0);
ok('…ni el monto en cero', /monto/.test(r.error ?? ''), r.error);
r = await editar('tok-hacienda', carne, 'Pancho', 'Carne y carbón', 200000);
c = await item('tok-pedir', carne);
ok('Hacienda cambia glosa y monto sin tocar el estado ni los respaldos',
   !r.error && c.que === 'Carne y carbón' && c.monto === 200000 && c.estado === 'respaldado' && c.boleta_ruta === 'carpeta1/z-boleta.jpg', r.error);
r = await db.query(`select comentario from pedido_item_eventos where item_id = $1 order by id desc limit 1`, [carne]);
ok('El historial guarda el valor anterior', r.rows[0].comentario === 'Editado por Hacienda · glosa: Carne → Carne y carbón · monto: 187500 → 200000', r.rows[0].comentario);
let n = (await db.query(`select count(*)::int n from pedido_item_eventos where item_id = $1`, [carne])).rows[0].n;
await editar('tok-hacienda', carne, 'Pancho', 'Carne y carbón', 200000);
ok('Guardar sin cambios no anota nada', (await db.query(`select count(*)::int n from pedido_item_eventos where item_id = $1`, [carne])).rows[0].n === n);

r = await agregar('tok-pedir', 'Tito', 'Compra de prueba', 9990, 'carpeta1/p-cot.pdf', 'x', null);
const prueba = r.rows[0]?.id;
r = await eliminar('tok-pedir', prueba);
ok('Con el link de pedir no se elimina', /Solo Hacienda/.test(r.error ?? ''), r.error);
r = await eliminar('tok-otro-h', prueba);
ok('Hacienda de otro pedido tampoco', /no está en este pedido/.test(r.error ?? ''), r.error);
r = await eliminar('tok-hacienda', prueba);
ok('Hacienda elimina una compra', !r.error, r.error);
ok('…y deja de verse en los dos links', !(await item('tok-pedir', prueba)) && !(await item('tok-hacienda', prueba)) && (await ver('tok-pedir')).items.length === 2);
r = await db.query(`select estado, cotizacion_ruta from pedido_items where id = $1`, [prueba]);
ok('…pero sigue guardada en la base con su respaldo', r.rows[0]?.estado === 'eliminado' && r.rows[0].cotizacion_ruta === 'carpeta1/p-cot.pdf');
r = await revisar('tok-hacienda', prueba, 'aprobar');
ok('Una compra eliminada no se puede aprobar', !!r.error);
r = await editar('tok-hacienda', prueba, 'Tito', 'Otra cosa', 100);
ok('…ni editar', /no está en este pedido/.test(r.error ?? ''), r.error);
r = await comprobante('tok-hacienda', prueba, 'carpeta1/t9.jpg');
ok('…ni recibir comprobante', !!r.error);
r = await eliminar('tok-hacienda', prueba);
ok('…ni eliminar dos veces', /no está en este pedido/.test(r.error ?? ''), r.error);
r = await eliminar('tok-hacienda', parlantes);
ok('También se elimina una compra con la plata ya entregada', !r.error && (await ver('tok-pedir')).items.length === 1, r.error);
r = await db.query(`select de_estado || ' > ' || a_estado as paso from pedido_item_eventos where item_id = $1 order by id desc limit 1`, [parlantes]);
ok('El historial dice desde qué estado se eliminó', r.rows[0].paso === 'respaldado > eliminado', r.rows[0].paso);

await db.exec(`update pedidos set abierto = false where token = 'tok-pedir'`);
r = await agregar('tok-pedir', 'Tito', 'Hielo', 5000, 'carpeta1/h.pdf', 'x', null);
ok('A un pedido cerrado no se le agregan compras', /cerrado/.test(r.error ?? ''), r.error);
r = await anon(`select pedido_carpeta_abierta('carpeta1') as a, pedido_carpeta_abierta('carpeta2') as b`);
ok('…ni se le pueden subir archivos', r.rows[0]?.a === false && r.rows[0]?.b === true);

console.log(`\n${pass} pruebas pasaron, ${fail} fallaron.`);
process.exit(fail ? 1 : 0);
