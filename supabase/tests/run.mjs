// Prueba las migraciones y las reglas del flujo de cotizaciones en un Postgres
// en memoria (PGlite), simulando el esquema `auth` de Supabase.
//   npm run test:db
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

// --- Simulación mínima de Supabase -----------------------------------------
await db.exec(`
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create function auth.jwt() returns jsonb language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
  grant usage on schema auth to anon, authenticated;
  grant usage on schema public to anon, authenticated;
`);
await db.exec(mig('0001_base.sql'));
await db.exec(mig('0002_cotizaciones.sql'));
await db.exec(mig('0004_funciones_de_trigger_privadas.sql'));
console.log('Migraciones 0001, 0002 y 0004 aplicadas sin errores.\n');

// --- Datos de prueba --------------------------------------------------------
const U = {
  seba:  '00000000-0000-0000-0000-000000000001',
  pedro: '00000000-0000-0000-0000-000000000002',
  juan:  '00000000-0000-0000-0000-000000000003',
  nadie: '00000000-0000-0000-0000-000000000009',
};
const email = { seba: 'seba@club.cl', pedro: 'pedro@club.cl', juan: 'juan@club.cl', nadie: 'otro@gmail.com' };

await db.exec(`
  insert into auth.users (id, email) values
    ('${U.seba}', '${email.seba}'), ('${U.pedro}', '${email.pedro}'),
    ('${U.juan}', '${email.juan}'), ('${U.nadie}', '${email.nadie}');
  insert into clubes (id, nombre, slug) values ('10000000-0000-0000-0000-000000000001', 'Hugo Jara', 'hugo-jara');
  insert into personas (id, club_id, nombre) values
    ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Seba'),
    ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Pedro'),
    ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'Juan');
  insert into persona_contactos (persona_id, email) values
    ('20000000-0000-0000-0000-000000000001', '${email.seba}'),
    ('20000000-0000-0000-0000-000000000002', '${email.pedro}'),
    ('20000000-0000-0000-0000-000000000003', '${email.juan}');
  insert into areas (id, club_id, nombre, aprueba_compras) values
    ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Hacienda', true);
  insert into persona_areas (persona_id, area_id, rol) values
    ('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'ministro');
`);

// Ejecuta SQL como un usuario con sesión iniciada (o como anónimo).
async function como(quien, sql, params = []) {
  await db.exec('reset role');
  if (quien === 'anon') {
    await db.exec(`select set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claims', '', false); set role anon;`);
  } else {
    const claims = JSON.stringify({ sub: U[quien], email: email[quien] });
    await db.exec(`select set_config('request.jwt.claim.sub', '${U[quien]}', false), set_config('request.jwt.claims', '${claims}', false); set role authenticated;`);
  }
  try {
    const r = await db.query(sql, params);
    return { rows: r.rows, n: r.affectedRows ?? r.rows.length, error: null };
  } catch (e) {
    return { rows: [], n: 0, error: e.message };
  } finally {
    await db.exec('reset role');
  }
}

// --- Ingreso y nómina -------------------------------------------------------
console.log('Ingreso y nómina');
let r = await como('pedro', 'select vincular_persona() as id');
ok('Pedro queda enlazado a su fila de la nómina', r.rows[0]?.id === '20000000-0000-0000-0000-000000000002', r.error);
await como('seba', 'select vincular_persona()');
await como('juan', 'select vincular_persona()');
r = await como('nadie', 'select vincular_persona() as id');
ok('Un correo fuera de la nómina no se enlaza', r.rows[0]?.id === null, r.error);
r = await como('nadie', 'select count(*)::int as n from personas');
ok('…y no ve a nadie del club', r.rows[0]?.n === 0);
r = await como('anon', 'select count(*)::int as n from personas');
ok('Sin sesión no hay acceso a la nómina', !!r.error);
r = await como('pedro', 'select count(*)::int as n from personas');
ok('Pedro ve los nombres del club', r.rows[0]?.n === 3);
r = await como('pedro', 'select count(*)::int as n from persona_contactos');
ok('Pedro solo ve su propio contacto', r.rows[0]?.n === 1);
r = await como('pedro', `update personas set es_admin = true where nombre = 'Pedro'`);
ok('Pedro no puede hacerse administrador', r.n === 0);
r = await como('pedro', `update persona_contactos set email = 'x@x.cl' where persona_id = '20000000-0000-0000-0000-000000000002'`);
ok('Pedro no puede cambiar su correo de la nómina', !!r.error);
r = await como('pedro', `update persona_contactos set telefono = '+56911111111' where persona_id = '20000000-0000-0000-0000-000000000002'`);
ok('Pedro sí puede corregir su teléfono', !r.error && r.n === 1, r.error);

// --- Flujo de cotizaciones --------------------------------------------------
console.log('\nFlujo de cotizaciones');
r = await como('pedro', `
  insert into solicitudes_compra (club_id, solicitante_id, descripcion, actividad, monto, referencia, fecha_necesaria, estado)
  values ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002',
          '3 cajas de bebidas', 'Fiesta 20 años', 45000, 'https://ejemplo.cl/bebidas', '2026-11-20', 'aprobada')
  returning id, codigo, estado`);
const sol = r.rows[0]?.id;
ok('Pedro crea una solicitud y nace como borrador aunque pida otro estado', r.rows[0]?.estado === 'borrador', r.error);
ok('Recibe un código legible', /^SC-\d{3}$/.test(r.rows[0]?.codigo ?? ''));

r = await como('pedro', `insert into solicitudes_compra (club_id, solicitante_id, descripcion, actividad, monto, referencia, fecha_necesaria)
  values ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', 'x', 'y', 0, 'z', '2026-11-20')`);
ok('No se acepta una solicitud con monto cero', !!r.error);

r = await como('pedro', `update solicitudes_compra set estado = 'enviada' where id = $1`, [sol]);
ok('No se puede enviar sin cotización adjunta', /cotización/.test(r.error ?? ''), r.error);

r = await como('pedro', `insert into solicitud_adjuntos (solicitud_id, tipo, ruta, nombre_archivo, subido_por)
  values ($1::uuid, 'cotizacion', $1::text || '/cot.pdf', 'cot.pdf', '20000000-0000-0000-0000-000000000002')`, [sol]);
ok('Pedro adjunta la cotización', !r.error, r.error);
r = await como('pedro', `update solicitudes_compra set estado = 'enviada' where id = $1`, [sol]);
ok('Con cotización, la solicitud se envía', !r.error && r.n === 1, r.error);

r = await como('juan', 'select count(*)::int as n from solicitudes_compra');
ok('Juan no ve la solicitud de Pedro', r.rows[0]?.n === 0);
r = await como('juan', `update solicitudes_compra set estado = 'aprobada' where id = $1`, [sol]);
ok('Juan no puede aprobarla', r.n === 0);
r = await como('pedro', `update solicitudes_compra set estado = 'aprobada' where id = $1`, [sol]);
ok('Pedro no puede aprobar su propia solicitud', /Hacienda/.test(r.error ?? ''), r.error);
r = await como('pedro', `update solicitudes_compra set monto = 99000 where id = $1`, [sol]);
ok('Una vez enviada, Pedro no puede cambiar el monto', !!r.error);

r = await como('seba', 'select count(*)::int as n from solicitudes_compra');
ok('Seba (Hacienda) sí la ve', r.rows[0]?.n === 1);
r = await como('seba', `update solicitudes_compra set estado = 'devuelta' where id = $1`, [sol]);
ok('No se puede devolver sin escribir el motivo', /motivo/.test(r.error ?? ''), r.error);
r = await como('seba', `update solicitudes_compra set estado = 'devuelta', motivo_devolucion = 'Falta el detalle por unidad' where id = $1`, [sol]);
ok('Seba la devuelve con motivo', !r.error && r.n === 1, r.error);
r = await como('seba', `update solicitudes_compra set monto = 1 where id = $1`, [sol]);
ok('Hacienda no puede editar el contenido de una solicitud ajena', !!r.error);

r = await como('pedro', `update solicitudes_compra set monto = 42000, estado = 'enviada' where id = $1 returning motivo_devolucion`, [sol]);
ok('Pedro corrige el monto y reenvía', !r.error && r.rows[0]?.motivo_devolucion === null, r.error);
r = await como('seba', `update solicitudes_compra set estado = 'cerrada' where id = $1`, [sol]);
ok('No se puede saltar de enviada a cerrada', /No se puede pasar/.test(r.error ?? ''), r.error);
r = await como('seba', `update solicitudes_compra set estado = 'aprobada' where id = $1 returning resuelta_por`, [sol]);
ok('Seba aprueba y queda registrado quién aprobó', r.rows[0]?.resuelta_por === '20000000-0000-0000-0000-000000000001', r.error);

r = await como('pedro', `update solicitudes_compra set estado = 'comprada' where id = $1`, [sol]);
ok('No se puede marcar comprada sin boleta', /boleta/.test(r.error ?? ''), r.error);
r = await como('pedro', `insert into solicitud_adjuntos (solicitud_id, tipo, ruta, nombre_archivo, subido_por)
  values ($1::uuid, 'boleta', $1::text || '/boleta.jpg', 'boleta.jpg', '20000000-0000-0000-0000-000000000002')`, [sol]);
ok('Pedro sube la boleta', !r.error, r.error);
r = await como('pedro', `update solicitudes_compra set estado = 'comprada' where id = $1`, [sol]);
ok('Con boleta, queda como comprada', !r.error && r.n === 1, r.error);
r = await como('pedro', `update solicitudes_compra set estado = 'cerrada' where id = $1`, [sol]);
ok('Pedro no puede cerrarla', !!r.error);
r = await como('seba', `update solicitudes_compra set estado = 'cerrada' where id = $1`, [sol]);
ok('Seba la cierra', !r.error && r.n === 1, r.error);

r = await como('seba', `select string_agg(a_estado, ' > ' order by id) as camino, count(*)::int as n,
                               count(persona_id)::int as con_autor
                          from solicitud_eventos where solicitud_id = $1`, [sol]);
ok('El historial guarda cada paso con su autor',
   r.rows[0]?.camino === 'borrador > enviada > devuelta > enviada > aprobada > comprada > cerrada' && r.rows[0]?.con_autor === 7,
   JSON.stringify(r.rows[0]));
r = await como('pedro', `insert into solicitud_eventos (solicitud_id, a_estado) values ($1, 'aprobada')`, [sol]);
ok('Nadie puede escribir el historial a mano', !!r.error);
r = await como('pedro', `delete from solicitudes_compra where id = $1`, [sol]);
ok('Una solicitud cerrada no se puede borrar', r.n === 0);

console.log(`\n${pass} pruebas pasaron, ${fail} fallaron.`);
process.exit(fail ? 1 : 0);
