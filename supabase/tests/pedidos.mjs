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

// ---------------------------------------------------------------------------
console.log('\nComprobantes privados (0017)');
// Storage de Supabase simulado: buckets, archivos y sus reglas de acceso.
await db.exec(`
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, metadata jsonb);
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql immutable as $$
    select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
  grant usage on schema storage to anon, authenticated;
  grant select, insert on storage.objects to anon, authenticated;
  create or replace function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
`);
await db.exec(mig('0017_comprobantes_privados.sql'));
r = await db.query(`select count(*)::int as n from pedido_items where comprobante_ruta is not null`);
ok('Los comprobantes que estaban en el bucket público se desenlazan', r.rows[0].n === 0, JSON.stringify(r.rows));
r = await db.query(`select count(*)::int as n from pedido_item_eventos where comentario like 'Comprobante quitado%'`);
ok('…y queda anotado en el historial', r.rows[0].n === 2, JSON.stringify(r.rows));
r = await db.query(`select public from storage.buckets where id = 'comprobantes'`);
ok('El bucket de comprobantes es privado', r.rows[0]?.public === false);

const CLUB = '10000000-0000-0000-0000-000000000001';
const U = { admin: '00000000-0000-0000-0000-0000000000a1', teso: '00000000-0000-0000-0000-0000000000a2',
            presi: '00000000-0000-0000-0000-0000000000a3', jugador: '00000000-0000-0000-0000-0000000000a4' };
await db.exec(`
  insert into auth.users (id, email) values ${Object.entries(U).map(([k, id]) => `('${id}', '${k}@correo.cl')`).join(', ')};
  insert into equipos (id, club_id, nombre, orden) values ('40000000-0000-0000-0000-000000000001', '${CLUB}', 'Plantel de prueba', 1);
  insert into personas (id, club_id, nombre, es_admin, user_id, ve_comprobantes) values
    ('20000000-0000-0000-0000-0000000000a1', '${CLUB}', 'Admin Prueba', true, '${U.admin}', false),
    ('20000000-0000-0000-0000-0000000000a2', '${CLUB}', 'Tesorero Prueba', false, '${U.teso}', false),
    ('20000000-0000-0000-0000-0000000000a3', '${CLUB}', 'Presidente Prueba', false, '${U.presi}', true),
    ('20000000-0000-0000-0000-0000000000a4', '${CLUB}', 'Jugador Prueba', false, '${U.jugador}', false);
  insert into persona_equipos (persona_id, equipo_id, rol) values
    ('20000000-0000-0000-0000-0000000000a2', '40000000-0000-0000-0000-000000000001', 'tesorero'),
    ('20000000-0000-0000-0000-0000000000a4', '40000000-0000-0000-0000-000000000001', 'jugador');
`);
async function como(quien, sql, params = []) {
  await db.exec('set role authenticated');
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [U[quien]]);
  try { const r = await db.query(sql, params); return { rows: r.rows, error: null }; }
  catch (e) { return { rows: [], error: e.message }; }
  finally { await db.exec('reset role'); await db.query(`select set_config('request.jwt.claim.sub', '', false)`); }
}

r = await anon(`insert into storage.objects (bucket_id, name) values ('comprobantes', 'carpeta1/c0.jpg')`);
ok('No se suben comprobantes a un pedido cerrado', !!r.error);
r = await anon(`insert into storage.objects (bucket_id, name) values ('comprobantes', 'carpeta2/c1.jpg')`);
ok('Con el link se sube un comprobante a un pedido abierto, sin cuenta', !r.error, r.error);
r = await agregar('tok-otro', 'Lalo', 'Conos', 30000, 'carpeta2/cot.pdf', 'https://x.cl', null);
const conos = r.rows[0]?.id;
await revisar('tok-otro-h', conos, 'aprobar');
await db.query(`insert into storage.objects (bucket_id, name) values ('pedidos', 'carpeta2/publico.jpg')`);
r = await comprobante('tok-otro-h', conos, 'carpeta2/publico.jpg');
ok('Un comprobante guardado en el bucket público se rechaza', /Falta el archivo/.test(r.error ?? ''), r.error);
r = await comprobante('tok-otro-h', conos, 'carpeta2/c1.jpg');
ok('Hacienda adjunta el comprobante privado', !r.error, r.error);

const cuantos = async (quien) => {
  const sql = `select count(*)::int as n from storage.objects where bucket_id = 'comprobantes'`;
  const x = quien ? await como(quien, sql) : await anon(sql);
  return x.rows[0]?.n ?? x.error;
};
ok('Sin cuenta no se abre el archivo', (await cuantos(null)) === 0);
ok('Un jugador tampoco', (await cuantos('jugador')) === 0);
ok('Un tesorero sí', (await cuantos('teso')) === 1);
ok('Quien tiene el permiso personal (por ejemplo, el presidente) sí', (await cuantos('presi')) === 1);
ok('Un administrador sí', (await cuantos('admin')) === 1);

const deConos = (x) => x.items.find((i) => i.id === conos);
p = await ver('tok-otro');
ok('Con el link de pedir y sin cuenta no llega la ruta', deConos(p).comprobante_ruta === null && deConos(p).con_comprobante && p.puedo_ver_comprobantes === false);
p = (await como('teso', `select pedido_ver('tok-otro') as p`)).rows[0]?.p;
ok('Un tesorero con su cuenta recibe la ruta, aun con el link de pedir', deConos(p).comprobante_ruta === 'carpeta2/c1.jpg' && p.puedo_ver_comprobantes === true, JSON.stringify(p));
p = await ver('tok-otro-h');
ok('Con el link de Hacienda y sin cuenta llega la ruta, pero la app sabe que no puede abrirla', deConos(p).comprobante_ruta === 'carpeta2/c1.jpg' && p.puedo_ver_comprobantes === false);

// ---------------------------------------------------------------------------
console.log('\nCompras en la app (0019)');
Object.assign(U, { hacienda: '00000000-0000-0000-0000-0000000000b1', socio: '00000000-0000-0000-0000-0000000000b2',
                   socio2: '00000000-0000-0000-0000-0000000000b3', vecompras: '00000000-0000-0000-0000-0000000000b4' });
const PER = { teso: '20000000-0000-0000-0000-0000000000a2', presi: '20000000-0000-0000-0000-0000000000a3',
              hacienda: '20000000-0000-0000-0000-0000000000b1', socio: '20000000-0000-0000-0000-0000000000b2',
              socio2: '20000000-0000-0000-0000-0000000000b3', vecompras: '20000000-0000-0000-0000-0000000000b4' };
await db.exec(`
  insert into auth.users (id, email) values ${['hacienda', 'socio', 'socio2', 'vecompras'].map((k) => `('${U[k]}', '${k}@correo.cl')`).join(', ')};
  insert into personas (id, club_id, nombre, user_id) values
    ('${PER.hacienda}', '${CLUB}', 'Hacienda Prueba', '${U.hacienda}'),
    ('${PER.socio}', '${CLUB}', 'Socio Prueba', '${U.socio}'),
    ('${PER.socio2}', '${CLUB}', 'Otro Socio Prueba', '${U.socio2}'),
    ('${PER.vecompras}', '${CLUB}', 'Revisor Prueba', '${U.vecompras}');
  insert into areas (id, club_id, nombre, aprueba_compras) values ('30000000-0000-0000-0000-000000000001', '${CLUB}', 'Hacienda', true);
  insert into persona_areas (persona_id, area_id, rol) values ('${PER.hacienda}', '30000000-0000-0000-0000-000000000001', 'ministro');
`);
await db.exec(mig('0019_compras_en_la_app.sql'));
await db.query(`update personas set ve_compras = true where id = $1`, [PER.vecompras]);

r = await db.query(`select nombre, topico, abierto from pedidos order by creado_en`);
const lista = (nombre) => r.rows.find((x) => x.nombre === nombre);
ok('Las listas con "20 años" en el nombre quedan en 20 años y el resto en General',
   lista('Fiesta 20 años')?.topico === 'veinte_anos' && lista('Otro evento')?.topico === 'general', JSON.stringify(r.rows));
ok('Se crea una lista abierta de cada tópico que no tenía ninguna abierta',
   r.rows.filter((x) => x.abierto && x.topico === 'fondo').length === 1
   && r.rows.filter((x) => x.abierto && x.topico === 'veinte_anos').length === 1
   && r.rows.filter((x) => x.abierto && x.topico === 'general').length === 1
   && !lista('Compras generales'), JSON.stringify(r.rows));
r = await db.query(`select ve_compras from personas where id = $1`, [PER.presi]);
ok('Quien tenía ve_comprobantes queda también con ve_compras', r.rows[0]?.ve_compras === true);

const compras = async (quien) => { const x = await como(quien, 'select compras_ver() as c'); return x.error ? { error: x.error } : x.rows[0].c; };
const listaOtro = (await db.query(`select id from pedidos where token = 'tok-otro'`)).rows[0].id;
const pedirApp = (quien, que, monto = 10000, pedido = listaOtro) =>
  como(quien, `select compra_agregar($1, $2, $3, 'carpeta2/cot-app.pdf', 'cot.pdf', 'https://x.cl') as id`, [pedido, que, monto]);

r = await anon(`select compras_ver()`);
ok('Sin cuenta no se ven las compras de la app', /permission denied/.test(r.error ?? ''), r.error);
r = await anon(`select compra_agregar($1, 'x', 1, 'carpeta2/a.pdf', 'a.pdf', 'https://x.cl')`, [listaOtro]);
ok('…ni se piden', /permission denied/.test(r.error ?? ''), r.error);
r = await pedirApp('socio', 'Pelotas');
const pelotas = r.rows[0]?.id;
ok('Un socio pide una compra desde la app', !!pelotas, r.error);
await pedirApp('socio2', 'Petos');
r = await pedirApp('teso', 'Botiquín');
const botiquin = r.rows[0]?.id;
r = await db.query(`select quien, persona_id from pedido_items where id = $1`, [pelotas]);
ok('La compra queda a nombre de la cuenta', r.rows[0]?.quien === 'Socio Prueba' && r.rows[0].persona_id === PER.socio, JSON.stringify(r.rows));
r = await db.query(`select persona_id from pedido_item_eventos where item_id = $1`, [pelotas]);
ok('El historial anota quién la pidió', r.rows[0]?.persona_id === PER.socio);

const todas = (await db.query(`select count(*)::int n from pedido_items where estado <> 'eliminado'`)).rows[0].n;
let vc = await compras('socio');
ok('Un socio no ve compras ajenas: solo la suya', vc.items.length === 1 && vc.items[0].que === 'Pelotas' && vc.items[0].es_mia && vc.ve_todas === false, JSON.stringify(vc.items.map((i) => i.que)));
ok('…ni recibe el link de las listas', vc.listas.length > 0 && vc.listas.every((l) => l.token === null) && !JSON.stringify(vc).includes('tok-'));
vc = await compras('teso');
ok('Un tesorero de plantel solo ve las suyas', vc.items.length === 1 && vc.items[0].que === 'Botiquín' && vc.ve_todas === false, JSON.stringify(vc.items.map((i) => i.que)));
vc = await compras('vecompras');
const deConosApp = vc.items.find((i) => i.id === conos);
ok('Quien tiene ve_compras ve todas, también las que llegaron por link',
   vc.ve_todas === true && vc.items.length === todas && !!deConosApp, JSON.stringify(vc.items.map((i) => i.que)));
ok('…pero sin ve_comprobantes no recibe la ruta del comprobante', deConosApp.con_comprobante === true && deConosApp.comprobante_ruta === null && vc.puedo_ver_comprobantes === false);
ok('…ni puede abrir el archivo', (await cuantos('vecompras')) === 0);
ok('…ni es Hacienda', vc.es_hacienda === false && vc.listas.every((l) => l.token === null));
vc = await compras('presi');
ok('Con ve_compras y ve_comprobantes ve todas y recibe la ruta', vc.items.length === todas && vc.items.find((i) => i.id === conos).comprobante_ruta === 'carpeta2/c1.jpg');
vc = await compras('hacienda');
ok('Hacienda ve todas y recibe el link de pedir de cada lista',
   vc.es_hacienda && vc.items.length === todas && vc.listas.find((l) => l.id === listaOtro)?.token === 'tok-otro', JSON.stringify(vc.listas));
ok('…pero no el link de Hacienda', !JSON.stringify(vc).includes('tok-otro-h'));

r = await como('socio', `select compra_revisar($1, 'aprobar')`, [pelotas]);
ok('Un socio no aprueba', /Solo Hacienda/.test(r.error ?? ''), r.error);
r = await como('vecompras', `select compra_revisar($1, 'aprobar')`, [pelotas]);
ok('Quien solo ve todas tampoco', /Solo Hacienda/.test(r.error ?? ''), r.error);
r = await como('hacienda', `select compra_revisar($1, 'devolver', 'Falta otra cotización')`, [pelotas]);
ok('Hacienda devuelve con motivo desde la app', !r.error, r.error);
r = await db.query(`select por, persona_id from pedido_item_eventos where item_id = $1 order by id desc limit 1`, [pelotas]);
ok('…y el historial dice quién de Hacienda fue', r.rows[0]?.por === 'hacienda' && r.rows[0].persona_id === PER.hacienda, JSON.stringify(r.rows));
r = await como('socio2', `select compra_corregir($1, 'Pelotas', 12000, 'carpeta2/cot2.pdf', 'cot2.pdf', 'https://x.cl')`, [pelotas]);
ok('Otro socio no corrige una compra ajena', /Solo quien pidió/.test(r.error ?? ''), r.error);
r = await como('socio', `select compra_corregir($1, 'Pelotas n° 5', 12000, 'carpeta2/cot2.pdf', 'cot2.pdf', 'https://x.cl')`, [pelotas]);
ok('Quien la pidió la corrige y vuelve a quedar por revisar', !r.error && (await compras('socio')).items[0].estado === 'pendiente', r.error);
r = await como('hacienda', `select compra_revisar($1, 'aprobar')`, [pelotas]);
await db.query(`insert into storage.objects (bucket_id, name) values ('comprobantes', 'carpeta2/c-app.jpg')`);
r = await como('socio', `select compra_comprobante($1, 'carpeta2/c-app.jpg', 'transferencia.jpg')`, [pelotas]);
ok('Un socio no sube el comprobante', /Solo Hacienda/.test(r.error ?? ''), r.error);
r = await como('hacienda', `select compra_comprobante($1, 'carpeta2/c-app.jpg', 'transferencia.jpg')`, [pelotas]);
ok('Hacienda entrega con comprobante desde la app', !r.error && (await compras('socio')).items[0].estado === 'entregado', r.error);
ok('El socio ve que hay comprobante, pero sin la ruta', (await compras('socio')).items[0].con_comprobante && (await compras('socio')).items[0].comprobante_ruta === null);
r = await como('socio2', `select compra_boleta($1, 'carpeta2/boleta.jpg', 'boleta.jpg')`, [pelotas]);
ok('Otro socio no sube la boleta', /Solo quien pidió/.test(r.error ?? ''), r.error);
r = await como('socio', `select compra_boleta($1, 'carpeta2/boleta.jpg', 'boleta.jpg')`, [pelotas]);
ok('Quien la pidió sube la boleta', !r.error && (await compras('socio')).items[0].estado === 'respaldado', r.error);
r = await como('vecompras', `select compra_editar($1, 'X', 'Y', 1)`, [botiquin]);
ok('Quien solo ve todas no edita', /Solo Hacienda/.test(r.error ?? ''), r.error);
r = await como('hacienda', `select compra_editar($1, 'Tesorero Prueba', 'Botiquín completo', 25000)`, [botiquin]);
ok('Hacienda edita glosa y monto desde la app', !r.error && (await compras('teso')).items[0].monto === 25000, r.error);
r = await como('hacienda', `select compra_eliminar($1)`, [botiquin]);
ok('Hacienda elimina, y deja de verse', !r.error && (await compras('teso')).items.length === 0, r.error);

// El link sin cuenta sigue funcionando igual, sobre los mismos datos.
p = await ver('tok-otro');
ok('Por el link se ven las compras pedidas en la app, con el nombre de la cuenta',
   p.items.some((i) => i.id === pelotas && i.quien === 'Socio Prueba' && i.estado === 'respaldado'), JSON.stringify(p.items.map((i) => i.quien)));
ok('…con las mismas columnas de siempre', !('persona_id' in p.items[0]) && !('es_mia' in p.items[0]));
r = await agregar('tok-otro', 'Visita', 'Agua', 5000, 'carpeta2/cot.pdf', 'https://x.cl', null);
const agua = r.rows[0]?.id;
ok('Por el link se sigue agregando sin cuenta', !!agua, r.error);
r = await revisar('tok-otro-h', agua, 'aprobar');
ok('…y Hacienda sigue aprobando con su link', !r.error, r.error);
vc = await compras('hacienda');
ok('Lo pedido por link aparece en la app de Hacienda', vc.items.some((i) => i.id === agua && i.estado === 'aprobado' && !i.es_mia));
ok('…pero no en la de un socio', !(await compras('socio')).items.some((i) => i.id === agua));

// Hacienda corrige el tópico de una lista y la cierra.
r = await como('socio', `select lista_compras_cambiar($1, 'fondo', false)`, [listaOtro]);
ok('Un socio no cambia una lista', /Solo Hacienda/.test(r.error ?? ''), r.error);
r = await como('hacienda', `select lista_compras_cambiar($1, 'otro', true)`, [listaOtro]);
ok('No se acepta un tópico inventado', /no existe/.test(r.error ?? ''), r.error);
r = await como('hacienda', `select lista_compras_cambiar($1, 'fondo', false)`, [listaOtro]);
ok('Hacienda cambia el tópico y cierra la lista', !r.error && (await compras('hacienda')).listas.some((l) => l.id === listaOtro && l.topico === 'fondo' && !l.abierto), r.error);
r = await pedirApp('socio', 'Conos nuevos');
ok('A una lista cerrada no se le piden compras desde la app', /cerrado/.test(r.error ?? ''), r.error);
r = await agregar('tok-otro', 'Visita', 'Hielo', 5000, 'carpeta2/cot.pdf', 'https://x.cl', null);
ok('…ni por el link', /cerrado/.test(r.error ?? ''), r.error);
ok('Una lista cerrada le aparece a quien tiene compras en ella', (await compras('socio2')).listas.some((l) => l.id === listaOtro));
ok('…y no a quien no tiene', !(await compras('jugador')).listas.some((l) => l.id === listaOtro));
r = await como('hacienda', `select lista_compras_cambiar($1, 'general', true)`, [listaOtro]);
ok('Y la puede volver a abrir', !r.error && !(await pedirApp('socio', 'Conos nuevos')).error, r.error);
r = await como('socio', `select count(*) from pedido_items`);
ok('Las tablas de compras siguen sin leerse directamente', /permission denied/.test(r.error ?? ''), r.error);

// ---------------------------------------------------------------------------
console.log('\nCompras por tópico (0020)');
let x;
const falla = async (sql, params = []) => { try { await db.query(sql, params); return null; } catch (e) { return e.message; } };
const obj = (nombre, mime = 'application/pdf', size = 1000, bucket = 'pedidos') =>
  db.query(`insert into storage.objects (bucket_id, name, metadata) values ($1, $2, $3::jsonb)`,
           [bucket, nombre, JSON.stringify({ mimetype: mime, size })]);
const conteo = async (tabla) => (await db.query(`select count(*)::int n from ${tabla}`)).rows[0].n;
const antes = { pedidos: await conteo('pedidos'), items: await conteo('pedido_items') };

// Una base nueva con todo hasta la 0019, para probar que la 0020 no elige entre dos listas.
async function baseHasta0019() {
  const d = new PGlite();
  await d.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth; create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
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
  for (const f of ['0001_base.sql', '0002_cotizaciones.sql', '0004_funciones_de_trigger_privadas.sql', '0005_pedidos_de_compra.sql',
                   '0007_comprobante_de_transferencia.sql', '0008_hacienda_edita_y_elimina.sql', '0017_comprobantes_privados.sql',
                   '0019_compras_en_la_app.sql']) await d.exec(mig(f));
  await d.exec(`insert into clubes (id, nombre, slug) values ('${CLUB}', 'Hugo Jara', 'hugo-jara')`);
  return d;
}
let otra = await baseHasta0019();
await otra.exec(`update pedidos set abierto = false`);
await otra.exec(`insert into pedidos (club_id, nombre, topico) values ('${CLUB}', 'Fiesta 20 años', 'veinte_anos'), ('${CLUB}', 'Fiesta 20 años', 'veinte_anos')`);
r = await otra.exec(mig('0020_compras_por_topico.sql')).then(() => ({ error: null }), (e) => ({ error: e.message }));
ok('Si hay dos listas abiertas del mismo tópico, la migración falla en vez de elegir una', /duplicate key|unique/i.test(r.error ?? ''), r.error);
r = await otra.query(`select count(*)::int n from information_schema.tables where table_name = 'topicos'`);
ok('…y no deja nada a medias', r.rows[0].n === 0);
otra = await baseHasta0019();
await otra.exec(mig('0020_compras_por_topico.sql'));
r = await otra.query(`select count(*)::int n from pedidos where abierto and topico = 'veinte_anos'`);
ok('En una base sin listas, la migración crea la lista abierta del tópico activo', r.rows[0].n === 1);

await db.exec(mig('0020_compras_por_topico.sql'));

// Tópicos y listas
r = await db.query(`select slug, activo, length(token_envio) as largo from topicos order by slug`);
ok('Queda un solo tópico activo (Fiesta 20 años); General y Fondo, inactivos',
   JSON.stringify(r.rows.map((x) => [x.slug, x.activo])) === JSON.stringify([['fondo', false], ['general', false], ['veinte_anos', true]]), JSON.stringify(r.rows));
ok('Los códigos del link público son largos y distintos', r.rows.every((x) => x.largo === 64)
   && (await db.query(`select count(distinct token_envio)::int n from topicos`)).rows[0].n === 3);
r = await db.query(`select nombre, abierto, archivado from pedidos`);
ok('Se archivan todas las listas menos las de "Fiesta 20 años"',
   r.rows.some((x) => x.archivado) && r.rows.filter((x) => !x.archivado).every((x) => x.nombre === 'Fiesta 20 años')
   && r.rows.filter((x) => x.archivado).every((x) => !x.abierto), JSON.stringify(r.rows));
ok('…y no se borra ninguna lista ni compra', (await conteo('pedidos')) === antes.pedidos && (await conteo('pedido_items')) === antes.items);
const abiertas = async (slug) => (await db.query(`select count(*)::int n from pedidos where abierto and topico = $1`, [slug])).rows[0].n;
ok('Hay una lista abierta por cada tópico activo y ninguna de los inactivos',
   (await abiertas('veinte_anos')) === 1 && (await abiertas('general')) === 0 && (await abiertas('fondo')) === 0);
x = await falla(`insert into pedidos (club_id, nombre, topico) values ($1, 'Otra lista', 'veinte_anos')`, [CLUB]);
ok('La base no deja abrir una segunda lista del mismo tópico', /duplicate key|unique/i.test(x ?? ''), x);
x = await falla(`insert into pedidos (club_id, nombre, topico) values ($1, 'Rara', 'inventado')`, [CLUB]);
ok('Ni una lista de un tópico que no existe', /foreign key|violates/i.test(x ?? ''), x);
r = await anon(`select count(*) from topicos`);
ok('Los tópicos no se leen directamente', /permission denied/.test(r.error ?? ''), r.error);

const tok = Object.fromEntries((await db.query(`select slug, token_envio from topicos`)).rows.map((x) => [x.slug, x.token_envio]));
const publico = (t) => anon(`select topico_publico($1) as p`, [t]);
r = await publico(tok.veinte_anos);
const pubVeinte = r.rows[0]?.p;
const carpetaV = pubVeinte?.carpeta;
ok('El link público abre el formulario del tópico: solo su nombre y la carpeta para subir',
   pubVeinte?.nombre === 'Fiesta 20 años' && !!carpetaV && Object.keys(pubVeinte).sort().join() === 'carpeta,nombre', JSON.stringify(pubVeinte));
const codigos = (await db.query(`select token, token_hacienda from pedidos`)).rows.flatMap((x) => [x.token, x.token_hacienda]);
ok('…sin compras ni códigos de ninguna lista', !codigos.some((c) => JSON.stringify(pubVeinte).includes(c)));
r = await publico('inventado');
ok('Un código inventado no abre nada', /no es válido/.test(r.error ?? ''), r.error);
r = await publico(tok.general);
ok('El link de un tópico inactivo no recibe solicitudes', /ya no recibe/.test(r.error ?? ''), r.error);
r = await anon(`select pedido_ver($1)`, [tok.veinte_anos]);
ok('El código del link público no sirve para leer un pedido', /no es válido/.test(r.error ?? ''), r.error);

// Enviar sin cuenta
const enviar = (t, o = {}) => anon(`select topico_enviar($1, $2, $3, $4, $5, 'cot.pdf', $6, $7, $8)`,
  [t, o.quien ?? 'Visita Prueba', o.que ?? 'Cinta y bolsas', o.monto ?? 12000,
   o.cot !== undefined ? o.cot : `${carpetaV}/cot.pdf`, o.ref ?? null, o.refRuta ?? null, o.refRuta ? 'ref.pdf' : null]);
await obj(`${carpetaV}/cot.pdf`);
r = await enviar(tok.veinte_anos);
ok('Sin cuenta se envía una solicitud, con la referencia vacía', !r.error, r.error);
ok('…y no devuelve nada: quien envía no ve su solicitud', [null, ''].includes(r.rows[0]?.topico_enviar), JSON.stringify(r.rows));
const nueva = (await compras('hacienda')).items.find((i) => i.que === 'Cinta y bolsas');
ok('Hacienda la ve en el tópico, pendiente y sin cuenta de por medio',
   nueva?.quien === 'Visita Prueba' && nueva.topico === 'veinte_anos' && nueva.estado === 'pendiente' && nueva.es_mia === false, JSON.stringify(nueva));
ok('Un socio no la ve', !(await compras('socio')).items.some((i) => i.que === 'Cinta y bolsas'));
r = await db.query(`select persona_id from pedido_items where que = 'Cinta y bolsas'`);
ok('Queda sin persona: se pidió sin cuenta', r.rows[0]?.persona_id === null);

// Lo que el link público no puede hacer
r = await enviar('inventado');
ok('Con un código inventado no se envía', /no es válido/.test(r.error ?? ''), r.error);
r = await enviar(tok.general);
ok('No se envía a un tópico inactivo', /ya no recibe/.test(r.error ?? ''), r.error);
r = await enviar(tok.fondo);
ok('…ni a Fondo, que todavía no está activo', /ya no recibe/.test(r.error ?? ''), r.error);
await obj('carpeta2/de-otra-lista.pdf');
r = await enviar(tok.veinte_anos, { cot: 'carpeta2/de-otra-lista.pdf' });
ok('No se acepta un archivo guardado en otra lista', /Falta adjuntar la cotización/.test(r.error ?? ''), r.error);
r = await enviar(tok.veinte_anos, { cot: null });
ok('La cotización es obligatoria', /Falta adjuntar la cotización/.test(r.error ?? ''), r.error);
r = await enviar(tok.veinte_anos, { cot: `${carpetaV}/no-subida.pdf` });
ok('…y el archivo tiene que estar de verdad subido', /Falta adjuntar la cotización/.test(r.error ?? ''), r.error);
for (const fn of ['pedido_agregar', 'pedido_corregir', 'pedido_boleta', 'pedido_revisar']) {
  const args = { pedido_agregar: `'x', 'Visita', 'Cosa', 1000, '${carpetaV}/cot.pdf', 'c.pdf'`,
                 pedido_corregir: `'x', '${nueva.id}', 'Visita', 'Cosa', 1000, '${carpetaV}/cot.pdf', 'c.pdf'`,
                 pedido_boleta: `'x', '${nueva.id}', '${carpetaV}/b.pdf', 'b.pdf'`, pedido_revisar: `'x', '${nueva.id}', 'aprobar'` }[fn];
  r = await anon(`select ${fn}(${args})`);
  ok(`${fn} con un código inventado se rechaza`, /no es válido|Solo Hacienda/.test(r.error ?? ''), r.error);
}
r = await anon(`select count(*) from pedido_items`);
ok('Las tablas de compras siguen cerradas', /permission denied/.test(r.error ?? ''), r.error);

// Límites
const largo = (n) => 'a'.repeat(n);
r = await enviar(tok.veinte_anos, { quien: largo(81) });
ok('Un nombre de más de 80 letras se rechaza', /nombre es demasiado largo/.test(r.error ?? ''), r.error);
r = await enviar(tok.veinte_anos, { quien: '   ' });
ok('…y sin nombre tampoco', /Falta tu nombre/.test(r.error ?? ''), r.error);
r = await enviar(tok.veinte_anos, { quien: largo(80), que: largo(200), ref: largo(300) });
ok('80, 200 y 300 letras justas se aceptan', !r.error, r.error);
r = await enviar(tok.veinte_anos, { que: largo(201) });
ok('Qué: más de 200 letras se rechaza', /descripción es demasiado larga/.test(r.error ?? ''), r.error);
r = await enviar(tok.veinte_anos, { ref: largo(301) });
ok('Referencia: más de 300 letras se rechaza', /referencia es demasiado larga/.test(r.error ?? ''), r.error);
r = await enviar(tok.veinte_anos, { monto: 5000001 });
ok('Un monto sobre $5.000.000 se rechaza', /demasiado alto/.test(r.error ?? ''), r.error);
r = await enviar(tok.veinte_anos, { monto: 5000000 });
ok('…y $5.000.000 justos se acepta', !r.error, r.error);
for (const m of [0, -5]) {
  r = await enviar(tok.veinte_anos, { monto: m });
  ok(`Un monto de ${m} se rechaza`, /mayor que cero/.test(r.error ?? ''), r.error);
}
const subida = async (nombre, mime, size) => { await obj(`${carpetaV}/${nombre}`, mime, size); return `${carpetaV}/${nombre}`; };
for (const [nombre, mime, size] of [['a.zip', 'application/zip', 1000], ['a.html', 'text/html', 1000], ['a.exe', 'application/x-msdownload', 1000],
                                   ['a.svg', 'image/svg+xml', 1000], ['a.gif', 'image/gif', 1000]]) {
  r = await enviar(tok.veinte_anos, { cot: await subida(nombre, mime, size) });
  ok(`Una cotización ${mime} se rechaza: solo PDF y fotos`, /PDF o una foto/.test(r.error ?? ''), r.error);
}
r = await enviar(tok.veinte_anos, { cot: await subida('grande.pdf', 'application/pdf', 10485761) });
ok('Una cotización de más de 10 MB se rechaza', /10 MB/.test(r.error ?? ''), r.error);
r = await enviar(tok.veinte_anos, { cot: await subida('vacio.pdf', 'application/pdf', 0) });
ok('…y un archivo vacío también', /PDF o una foto/.test(r.error ?? ''), r.error);
for (const [nombre, mime, size] of [['justo.pdf', 'application/pdf', 10485760], ['foto.jpg', 'image/jpeg', 2000], ['foto.png', 'image/png', 2000],
                                   ['foto.webp', 'image/webp', 2000], ['foto.heic', 'image/heic', 2000]]) {
  r = await enviar(tok.veinte_anos, { cot: await subida(nombre, mime, size) });
  ok(`Una cotización ${mime} de ${size} bytes se acepta`, !r.error, r.error);
}
r = await enviar(tok.veinte_anos, { refRuta: await subida('ref.zip', 'application/zip', 1000) });
ok('El archivo de referencia tiene los mismos límites', /archivo de referencia tiene que ser/.test(r.error ?? ''), r.error);
r = await enviar(tok.veinte_anos, { refRuta: await subida('ref.png', 'image/png', 1000) });
ok('…y con una foto se acepta', !r.error, r.error);

// Los links viejos por lista
r = await anon(`select pedido_ver('tok-otro')`);
ok('El link viejo de pedir ya no deja leer la lista', /ya no recibe solicitudes/.test(r.error ?? ''), r.error);
r = await anon(`select pedido_ver('tok-pedir')`);
ok('…en ninguna de las listas', /ya no recibe solicitudes/.test(r.error ?? ''), r.error);
r = await agregar('tok-otro', 'Visita', 'Agua', 5000, 'carpeta2/cot.pdf', 'https://x.cl', null);
ok('…ni deja pedir', /ya no recibe solicitudes/.test(r.error ?? ''), r.error);
r = await anon(`select pedido_corregir('tok-otro', $1, 'Visita', 'Agua', 5000, 'carpeta2/cot.pdf', 'c.pdf')`, [agua]);
ok('…ni corregir', /ya no recibe solicitudes/.test(r.error ?? ''), r.error);
r = await anon(`select pedido_boleta('tok-otro', $1, 'carpeta2/b.pdf', 'b.pdf')`, [agua]);
ok('…ni subir una boleta', /ya no recibe solicitudes/.test(r.error ?? ''), r.error);
p = await ver('tok-otro-h');
ok('El link de Hacienda sigue funcionando igual', p?.es_hacienda === true && p.items.some((i) => i.id === pelotas), JSON.stringify(p));
r = await revisar('tok-otro-h', agua, 'devolver', 'Falta el detalle');
ok('…y Hacienda sigue revisando con su link', !r.error && (await item('tok-otro-h', agua)).estado === 'devuelto', r.error);
r = await anon(`select pedido_editar('tok-otro-h', $1, 'Visita', 'Agua con gas', 6000)`, [agua]);
ok('…y editando', !r.error, r.error);

// La app con cuenta
r = await anon(`select compras_ver()`);
ok('Sin cuenta no se llama a compras_ver', /permission denied/.test(r.error ?? ''), r.error);
r = await anon(`select compra_agregar('veinte_anos', 'x', 1000, 'a/b.pdf', 'b.pdf')`);
ok('…ni a compra_agregar', /permission denied/.test(r.error ?? ''), r.error);
r = await anon(`select topico_cambiar('veinte_anos', false)`);
ok('…ni a topico_cambiar', /permission denied/.test(r.error ?? ''), r.error);
let cv = await compras('socio');
ok('Un socio ve solo el tópico activo, sin el código del link y sin listas',
   cv.topicos.length === 1 && cv.topicos[0].slug === 'veinte_anos' && !cv.topicos[0].token_envio && cv.topicos[0].carpeta === carpetaV && !('listas' in cv), JSON.stringify(cv.topicos));
ok('…y las compras de las listas archivadas ya no le aparecen', !cv.items.some((i) => i.que === 'Pelotas n° 5' || i.que === 'Pelotas'));
cv = await compras('hacienda');
ok('Hacienda ve los tres tópicos, con el código del link público',
   cv.topicos.length === 3 && cv.topicos.find((t) => t.slug === 'veinte_anos').token_envio === tok.veinte_anos
   && cv.topicos.find((t) => t.slug === 'general').carpeta === null, JSON.stringify(cv.topicos));
ok('…y tampoco ve las compras de las listas archivadas', !cv.items.some((i) => i.que === 'Pelotas n° 5'));
cv = await compras('vecompras');
ok('Quien ve todas pero no es Hacienda no recibe el código', cv.topicos.every((t) => !t.token_envio) && cv.topicos.length === 1);
ok('Un tesorero de plantel tampoco', (await compras('teso')).topicos.every((t) => !t.token_envio));

const pedirTopico = (quien, topico, o = {}) => como(quien,
  `select compra_agregar($1, $2, $3, $4, 'cot.pdf', $5) as id`, [topico, o.que ?? 'Petos nuevos', o.monto ?? 15000, `${carpetaV}/cot.pdf`, o.ref ?? null]);
r = await pedirTopico('socio', 'veinte_anos');
const petos = r.rows[0]?.id;
ok('Un socio pide una compra en el tópico, sin referencia', !!petos, r.error);
cv = await compras('socio');
ok('Queda a su nombre y es lo único que ve', cv.items.length === 1 && cv.items[0].id === petos && cv.items[0].es_mia && cv.items[0].quien === 'Socio Prueba' && cv.items[0].topico === 'veinte_anos', JSON.stringify(cv.items));
r = await pedirTopico('socio', 'general');
ok('No se pide en un tópico inactivo', /no recibe solicitudes/.test(r.error ?? ''), r.error);
r = await pedirTopico('socio', 'inventado');
ok('…ni en uno que no existe', /no recibe solicitudes/.test(r.error ?? ''), r.error);
r = await pedirTopico('socio', 'veinte_anos', { monto: 5000001 });
ok('Los límites valen también en la app', /demasiado alto/.test(r.error ?? ''), r.error);
r = await pedirTopico('socio', 'veinte_anos', { que: largo(201) });
ok('…y en los textos', /descripción es demasiado larga/.test(r.error ?? ''), r.error);
r = await como('hacienda', `select compra_revisar($1, 'aprobar')`, [petos]);
ok('Hacienda sigue aprobando desde la app', !r.error, r.error);
r = await como('socio', `select compra_corregir($1, 'Petos', 15000, $2, 'c.pdf')`, [petos, `${carpetaV}/cot.pdf`]);
ok('Una compra aprobada no se corrige', /Solo se puede corregir/.test(r.error ?? ''), r.error);

// Hacienda cierra y reabre un tópico
r = await como('socio', `select topico_cambiar('veinte_anos', false)`);
ok('Un socio no cierra un tópico', /Solo Hacienda/.test(r.error ?? ''), r.error);
r = await como('vecompras', `select topico_cambiar('veinte_anos', false)`);
ok('Quien solo ve todas tampoco', /Solo Hacienda/.test(r.error ?? ''), r.error);
r = await como('hacienda', `select topico_cambiar('inventado', true)`);
ok('No se cambia un tópico que no existe', /no existe/.test(r.error ?? ''), r.error);
r = await como('hacienda', `select topico_cambiar('veinte_anos', false)`);
ok('Hacienda cierra el tópico', !r.error, r.error);
r = await enviar(tok.veinte_anos);
ok('…y el link público deja de recibir', /ya no recibe/.test(r.error ?? ''), r.error);
r = await pedirTopico('socio', 'veinte_anos');
ok('…y la app también', /no recibe solicitudes/.test(r.error ?? ''), r.error);
ok('…y el socio ya no lo ve entre los tópicos, pero conserva su compra',
   (await compras('socio')).topicos.length === 0 && (await compras('socio')).items.some((i) => i.id === petos));
r = await como('hacienda', `select topico_cambiar('veinte_anos', true)`);
r = await enviar(tok.veinte_anos);
ok('Al reabrirlo vuelve a recibir, en la misma lista', !r.error && (await abiertas('veinte_anos')) === 1, r.error);
r = await como('hacienda', `select topico_cambiar('general', true)`);
ok('Al activar un tópico sin lista abierta se crea la suya', !r.error && (await abiertas('general')) === 1, r.error);
r = await publico(tok.general);
ok('…y su link público funciona', !r.error && r.rows[0].p.nombre === 'General', r.error);
await como('hacienda', `select topico_cambiar('general', false)`);
await como('hacienda', `select topico_cambiar('general', true)`);
ok('Cerrarlo y reabrirlo no duplica la lista', (await abiertas('general')) === 1);
await como('hacienda', `select topico_cambiar('general', false)`);
await db.query(`insert into topicos (club_id, slug, nombre) values ($1, 'proyectos', 'Proyectos')`, [CLUB]);
ok('Agregar un tópico nuevo es insertar una fila: su lista abierta se crea sola', (await abiertas('proyectos')) === 1);
r = await como('socio', `select count(*) from topicos`);
ok('Los tópicos siguen sin leerse directamente con cuenta', /permission denied/.test(r.error ?? ''), r.error);

// ---------------------------------------------------------------------------
console.log('\nFondo Las Condes (0021)');
Object.assign(U, { fondo: '00000000-0000-0000-0000-0000000000c1' });
PER.fondo = '20000000-0000-0000-0000-0000000000c1';
await db.exec(`
  insert into auth.users (id, email) values ('${U.fondo}', 'fondo@correo.cl');
  insert into personas (id, club_id, nombre, user_id) values ('${PER.fondo}', '${CLUB}', 'Equipo Fondo Prueba', '${U.fondo}');
`);
await db.exec(mig('0021_fondo.sql'));
await db.query(`update personas set equipo_fondo = true where id = $1`, [PER.fondo]);
const fondo = async (quien) => { const x = await como(quien, 'select fondo_ver() as f'); return x.error ? { error: x.error } : x.rows[0].f; };

r = await db.query(`select slug, aprobado from fondo_items order by orden`);
ok('El presupuesto queda con los cuatro ítems del formulario',
   JSON.stringify(r.rows.map((x) => [x.slug, x.aprobado])) === JSON.stringify([['personal', 637500], ['bienes', 1848000], ['materiales', 0], ['otros', 602000]]), JSON.stringify(r.rows));
r = await db.query(`select activo, nombre from topicos where slug = 'fondo'`);
ok('El tópico Fondo queda activo, con su lista abierta', r.rows[0]?.activo === true && r.rows[0].nombre === 'Fondo Las Condes' && (await abiertas('fondo')) === 1);
r = await db.query(`select public from storage.buckets where id = 'fondo'`);
ok('El bucket del fondo es privado', r.rows[0]?.public === false);

r = await anon(`select fondo_ver()`);
ok('Sin cuenta no se ve el fondo', /permission denied/.test(r.error ?? ''), r.error);
ok('Un socio no ve el fondo', /Solo el equipo del fondo/.test((await fondo('socio')).error ?? ''));
ok('Un tesorero de plantel tampoco', /Solo el equipo del fondo/.test((await fondo('teso')).error ?? ''));
ok('Quien solo ve todas las compras tampoco', /Solo el equipo del fondo/.test((await fondo('vecompras')).error ?? ''));
ok('fondo_acceso dice que no a un socio', (await como('socio', 'select fondo_acceso() as a')).rows[0]?.a === false);
ok('…y que sí al equipo del fondo', (await como('fondo', 'select fondo_acceso() as a')).rows[0]?.a === true);
let f = await fondo('fondo');
ok('El equipo del fondo lo ve, con las tres cuotas de honorarios creadas',
   f.items?.length === 4 && f.gastos.filter((g) => g.item === 'personal').map((g) => g.mes).join() === '10,11,12'
   && f.gastos.every((g) => g.estado === 'pendiente'), JSON.stringify(f).slice(0, 300));
ok('Hacienda también lo ve', !(await fondo('hacienda')).error);
ok('…y trae los dos documentos y las dos rendiciones', f.documentos.length === 2 && f.rendiciones.length === 2 && f.rendiciones.every((x) => !x.presentada));
for (const t of ['fondo_items', 'fondo_gastos', 'fondo_respaldos', 'fondo_documentos', 'fondo_rendiciones']) {
  r = await como('fondo', `select count(*) from ${t}`);
  if (r.error === null) { ok(`La tabla ${t} no se lee directamente`, false); }
}
ok('Las tablas del fondo no se leen directamente, ni con permiso', true);

// Una compra pedida por Compras en el tópico Fondo
const carpetaF = (await db.query(`select carpeta from pedidos where topico = 'fondo' and abierto`)).rows[0].carpeta;
await obj(`${carpetaF}/cot-balones.pdf`);
r = await como('socio', `select compra_agregar('fondo', 'Balones n° 5 (22)', 550000, $1, 'cot.pdf') as id`, [`${carpetaF}/cot-balones.pdf`]);
const balones = r.rows[0]?.id;
ok('Un socio pide una compra en el tópico Fondo', !!balones, r.error);
f = await fondo('fondo');
ok('Aparece en el fondo como compra por clasificar', f.por_clasificar.length === 1 && f.por_clasificar[0].id === balones);
r = await como('socio', `select fondo_clasificar($1, 'bienes')`, [balones]);
ok('Un socio no la pasa al fondo', /Solo el equipo del fondo/.test(r.error ?? ''), r.error);
r = await como('fondo', `select fondo_clasificar($1, 'inventado')`, [balones]);
ok('No se pasa a un ítem que no existe', /no está en el presupuesto/.test(r.error ?? ''), r.error);
r = await como('fondo', `select fondo_clasificar($1, 'personal')`, [balones]);
ok('…ni a honorarios', /honorarios ya están creados/.test(r.error ?? ''), r.error);
r = await como('fondo', `select fondo_clasificar($1, 'bienes') as id`, [balones]);
const gBalones = r.rows[0]?.id;
ok('El equipo del fondo la pasa a Bienes', !!gBalones, r.error);
r = await como('fondo', `select fondo_clasificar($1, 'bienes')`, [balones]);
ok('Una compra entra al fondo una sola vez', /ya está en el fondo/.test(r.error ?? ''), r.error);
f = await fondo('fondo');
let g = f.gastos.find((x) => x.id === gBalones);
ok('Toma qué y monto de la compra, y la cotización cuenta como respaldo sola',
   g?.que === 'Balones n° 5 (22)' && g.monto === 550000 && g.marcados.includes('cotizacion') && g.compra?.quien === 'Socio Prueba'
   && f.por_clasificar.length === 0, JSON.stringify(g));

// Respaldos
const respaldo = (quien, gasto, tipo, marcado = true, ruta = null) =>
  como(quien, `select fondo_respaldo($1, $2, $3, $4, 'archivo.pdf')`, [gasto, tipo, marcado, ruta]);
r = await respaldo('fondo', gBalones, 'f29');
ok('No se marca un respaldo que no corresponde', /no corresponde/.test(r.error ?? ''), r.error);
r = await respaldo('fondo', gBalones, 'nomina');
ok('La nómina solo se pide si se entrega a los participantes', /no corresponde/.test(r.error ?? ''), r.error);
r = await respaldo('fondo', gBalones, 'boleta', true, 'fondo/no-existe.pdf');
ok('No se acepta un archivo que no está en el bucket del fondo', /Falta el archivo/.test(r.error ?? ''), r.error);
r = await como('socio', `insert into storage.objects (bucket_id, name) values ('fondo', 'g/boleta.pdf')`);
ok('Un socio no sube archivos al bucket del fondo', !!r.error);
r = await como('fondo', `insert into storage.objects (bucket_id, name) values ('fondo', $1)`, [`${gBalones}/boleta.pdf`]);
ok('El equipo del fondo sí', !r.error, r.error);
const veFondo = async (quien) => { const x = await como(quien, `select count(*)::int n from storage.objects where bucket_id = 'fondo'`); return x.rows[0]?.n ?? x.error; };
ok('Un tesorero de plantel no abre los archivos del fondo', (await veFondo('teso')) === 0);
ok('El equipo del fondo sí', (await veFondo('fondo')) === 1);
r = await respaldo('fondo', gBalones, 'boleta', true, `${gBalones}/boleta.pdf`);
ok('Se marca la boleta con su archivo', !r.error, r.error);
for (const t of ['comprobante', 'certificacion', 'original']) await respaldo('fondo', gBalones, t);
r = await respaldo('fondo', gBalones, 'original', true, `${gBalones}/boleta.pdf`);
ok('El original firmado no acepta archivo', /solo en papel/.test(r.error ?? ''), r.error);
f = await fondo('fondo');
g = f.gastos.find((x) => x.id === gBalones);
ok('Con todos los respaldos pero sin forma de pago sigue pendiente', g.estado === 'pendiente' && g.respaldos.boleta?.ruta === `${gBalones}/boleta.pdf`, JSON.stringify(g));

const guardar = (quien, gasto, o = {}) => como(quien,
  `select fondo_gasto_guardar($1, $2, $3, $4, $5, $6, $7, $8, $9) as id`,
  [gasto, o.item ?? 'bienes', o.que ?? 'Balones n° 5 (22)', o.monto ?? 550000, o.proveedor ?? 'Proveedor Prueba',
   o.documento ?? '1234', o.fecha ?? '2026-10-15', o.pago === undefined ? 'transferencia' : o.pago, o.entrega ?? false]);
r = await guardar('socio', gBalones);
ok('Un socio no corrige un gasto del fondo', /Solo el equipo del fondo/.test(r.error ?? ''), r.error);
r = await guardar('fondo', gBalones, { item: 'personal' });
ok('Un gasto no pasa a honorarios', /no cambian de ítem/.test(r.error ?? ''), r.error);
r = await guardar('fondo', gBalones, { monto: 0 });
ok('No se deja el monto en cero', /Falta el monto/.test(r.error ?? ''), r.error);
r = await guardar('fondo', gBalones);
ok('El equipo completa proveedor, boleta, fecha y pago', !r.error, r.error);
g = (await fondo('fondo')).gastos.find((x) => x.id === gBalones);
ok('…y queda lista para rendir', g.estado === 'lista', JSON.stringify(g));
r = await guardar('fondo', gBalones, { entrega: true });
g = (await fondo('fondo')).gastos.find((x) => x.id === gBalones);
ok('Si se entrega a los participantes, pide la nómina y vuelve a pendiente', g.estado === 'pendiente', JSON.stringify(g));
r = await respaldo('fondo', gBalones, 'nomina', true, `${gBalones}/boleta.pdf`);
ok('La nómina no acepta archivo (trae cédula y domicilio)', /solo en papel/.test(r.error ?? ''), r.error);
await respaldo('fondo', gBalones, 'nomina');
ok('Marcada la nómina en papel, vuelve a estar lista', (await fondo('fondo')).gastos.find((x) => x.id === gBalones).estado === 'lista');

r = await guardar('fondo', null, { que: 'Botiquín', monto: 38000, item: 'otros', pago: 'particular' });
const gBotiquin = r.rows[0]?.id;
ok('Se puede cargar un gasto directo, sin pasar por Compras', !!gBotiquin, r.error);
ok('Pagado por un particular no se puede rendir', (await fondo('fondo')).gastos.find((x) => x.id === gBotiquin).estado === 'no_rendible');
r = await guardar('fondo', gBotiquin, { que: 'Botiquín', monto: 38000, item: 'otros', fecha: '2026-09-30', pago: 'debito' });
ok('…ni con boleta anterior al 1 de octubre', (await fondo('fondo')).gastos.find((x) => x.id === gBotiquin).estado === 'no_rendible');
r = await guardar('fondo', null, { item: 'personal' });
ok('Los honorarios no se crean a mano', /honorarios ya están creados/.test(r.error ?? ''), r.error);

// Rendiciones
r = await como('fondo', `select fondo_presentar(2)`);
ok('No se presenta la rendición 2 antes de la 1', /anterior/.test(r.error ?? ''), r.error);
r = await como('socio', `select fondo_presentar(1)`);
ok('Un socio no presenta rendiciones', /Solo el equipo del fondo/.test(r.error ?? ''), r.error);
r = await como('fondo', `select fondo_presentar(1) as n`);
ok('Al presentar la rendición 1 entran los gastos listos', r.rows[0]?.n === 1, r.error);
f = await fondo('fondo');
g = f.gastos.find((x) => x.id === gBalones);
ok('…y quedan rendidos en ella', g.estado === 'rendida' && g.rendicion === 1 && f.rendiciones[0].presentada, JSON.stringify(g));
r = await guardar('fondo', gBalones, { monto: 1 });
ok('Un gasto rendido no se cambia', /rendición presentada/.test(r.error ?? ''), r.error);
r = await respaldo('fondo', gBalones, 'boleta', false);
ok('…ni se le desmarcan respaldos', /rendición presentada/.test(r.error ?? ''), r.error);
r = await como('fondo', `select fondo_gasto_quitar($1)`, [gBalones]);
ok('…ni se quita del fondo', /rendición presentada/.test(r.error ?? ''), r.error);
r = await como('fondo', `select fondo_presentar(1)`);
ok('Una rendición no se presenta dos veces', /ya está presentada/.test(r.error ?? ''), r.error);
r = await como('fondo', `select fondo_presentar(2)`);
ok('No se presenta una rendición vacía', /No hay gastos listos/.test(r.error ?? ''), r.error);
r = await como('fondo', `select fondo_subida(1, true)`);
ok('Se marca la rendición como subida al portal', !r.error && (await fondo('fondo')).rendiciones[0].subida === true, r.error);
r = await como('fondo', `select fondo_subida(2, true)`);
ok('…pero no una que no se ha presentado', /no está presentada/.test(r.error ?? ''), r.error);

// Quitar un gasto y documentos
await obj(`${carpetaF}/cot-conos.pdf`);
const conosF = (await como('socio', `select compra_agregar('fondo', 'Conos (30)', 75000, $1, 'cot.pdf') as id`, [`${carpetaF}/cot-conos.pdf`])).rows[0]?.id;
const gConos = (await como('fondo', `select fondo_clasificar($1, 'bienes') as id`, [conosF])).rows[0]?.id;
r = await como('fondo', `select fondo_gasto_quitar($1)`, [gConos]);
ok('Se quita un gasto del fondo y la compra vuelve a quedar por clasificar',
   !r.error && (await fondo('fondo')).por_clasificar.some((x) => x.id === conosF), r.error);
r = await como('fondo', `select fondo_clasificar($1, 'otros') as id`, [conosF]);
ok('…y se puede volver a pasar, a otro ítem', !!r.rows[0]?.id, r.error);
const honorOct = f.gastos.find((x) => x.mes === 10).id;
r = await como('fondo', `select fondo_gasto_quitar($1)`, [honorOct]);
ok('Las cuotas de honorarios no se quitan', /no se quitan/.test(r.error ?? ''), r.error);
r = await como('fondo', `select fondo_documento('cartola', true)`);
ok('Se marca la cartola como lista', !r.error && (await fondo('fondo')).documentos.find((d) => d.id === 'cartola').listo, r.error);
r = await como('socio', `select fondo_documento('cartola', false)`);
ok('Un socio no cambia los documentos', /Solo el equipo del fondo/.test(r.error ?? ''), r.error);

console.log(`\n${pass} pruebas pasaron, ${fail} fallaron.`);
process.exit(fail ? 1 : 0);
