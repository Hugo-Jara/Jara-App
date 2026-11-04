// Prueba la tesorería de los planteles (0023) en un Postgres en memoria
// (PGlite), con todas las migraciones en orden.
//   npm run test:tesoreria (también corre con npm run test:db)
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
let r, x;
const T = 2026;
const ver = async (quien, equipo) => como(quien, 'select tes_ver($1, $2) as v', [equipo, T]);
const PLAN = JSON.stringify([
  { numero: 0, nombre: 'Inscripción', vence: '2026-03-10', monto: 30000 },
  { numero: 1, nombre: 'Marzo', vence: '2026-03-10', monto: 40000 },
  { numero: 2, nombre: 'Abril', vence: '2026-04-10', monto: 50000 },
]);

console.log('\nTesorería de los planteles');

// Quién ve qué
x = (await como('tesorero', 'select tes_planteles() as p')).rows[0].p;
ok('El tesorero ve solo su plantel, y puede editarlo', x.length === 1 && x[0].id === JUNIOR && x[0].editar, JSON.stringify(x));
x = (await como('hacienda', 'select tes_planteles() as p')).rows[0].p;
ok('Hacienda ve todos los planteles', x.length === 2 && x.every((p) => p.editar), JSON.stringify(x));
x = (await como('jugador', 'select tes_planteles() as p')).rows[0].p;
ok('Un jugador no ve la tesorería de ningún plantel', x.length === 0);
r = await ver('tesorero', SENIOR);
ok('El tesorero no abre la tesorería de otro plantel', /Solo el tesorero/.test(r.error ?? ''), r.error);
r = await ver('jugador', JUNIOR);
ok('…ni un jugador la de su propio plantel', /Solo el tesorero/.test(r.error ?? ''), r.error);
r = await anon('select tes_planteles()');
ok('Sin cuenta no se llama ninguna función', /permission denied/.test(r.error ?? ''), r.error);
r = await como('tesorero', 'select * from tes_pagos');
ok('Las tablas no se leen desde el navegador', /permission denied/.test(r.error ?? ''), r.error);
r = await como('tesorero', 'select tes_puedo_editar($1)', [SENIOR]);
ok('…ni las funciones internas de permisos', /permission denied/.test(r.error ?? ''), r.error);

// Plan y jugadores
r = await como('tesorero', 'select tes_guardar_plan($1, $2, $3::jsonb, 10)', [JUNIOR, T, PLAN]);
ok('El tesorero guarda el plan de cuotas de su plantel', !r.error, r.error);
r = await como('tesorero', 'select tes_guardar_plan($1, $2, $3::jsonb, 10)', [SENIOR, T, PLAN]);
ok('…pero no el de otro plantel', /Solo el tesorero/.test(r.error ?? ''), r.error);
x = (await ver('tesorero', JUNIOR)).rows[0].v;
ok('tes_ver trae las cuotas y el aporte', x.cuotas.length === 3 && x.cuotas[1].monto === 40000 && Number(x.aporte_pct) === 10, JSON.stringify(x.cuotas));
ok('…y los jugadores del plantel, con su contacto', x.jugadores.length === 3
   && x.jugadores.find((j) => j.id === PER.jugador)?.correo === 'jugador@correo.cl', JSON.stringify(x.jugadores));
r = await como('tesorero', 'select tes_guardar_jugador($1, $2, $3, $4::jsonb)',
               [JUNIOR, T, PER.jugador, JSON.stringify({ tipo: 'beca', descuento_pct: 50, deuda_anterior: 15000, correo: 'COBRO@correo.cl' })]);
ok('El tesorero pone beca, deuda anterior y correo de cobro', !r.error, r.error);
x = (await ver('tesorero', JUNIOR)).rows[0].v.jugadores.find((j) => j.id === PER.jugador);
ok('…y quedan guardados (correo en minúsculas)', x.tipo === 'beca' && Number(x.descuento_pct) === 50 && x.deuda_anterior === 15000 && x.correo === 'cobro@correo.cl', JSON.stringify(x));
x = (await db.query('select email from persona_contactos where persona_id = $1', [PER.jugador])).rows[0].email;
ok('…sin tocar el correo con que entra a la app', x === 'jugador@correo.cl');
r = await como('tesorero', 'select tes_guardar_jugador($1, $2, $3, $4::jsonb)', [JUNIOR, T, PER.otro, JSON.stringify({ tipo: 'especial' })]);
ok('Especial sin monto no se guarda', /especial_con_monto/.test(r.error ?? ''), r.error);

// Sumar a alguien de la nómina que no está en el plantel
x = (await como('tesorero', 'select tes_buscar_personas($1, $2) as p', [JUNIOR, 'sin cuenta'])).rows[0]?.p;
ok('El tesorero busca en la nómina', x?.length === 1 && x[0].id === PER.sinCuenta, JSON.stringify(x));
r = await como('tesorero', 'select tes_guardar_jugador($1, $2, $3, $4::jsonb)', [JUNIOR, T, PER.sinCuenta, '{}']);
x = (await ver('tesorero', JUNIOR)).rows[0].v.jugadores;
ok('…y lo suma a la tesorería del plantel', !r.error && x.some((j) => j.id === PER.sinCuenta && !j.en_plantel), r.error);
x = (await db.query('select count(*)::int n from persona_equipos where persona_id = $1', [PER.sinCuenta])).rows[0].n;
ok('…sin cambiar los planteles del club', x === 0);

// Pagos
r = await como('tesorero', `select tes_registrar_pago($1, $2, $3, 20000, '2026-03-12', 'transferencia', 'marzo') as id`, [JUNIOR, T, PER.jugador]);
const pago1 = r.rows[0]?.id;
ok('El tesorero registra un pago', !r.error && pago1, r.error);
r = await como('tesorero', `select tes_registrar_pago($1, $2, $3, 0, '2026-03-12', 'efectivo', null)`, [JUNIOR, T, PER.jugador]);
ok('…no de $0', /mayor que cero/.test(r.error ?? ''), r.error);
r = await como('tesorero', `select tes_registrar_pago($1, $2, $3, 1000, current_date + 30, 'efectivo', null)`, [JUNIOR, T, PER.jugador]);
ok('…ni con fecha futura', /futura/.test(r.error ?? ''), r.error);
r = await como('tesorero', `select tes_registrar_pago($1, $2, $3, 1000, '2026-03-12', 'efectivo', null)`, [SENIOR, T, PER.otro]);
ok('…ni en otro plantel', /Solo el tesorero/.test(r.error ?? ''), r.error);
r = await como('jugador', `select tes_registrar_pago($1, $2, $3, 1000, '2026-03-12', 'app', null)`, [JUNIOR, T, PER.jugador]);
ok('Un jugador no se registra pagos a sí mismo', /Solo el tesorero/.test(r.error ?? ''), r.error);
r = await como('tesorero', `select tes_registrar_pago($1, $2, $3, 5000, '2026-03-12', 'efectivo', null) as id`, [JUNIOR, T, PER.otro]);
const pago2 = r.rows[0]?.id;
r = await como('tesorero', 'select tes_anular_pago($1)', [pago2]);
x = (await db.query('select anulado_en, anulado_por from tes_pagos where id = $1', [pago2])).rows[0];
ok('Anular un pago lo deja anulado, con quién lo anuló (no se borra)', !r.error && x.anulado_en && x.anulado_por === PER.tesorero, r.error);
r = await como('tesorero', 'select tes_anular_pago($1)', [pago2]);
ok('…y no se anula dos veces', /ya estaba anulado/.test(r.error ?? ''), r.error);

// Extras y caja
r = await como('tesorero', `select tes_cargar_extra($1, $2, $3::uuid[], 'Polera', 18000, '2026-05-01') as n`, [JUNIOR, T, `{${PER.jugador},${PER.otro}}`]);
ok('Un cargo extra a varios jugadores de una vez', !r.error && r.rows[0].n === 2, r.error);
r = await como('tesorero', `select tes_guardar_movimiento($1, $2, null, '2026-03-20', 'egreso', 'liga', 'Cuota liga marzo', 450000, false) as id`, [JUNIOR, T]);
const mov = r.rows[0]?.id;
ok('El tesorero anota un egreso de caja', !r.error && mov, r.error);
r = await como('tesorero', `select tes_guardar_movimiento($1, $2, $3, '2026-03-20', 'egreso', 'liga', 'Cuota liga marzo', 460000, false)`, [SENIOR, T, mov]);
ok('…que no se corrige desde otro plantel', /Solo el tesorero/.test(r.error ?? ''), r.error);
r = await como('hacienda', `select tes_guardar_movimiento($1, $2, $3, '2026-03-20', 'egreso', 'liga', 'Cuota liga marzo', 460000, false)`, [SENIOR, T, mov]);
ok('…ni siquiera Hacienda lo cambia de plantel', /no es de este plantel/.test(r.error ?? ''), r.error);

// Lo que ve el jugador
x = (await como('jugador', 'select mi_tesoreria($1) as m', [T])).rows[0].m;
ok('El jugador ve su plan, su condición, sus extras y sus pagos', x.length === 1 && x[0].cuotas.length === 3
   && x[0].jugador.tipo === 'beca' && x[0].extras.length === 1 && x[0].pagos.length === 1, JSON.stringify(x));
ok('…y nada de otros jugadores', x[0].extras.every((e) => e.persona === PER.jugador) && x[0].pagos.every((p) => p.persona === PER.jugador));
x = (await como('otro', 'select mi_tesoreria($1) as m', [T])).rows[0].m;
ok('Un plantel sin plan no aparece en Mi cuota', x.length === 1 && x[0].equipo === JUNIOR, JSON.stringify(x));

// Cuentas de prueba: miran, no cambian
await como('prueba', 'select prueba_ver_como($1, $2)', ['tesorero', JUNIOR]);
x = (await como('prueba', 'select tes_planteles() as p')).rows[0].p;
ok('Tesorero de prueba ve su plantel, pero sin editar', x.length === 1 && !x[0].editar, JSON.stringify(x));
r = await como('prueba', `select tes_registrar_pago($1, $2, $3, 1000, '2026-03-12', 'efectivo', null)`, [JUNIOR, T, PER.jugador]);
ok('…y la base no lo deja registrar pagos', /no cambiarla/.test(r.error ?? ''), r.error);
await como('prueba', 'select prueba_ver_como($1)', ['hacienda']);
r = await como('prueba', 'select tes_guardar_plan($1, $2, $3::jsonb, 0)', [SENIOR, T, PLAN]);
ok('Hacienda de prueba tampoco cambia planes', /no cambiarla/.test(r.error ?? ''), r.error);

// Hacienda de verdad sí
r = await como('hacienda', 'select tes_guardar_plan($1, $2, $3::jsonb, 15)', [SENIOR, T, PLAN]);
ok('Hacienda edita el plan de cualquier plantel', !r.error, r.error);

// 0024: el perfil se alimenta desde Tesorería, y apodo
console.log('\nPerfil desde Tesorería y apodo (0024)');
const guardarJ = (quien, persona, datos) => como(quien, 'select tes_guardar_jugador($1, $2, $3, $4::jsonb)', [JUNIOR, T, persona, JSON.stringify(datos)]);
r = await guardarJ('tesorero', PER.sinCuenta, { nombre: 'Sin Cuenta Corregido', telefono: '922222222', correo: 'nuevo@correo.cl' });
x = (await db.query('select p.nombre, c.email, c.telefono from personas p join persona_contactos c on c.persona_id = p.id where p.id = $1', [PER.sinCuenta])).rows[0];
ok('Nombre, celular y correo del tesorero quedan en el perfil', !r.error && x?.nombre === 'Sin Cuenta Corregido' && x.email === 'nuevo@correo.cl' && x.telefono === '922222222', r.error ?? JSON.stringify(x));
await db.query(`insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000c1', 'nuevo@correo.cl')`);
await db.exec('set role authenticated');
await db.query(`select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', false), set_config('request.jwt.claims', '{"email":"nuevo@correo.cl"}', false)`);
x = (await db.query('select vincular_persona() as id')).rows[0].id; await db.exec('reset role');
ok('…y con ese correo el jugador entra a la app como él', x === PER.sinCuenta, x);
r = await guardarJ('tesorero', PER.jugador, { telefono: '933333333', correo: 'otro@correo.cl' });
x = (await db.query('select c.email, c.telefono, tj.correo as cobro from persona_contactos c join tes_jugadores tj on tj.persona_id = c.persona_id and tj.equipo_id = $2 where c.persona_id = $1', [PER.jugador, JUNIOR])).rows[0];
ok('Si ya tiene correo de la app, no se cambia: el nuevo queda solo para cobrar', !r.error && x.email === 'jugador@correo.cl' && x.cobro === 'otro@correo.cl' && x.telefono === '933333333', r.error ?? JSON.stringify(x));
r = await guardarJ('tesorero', PER.otro, { correo: 'jugador@correo.cl' });
x = (await db.query('select email from persona_contactos where persona_id = $1', [PER.otro])).rows[0];
ok('Un correo que ya usa otra persona no se copia al perfil', !r.error && !x?.email, r.error ?? JSON.stringify(x));
r = await guardarJ('tesorero', PER.jugador, { correo: 'no-es-correo' });
ok('Un correo mal escrito se rechaza', /no parece válido/.test(r.error ?? ''), r.error);
r = await guardarJ('tesorero', PER.jugador, { nombre: '  ' });
ok('El nombre no puede quedar vacío', /no puede quedar vacío/.test(r.error ?? ''), r.error);
r = await como('tesorero', 'select tes_guardar_jugador($1, $2, $3, $4::jsonb)', [SENIOR, T, PER.otro, JSON.stringify({ nombre: 'Cambiado' })]);
ok('El tesorero no cambia perfiles desde otro plantel', /Solo el tesorero/.test(r.error ?? ''), r.error);
r = await como('jugador', 'update persona_contactos set telefono = $1 where persona_id = $2', ['900000000', PER.jugador]);
ok('El jugador no edita su contacto desde el navegador', /permission denied/.test(r.error ?? ''), r.error);
x = (await ver('tesorero', JUNIOR)).rows[0].v.jugadores.find((j) => j.id === PER.jugador);
ok('tes_ver trae el celular del perfil y el correo para cobrar', x.telefono === '933333333' && x.correo === 'otro@correo.cl' && x.correo_perfil === 'jugador@correo.cl', JSON.stringify(x));

r = await como('jugador', `select mi_apodo_guardar('el Checho')`);
x = (await como('otro', 'select apodos() as a')).rows[0].a;
ok('Cada jugador se pone su apodo y el club lo ve', !r.error && x[PER.jugador] === 'el Checho', r.error ?? JSON.stringify(x));
ok('…y lo lee de vuelta', (await como('jugador', 'select mi_apodo() as a')).rows[0].a === 'el Checho');
r = await como('jugador', `select mi_apodo_guardar('un apodo larguísimo de verdad')`);
ok('Apodo de más de 20 letras no', /hasta 20/.test(r.error ?? ''), r.error);
r = await como('jugador', `select mi_apodo_guardar('')`);
x = (await como('otro', 'select apodos() as a')).rows[0].a;
ok('Borrar el apodo lo quita', !r.error && !(PER.jugador in x), r.error);
r = await anon('select apodos()');
ok('Sin cuenta no se leen los apodos', /permission denied/.test(r.error ?? ''), r.error);

// RUT y fecha de nacimiento (0029)
console.log('\nRUT y fecha de nacimiento');
const identidad = (quien, equipo, persona, datos) =>
  como(quien, 'select tes_guardar_identidad($1, $2, $3::jsonb)', [equipo, persona, JSON.stringify(datos)]);
r = await como('jugador', `select rut_normalizar('12.345.678-5') as r`);
ok('El RUT se guarda sin puntos y con guion', r.rows[0]?.r === '12345678-5', r.error ?? JSON.stringify(r.rows));
r = await como('jugador', `select rut_normalizar('10.000.013-k') as r`);
ok('…y la K en mayúscula', r.rows[0]?.r === '10000013-K', r.error ?? JSON.stringify(r.rows));
r = await identidad('tesorero', JUNIOR, PER.jugador, { rut: '12.345.678-9' });
ok('Un RUT con el dígito malo se rechaza', /no calza/.test(r.error ?? ''), r.error);
r = await identidad('tesorero', JUNIOR, PER.jugador, { rut: 'hola' });
ok('Un RUT sin forma se rechaza', /no parece válido/.test(r.error ?? ''), r.error);
r = await identidad('tesorero', JUNIOR, PER.jugador, { rut: '12.345.678-5', nacimiento: '1990-03-14' });
x = (await ver('tesorero', JUNIOR)).rows[0].v.jugadores.find((j) => j.id === PER.jugador);
ok('El tesorero carga RUT y fecha de su jugador y los ve', !r.error && x.rut === '12345678-5' && x.nacimiento === '1990-03-14', r.error ?? JSON.stringify(x));
x = (await como('jugador', 'select perfil_ver() as p')).rows[0].p;
ok('La fecha queda en el perfil del jugador', x.nacimiento === '1990-03-14' && x.cumple === '03-14', JSON.stringify(x));
x = (await como('otro', 'select perfil_ver($1) as p', [PER.jugador])).rows[0].p;
ok('El resto del club ve solo el día y el mes', x.cumple === '03-14' && x.nacimiento == null && !('rut' in x), JSON.stringify(x));
r = await identidad('tesorero', JUNIOR, PER.otro, { rut: '12345678-5' });
ok('Un RUT no se repite entre dos personas', /ya está cargado/.test(r.error ?? ''), r.error);
r = await identidad('tesorero', SENIOR, PER.otro, { rut: '11111111-1' });
ok('El tesorero no carga RUT en otro plantel', /Solo el tesorero/.test(r.error ?? ''), r.error);
r = await identidad('hacienda', JUNIOR, PER.hacienda, { rut: '11111111-1' });
ok('Solo a jugadores del plantel', /no es de este plantel/.test(r.error ?? ''), r.error);
r = await identidad('tesorero', JUNIOR, PER.jugador, { nacimiento: '2030-01-01' });
ok('Una fecha imposible se rechaza', /Revisa la fecha/.test(r.error ?? ''), r.error);
r = await identidad('hacienda', SENIOR, PER.otro, { rut: '22.222.222-2' });
ok('Hacienda carga en cualquier plantel', !r.error, r.error);
r = await identidad('tesorero', JUNIOR, PER.jugador, { nacimiento: '' });
x = (await ver('tesorero', JUNIOR)).rows[0].v.jugadores.find((j) => j.id === PER.jugador);
ok('Mandar solo la fecha vacía la borra y deja el RUT', !r.error && x.nacimiento == null && x.rut === '12345678-5', r.error ?? JSON.stringify(x));
r = await identidad('jugador', JUNIOR, PER.jugador, { rut: '11111111-1' });
ok('El jugador no se cambia el RUT', /Solo el tesorero/.test(r.error ?? ''), r.error);
r = await como('jugador', 'select rut from persona_contactos');
ok('El RUT no se lee desde el navegador', /permission denied/.test(r.error ?? ''), r.error);
await como('prueba', 'select prueba_ver_como($1, $2)', ['tesorero', JUNIOR]);
r = await ver('prueba', JUNIOR);
x = r.rows[0]?.v.jugadores.find((j) => j.id === PER.jugador);
ok('Una cuenta de prueba no ve RUT ni fecha', !r.error && x && x.rut == null && x.nacimiento == null, r.error ?? JSON.stringify(x));
r = await identidad('prueba', JUNIOR, PER.jugador, { rut: '11111111-1' });
ok('…ni los cambia', !!r.error, r.error);

console.log(`\n${pass} pruebas pasaron, ${fail} fallaron.`);
process.exit(fail ? 1 : 0);
