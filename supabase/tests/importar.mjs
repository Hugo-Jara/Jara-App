// Prueba la importación de la planilla común de tesorería (0052) en un Postgres en memoria
// (PGlite), con todas las migraciones en orden.
//   npm run test:importar (también corre con npm run test:db)
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
let r;
const T = 2026;
const importar = (quien, equipo, filas, { plan = null, aporte = null, bajas = null, confirmar = false } = {}) =>
  como(quien, 'select tes_importar_planilla($1, $2, $3, $4, $5, $6, $7, $8) as v',
       [equipo, T, JSON.stringify(filas), plan && JSON.stringify(plan), aporte, bajas, 'planilla.xlsx', confirmar]);
const sql = async (q, p = []) => (await db.query(q, p)).rows;
const fila = (n, nombre, extra = {}) => ({ fila: n, nombre, tipo: 'Normal', descuento_pct: 0, deuda_anterior: 0, pagado: 0, ...extra });

const PLAN = [
  { numero: 0, nombre: 'Inscripción', vence: '2026-03-10', monto: 30000 },
  { numero: 1, nombre: 'Marzo', vence: '2026-03-10', monto: 40000 },
];
const FILAS = [
  fila(2, 'Jugador Inventado', { rut: '15.000.000-9', pagado: 70000, apodo: 'Pulga', correo: 'otro@correo.cl', nacimiento: '1995-04-03' }),
  fila(3, 'Persona Nueva Inventada', { rut: '15000001-7', tipo: 'beca', descuento_pct: 50, pagado: 20000, correo: 'nueva@correo.cl', telefono: '922222222' }),
  fila(4, 'Alguien Sin Rut Inventado'),
  fila(5, 'Otro Inventado', { rut: '15000002-5', tipo: 'exento' }),
  fila(6, 'Rut Malo Inventado', { rut: '15000003-4' }),
];
await db.exec(`update personas set apodo = 'Propio' where id = '${PER.jugador}'`);

console.log('\nImportar la planilla común');

// Permisos
r = await importar('jugador', JUNIOR, FILAS);
ok('Un jugador no puede importar', /Solo el tesorero/.test(r.error ?? ''), r.error);
r = await importar('tesorero', SENIOR, FILAS);
ok('El tesorero no importa otro plantel', /Solo el tesorero/.test(r.error ?? ''), r.error);
await como('prueba', 'select prueba_ver_como($1, $2)', ['tesorero', JUNIOR]);
r = await importar('prueba', JUNIOR, FILAS, { confirmar: true });
ok('Una cuenta de prueba no importa', /no cambiarla/.test(r.error ?? ''), r.error);
r = await anon('select tes_importar_planilla(null, 2026, null, null, null, null, null, false)');
ok('Sin cuenta, nada', /permission denied/.test(r.error ?? ''), r.error);

// Vista previa
const personasAntes = (await sql('select count(*)::int n from personas'))[0].n;
r = await importar('tesorero', JUNIOR, FILAS, { plan: PLAN, aporte: 10 });
let v = r.rows[0]?.v;
ok('La vista previa responde', !r.error && v && !v.confirmado, r.error);
const por = (n) => v.filas.find((f) => f.fila === n);
ok('Calza por nombre la primera vez', por(2).estado === 'calza' && por(2).como === 'nombre', JSON.stringify(por(2)));
ok('Con RUT y sin nadie igual: nuevo', por(3).estado === 'nuevo', JSON.stringify(por(3)));
ok('Sin RUT y sin nadie igual: no se importa', por(4).estado === 'sin_rut', JSON.stringify(por(4)));
ok('Nombre parecido calza con uno solo', por(5).estado === 'calza' && por(5).en_app === 'Otro Jugador Inventado', JSON.stringify(por(5)));
ok('RUT con dígito malo: aviso y no se usa', por(6).avisos.some((a) => /no es válido/.test(a)) && por(6).estado === 'sin_rut', JSON.stringify(por(6)));
ok('Quien no está en la planilla aparece aparte', v.fuera.some((f) => f.id === PER.tesorero), JSON.stringify(v.fuera));
ok('El plan y el aporte cambian', v.resumen.plan_cambia && v.resumen.aporte_cambia, JSON.stringify(v.resumen));
ok('La vista previa no cambia nada',
   (await sql('select count(*)::int n from personas'))[0].n === personasAntes
   && (await sql('select count(*)::int n from tes_pagos'))[0].n === 0
   && (await sql('select count(*)::int n from tes_importaciones'))[0].n === 0);

// Bloqueos
r = await importar('tesorero', JUNIOR, [...FILAS, fila(9, 'Repetido Inventado', { rut: '15000001-7' })], { confirmar: true });
v = r.rows[0]?.v;
ok('El mismo RUT dos veces detiene todo', !r.error && !v.confirmado && v.errores.some((e) => /15000001-7/.test(e)), r.error ?? JSON.stringify(v?.errores));
r = await importar('tesorero', JUNIOR, [...FILAS, fila(9, 'Jugador Inventado')], { confirmar: true });
v = r.rows[0]?.v;
ok('Dos filas con la misma persona detienen todo', !v.confirmado && v.errores.some((e) => /misma persona/.test(e)), JSON.stringify(v?.errores));
ok('…y no se aplicó nada', (await sql('select count(*)::int n from tes_pagos'))[0].n === 0);

// Confirmar
r = await importar('tesorero', JUNIOR, FILAS, { plan: PLAN, aporte: 10, bajas: [PER.tesorero, PER.sinCuenta], confirmar: true });
v = r.rows[0]?.v;
ok('Confirmar aplica', !r.error && v.confirmado, r.error ?? JSON.stringify(v?.errores));
const nueva = (await sql(`select p.id, pc.rut, pc.email, pc.telefono from personas p join persona_contactos pc on pc.persona_id = p.id where p.nombre = 'Persona Nueva Inventada'`))[0];
ok('El nuevo entra a la nómina con RUT, correo y celular', nueva && nueva.rut === '15000001-7' && nueva.email === 'nueva@correo.cl' && nueva.telefono === '922222222', JSON.stringify(nueva));
ok('…y al plantel', (await sql(`select 1 from persona_equipos where persona_id = $1 and equipo_id = $2 and rol = 'jugador'`, [nueva.id, JUNIOR])).length === 1);
ok('No se crea a quien no tiene RUT', (await sql(`select 1 from personas where nombre like 'Alguien Sin Rut%' or nombre like 'Rut Malo%'`)).length === 0);
const jug = (await sql(`select p.apodo, pc.rut, pc.email, pf.nacimiento::text from personas p join persona_contactos pc on pc.persona_id = p.id left join perfiles pf on pf.persona_id = p.id where p.id = $1`, [PER.jugador]))[0];
ok('Al que calzó se le carga el RUT y la fecha', jug.rut === '15000000-9' && jug.nacimiento === '1995-04-03', JSON.stringify(jug));
ok('No se pisa el apodo ni el correo de entrada', jug.apodo === 'Propio' && jug.email === 'jugador@correo.cl', JSON.stringify(jug));
const cond = (await sql(`select tipo, descuento_pct::int from tes_jugadores where persona_id = $1 and equipo_id = $2`, [nueva.id, JUNIOR]))[0];
ok('La condición queda como en la planilla', cond.tipo === 'beca' && cond.descuento_pct === 50, JSON.stringify(cond));
ok('Lo pagado queda como un pago de planilla', (await sql(`select sum(monto)::int s from tes_pagos where medio = 'planilla' and anulado_en is null and persona_id = $1`, [PER.jugador]))[0].s === 70000);
ok('El exento sin pagado no tiene pago', (await sql(`select 1 from tes_pagos where persona_id = $1`, [PER.otro])).length === 0);
ok('El plan de cuotas se reemplaza', (await sql(`select count(*)::int n from tes_cuotas where equipo_id = $1`, [JUNIOR]))[0].n === 2
   && (await sql(`select aporte_pct::int a from tes_planes where equipo_id = $1`, [JUNIOR]))[0].a === 10);
ok('Se da de baja solo a quien no está en la planilla y se eligió',
   (await sql(`select activo from tes_jugadores where persona_id = $1 and equipo_id = $2`, [PER.tesorero, JUNIOR]))[0]?.activo === false
   && (await sql(`select 1 from tes_jugadores where persona_id = $1`, [PER.sinCuenta])).length === 0);
ok('…y sigue en el plantel', (await sql(`select 1 from persona_equipos where persona_id = $1 and equipo_id = $2 and rol = 'jugador'`, [PER.tesorero, JUNIOR])).length === 1);
r = await como('tesorero', 'select tes_ultima_importacion($1, $2) as v', [JUNIOR, T]);
ok('Queda registrada la importación', !r.error && r.rows[0].v?.archivo === 'planilla.xlsx' && r.rows[0].v.por === 'Tesorero Inventado', r.error ?? JSON.stringify(r.rows[0]));

// Importar de nuevo
const pagosAntes = (await sql('select count(*)::int n from tes_pagos'))[0].n;
r = await importar('tesorero', JUNIOR, FILAS, { plan: PLAN, aporte: 10 });
v = r.rows[0].v;
ok('Ahora calza por RUT', v.filas.find((f) => f.fila === 2).como === 'RUT' && v.filas.find((f) => f.fila === 3).como === 'RUT', JSON.stringify(v.filas.slice(0, 2)));
ok('La misma planilla otra vez no trae cambios', v.resumen.con_cambios === 0 && !v.resumen.plan_cambia && !v.resumen.aporte_cambia, JSON.stringify(v.resumen));
await importar('tesorero', JUNIOR, FILAS, { plan: PLAN, aporte: 10, confirmar: true });
ok('…ni duplica pagos', (await sql('select count(*)::int n from tes_pagos'))[0].n === pagosAntes);

const FILAS2 = FILAS.map((f) => (f.fila === 2 ? { ...f, pagado: 95000 } : f.fila === 3 ? { ...f, pagado: 0 } : f));
r = await importar('tesorero', JUNIOR, FILAS2);
ok('La vista previa muestra el cambio de pagado', r.rows[0].v.filas.find((f) => f.fila === 2).cambios.some((c) => /70\.000 → \$95\.000/.test(c)),
   JSON.stringify(r.rows[0].v.filas.find((f) => f.fila === 2)));
await importar('tesorero', JUNIOR, FILAS2, { confirmar: true });
ok('Pagado se reemplaza, no se suma', (await sql(`select sum(monto)::int s from tes_pagos where medio = 'planilla' and anulado_en is null and persona_id = $1`, [PER.jugador]))[0].s === 95000);
ok('El pago anterior queda anulado, no borrado', (await sql(`select count(*)::int n from tes_pagos where persona_id = $1 and anulado_en is not null`, [PER.jugador]))[0].n === 1);
ok('Pagado en cero anula el de planilla', (await sql(`select count(*)::int n from tes_pagos where persona_id = $1 and anulado_en is null`, [nueva.id]))[0].n === 0);

// Un pago anotado en la app genera aviso
await como('tesorero', 'select tes_registrar_pago($1, $2, $3, 5000, current_date, $4, null)', [JUNIOR, T, PER.jugador, 'efectivo']);
r = await importar('tesorero', JUNIOR, FILAS2);
ok('Avisa si hay pagos anotados en la app', r.rows[0].v.filas.find((f) => f.fila === 2).avisos.some((a) => /anotados en la app/.test(a)));

// El mismo RUT en otro plantel es la misma persona
await db.exec(`insert into persona_equipos (persona_id, equipo_id, rol) values ('${PER.tesorero}', '${SENIOR}', 'tesorero')`);
r = await importar('tesorero', SENIOR, [fila(2, 'Persona Nueva', { rut: '15000001-7' })], { confirmar: true });
ok('El mismo RUT en otro plantel no crea otra persona', !r.error && r.rows[0].v.filas[0].estado === 'calza'
   && (await sql(`select count(*)::int n from personas where nombre like 'Persona Nueva%'`))[0].n === 1, r.error ?? JSON.stringify(r.rows[0]?.v.filas));
ok('…y queda en los dos planteles', (await sql(`select count(*)::int n from persona_equipos where persona_id = $1 and rol = 'jugador'`, [nueva.id]))[0].n === 2);

// Nombre, Apellido paterno y Apellido materno (0053)
console.log('\nNombre por partes (0053)');
const partes = (n, nombres, paterno, materno, extra = {}) =>
  fila(n, [nombres, paterno, materno].filter(Boolean).join(' '), { nombres, apellido_paterno: paterno, apellido_materno: materno, ...extra });
r = await importar('tesorero', SENIOR, [partes(2, 'Persona', 'Nueva', 'Inventada', { rut: '15000001-7' })]);
v = r.rows[0].v;
ok('La vista previa muestra el nombre que cambia', !r.error && v.filas[0].cambios.some((c) => c === 'Nombre en la app: Persona Nueva Inventada → Persona Nueva'),
   r.error ?? JSON.stringify(v.filas[0]));
await importar('tesorero', SENIOR, [partes(2, 'Persona', 'Nueva', 'Inventada', { rut: '15000001-7' })], { confirmar: true });
let pn = (await sql(`select nombre, nombres, apellido_paterno, apellido_materno from personas where id = $1`, [nueva.id]))[0];
ok('La app muestra Nombre Apellido paterno y guarda las tres partes',
   pn.nombre === 'Persona Nueva' && pn.nombres === 'Persona' && pn.apellido_paterno === 'Nueva' && pn.apellido_materno === 'Inventada', JSON.stringify(pn));
r = await importar('tesorero', SENIOR, [partes(2, 'Persona', 'Nueva', 'Inventada', { rut: '15000001-7' })]);
ok('Importar lo mismo otra vez no cambia el nombre', !r.rows[0].v.filas[0].cambios.some((c) => /^Nombre/.test(c)), JSON.stringify(r.rows[0].v.filas[0]));
r = await importar('tesorero', SENIOR, [partes(2, 'Persona', 'Nueva', null, { rut: '15000001-7', fila: 2 }), partes(3, 'Nuevo', 'Por Partes', 'Inventado', { rut: '15000004-1' })], { confirmar: true });
pn = (await sql(`select nombre, apellido_materno from personas where id = $1`, [nueva.id]))[0];
ok('Si la planilla borra el materno, se borra', !r.error && pn.nombre === 'Persona Nueva' && pn.apellido_materno === null, r.error ?? JSON.stringify(pn));
ok('Un nuevo entra con el nombre corto', (await sql(`select 1 from personas where nombre = 'Nuevo Por Partes' and apellido_materno = 'Inventado'`)).length === 1);
r = await importar('tesorero', SENIOR, [partes(2, 'Persona', null, null, { rut: '15000001-7' })]);
ok('Sin apellido paterno, avisa y no toca el nombre', r.rows[0].v.filas[0].avisos.some((a) => /Apellido paterno/.test(a))
   && !r.rows[0].v.filas[0].cambios.some((c) => /^Nombre/.test(c)), JSON.stringify(r.rows[0].v.filas[0]));
r = await importar('tesorero', SENIOR, [fila(2, 'Persona Nueva Inventada', { rut: '15000001-7' })]);
ok('La pestaña vieja (Nombre completo) no toca el nombre', !r.error && !r.rows[0].v.filas[0].cambios.some((c) => /^Nombre/.test(c)), r.error ?? JSON.stringify(r.rows[0].v.filas[0]));
r = await como('tesorero', `select tes_guardar_jugador($1, $2, $3, '{"nombre": "Otro Nombre"}'::jsonb)`, [SENIOR, T, nueva.id]);
ok('Con partes, el nombre no se cambia a mano', /viene de la planilla/.test(r.error ?? ''), r.error);
r = await como('tesorero', `select tes_guardar_jugador($1, $2, $3, '{"nombre": "Persona Nueva"}'::jsonb)`, [SENIOR, T, nueva.id]);
ok('…pero guardar la ficha sin cambiarlo funciona', !r.error, r.error);
r = await como('tesorero', 'select tes_ver($1, $2) as v', [SENIOR, T]);
const enFicha = r.rows[0]?.v.jugadores.find((j) => j.id === nueva.id);
ok('La ficha trae las partes', enFicha?.nombres === 'Persona' && enFicha?.apellido_paterno === 'Nueva', r.error ?? JSON.stringify(enFicha));
r = await importar('tesorero', SENIOR, [partes(2, 'Persona', 'Nueva', null, { rut: '15000001-7', apodo: 'Pulga' })], { confirmar: true });
ok('El apodo nunca viene de la planilla', (await sql(`select apodo from personas where id = $1`, [nueva.id]))[0].apodo === null);

console.log(`\n${pass} pruebas pasaron, ${fail} fallaron.`);
process.exit(fail ? 1 : 0);
