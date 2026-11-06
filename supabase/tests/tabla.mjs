// Prueba la tabla de posiciones (0026) en un Postgres en memoria (PGlite),
// con todas las migraciones en orden.
//   npm run test:tabla (también corre con npm run test:db)
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
// La extensión http de Supabase, de mentira: responde lo que diga la tabla
// extensions.respuesta (así se prueba la 0032 sin salir a internet).
await db.exec(`
  create schema extensions;
  create table extensions.respuesta (status int, content text, pedida text);
  insert into extensions.respuesta values (200, '[]', null);
  create type extensions.http_response as (status int, content_type varchar, content varchar);
  create function extensions.http_set_curlopt(curlopt varchar, value varchar) returns boolean language sql as $$ select true $$;
  create function extensions.http_get(uri varchar) returns extensions.http_response language plpgsql as $$
  declare r extensions.http_response;
  begin
    update extensions.respuesta set pedida = uri;
    select status, 'application/json', content into r from extensions.respuesta limit 1;
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

const U = { admin: '00000000-0000-0000-0000-0000000000e1', encargado: '00000000-0000-0000-0000-0000000000e2',
            jugador: '00000000-0000-0000-0000-0000000000e3', prueba: '00000000-0000-0000-0000-0000000000e4' };
const PER = { admin: '20000000-0000-0000-0000-0000000000e1', encargado: '20000000-0000-0000-0000-0000000000e2',
              jugador: '20000000-0000-0000-0000-0000000000e3', prueba: '20000000-0000-0000-0000-0000000000e4' };
const JUNIOR = '40000000-0000-0000-0000-0000000000e1';
const SENIOR = '40000000-0000-0000-0000-0000000000e2';
await db.exec(`
  insert into auth.users (id, email) values ${Object.entries(U).map(([k, id]) => `('${id}', '${k}@correo.cl')`).join(', ')};
  insert into equipos (id, club_id, nombre, orden) values ('${JUNIOR}', '${CLUB}', 'Junior Inventado', 1), ('${SENIOR}', '${CLUB}', 'Senior Inventado', 2);
  insert into personas (id, club_id, nombre, user_id, es_admin) values
    ('${PER.admin}', '${CLUB}', 'Admin Inventado', '${U.admin}', true),
    ('${PER.encargado}', '${CLUB}', 'Encargado Inventado', '${U.encargado}', false),
    ('${PER.jugador}', '${CLUB}', 'Jugador Inventado', '${U.jugador}', false);
  insert into personas (id, club_id, nombre, user_id, prueba_roles) values
    ('${PER.prueba}', '${CLUB}', 'Cuenta de Prueba Inventada', '${U.prueba}', array['socio']);
  insert into persona_equipos (persona_id, equipo_id, rol) values
    ('${PER.encargado}', '${JUNIOR}', 'encargado'), ('${PER.jugador}', '${JUNIOR}', 'jugador'),
    ('${PER.prueba}', '${JUNIOR}', 'encargado');
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
const fila = (equipo, n, extra = {}) => ({ equipo, pj: n, pg: n, pe: 0, pp: 0, gf: n * 2, gc: 0, pts: n * 3, ...extra });
const guardar = (quien, equipo, filas, fuente = 'https://liga.ejemplo/tabla') =>
  como(quien, 'select tabla_guardar($1, $2, $3::jsonb, $4)', [equipo, 'Liga Inventada', JSON.stringify(filas), fuente]);
const tablas = async (quien) => (await como(quien, 'select tablas_posiciones() as t')).rows[0]?.t;
let r, x;

console.log('\nTabla de posiciones');

x = await tablas('jugador');
ok('Todos los planteles vienen, aunque no tengan tabla', x.length === 2 && x[0].equipo === 'Junior Inventado' && x[0].filas.length === 0, JSON.stringify(x));
ok('El jugador no puede editar', x.every((t) => !t.puedo_editar));
ok('El encargado puede editar solo su plantel', (await tablas('encargado')).map((t) => t.puedo_editar).join() === 'true,false');
ok('La cuenta de prueba encargada no puede editar', (await tablas('prueba')).every((t) => !t.puedo_editar));

r = await guardar('encargado', JUNIOR, [fila('Rival Uno', 5), fila('Hugo Jara', 4, { es_jara: true, extra: 'x' }), fila('Rival Dos', 1)]);
ok('El encargado guarda la tabla de su plantel', !r.error, r.error);
x = (await tablas('jugador'))[0];
ok('El club la ve en orden, con el Jara marcado', x.filas.map((f) => f.equipo).join() === 'Rival Uno,Hugo Jara,Rival Dos' && x.filas[1].es_jara && x.fuente === 'https://liga.ejemplo/tabla' && x.torneo === 'Liga Inventada', JSON.stringify(x));
ok('Solo se guardan los campos conocidos', !('extra' in x.filas[1]) && x.filas[1].pts === 12, JSON.stringify(x.filas[1]));

r = await guardar('encargado', JUNIOR, [fila('Hugo Jara', 5, { es_jara: true }), fila('Rival Uno', 5)]);
x = (await tablas('jugador'))[0];
ok('Guardar de nuevo reemplaza la tabla', !r.error && x.filas.length === 2 && x.filas[0].equipo === 'Hugo Jara', r.error);

r = await guardar('encargado', SENIOR, [fila('Rival', 1)]);
ok('El encargado no toca la tabla de otro plantel', /Solo el encargado/.test(r.error ?? ''), r.error);
r = await guardar('jugador', JUNIOR, [fila('Rival', 1)]);
ok('El jugador no cambia la tabla', /Solo el encargado/.test(r.error ?? ''), r.error);
r = await guardar('prueba', JUNIOR, [fila('Rival', 1)]);
ok('La cuenta de prueba no cambia la tabla', /Cuenta de prueba/.test(r.error ?? ''), r.error);
r = await guardar('admin', SENIOR, [fila('Rival', 1, { pts: -2 })]);
ok('Un administrador guarda cualquier plantel (y los puntos pueden ser negativos)', !r.error, r.error);

r = await guardar('encargado', JUNIOR, [fila('Rival', 1, { pj: -1 })]);
ok('No pasan partidos negativos', /Revisa los números/.test(r.error ?? ''), r.error);
r = await guardar('encargado', JUNIOR, [fila('Rival', 1, { gf: 'muchos' })]);
ok('No pasan números que no son números', /Revisa los números/.test(r.error ?? ''), r.error);
r = await guardar('encargado', JUNIOR, [fila('', 1)]);
ok('No pasan filas sin equipo', /sin nombre/.test(r.error ?? ''), r.error);
r = await guardar('encargado', JUNIOR, [fila('A', 1, { es_jara: true }), fila('B', 1, { es_jara: true })]);
ok('Solo una fila es el Jara', /solo una fila/.test(r.error ?? ''), r.error);
r = await guardar('encargado', JUNIOR, [fila('A', 1)], 'javascript:alert(1)');
ok('El link de la liga tiene que ser https', /https/.test(r.error ?? ''), r.error);
x = (await tablas('jugador'))[0];
ok('Un guardado fallido no cambia la tabla', x.filas[0].equipo === 'Hugo Jara', JSON.stringify(x.filas));

r = await como('jugador', 'select * from tablas_posiciones');
ok('La tabla no se lee directo desde el navegador', /permission denied/.test(r.error ?? ''), r.error);
r = await anon('select tablas_posiciones()');
ok('Sin cuenta no se ve la tabla', /permission denied/.test(r.error ?? ''), r.error);


console.log('\nTabla desde la liga (Deporstar)');
const liga = (filas) => JSON.stringify(filas.map(([team, pj, pg, pe, pp, gf, gc, pts], i) =>
  ({ fixture: 71290, team, ins: i, bonus: 0, pg, pp, pe, gf, gc, pj, dg: gf - gc, pts, ext: 0, last_results: 'G', team_delete: false, enable: true, team_img: '' })));
const responder = (status, content) => db.query('update extensions.respuesta set status = $1, content = $2, pedida = null', [status, content]);
await responder(200, liga([['Mantis', 4, 4, 0, 0, 14, 2, 12], ['Hugo Jara Sr', 4, 1, 1, 2, 5, 10, 4], ['Henry FC', 3, 0, 0, 3, 1, 9, 0]]));

r = await como('jugador', 'select tabla_refrescar($1)', [SENIOR]);
ok('Sin conectar no se actualiza desde la liga', /no está conectada/.test(r.error ?? ''), r.error);
r = await como('jugador', 'select tabla_conectar($1, 71290)', [JUNIOR]);
ok('El jugador no conecta la tabla', /Solo el encargado/.test(r.error ?? ''), r.error);
r = await como('prueba', 'select tabla_conectar($1, 71290)', [JUNIOR]);
ok('La cuenta de prueba no conecta la tabla', /Cuenta de prueba/.test(r.error ?? ''), r.error);
r = await como('encargado', 'select tabla_conectar($1, 71290)', [JUNIOR]);
ok('El encargado conecta su tabla a la liga', !r.error, r.error);
x = (await tablas('jugador'))[0];
ok('La tabla dice que está conectada', x.conectada === true && x.deporstar_tabla === 71290, JSON.stringify(x));

r = await como('jugador', 'select tabla_refrescar($1) as cambio', [JUNIOR]);
x = (await tablas('jugador'))[0];
const pedida = (await db.query('select pedida from extensions.respuesta')).rows[0].pedida;
ok('Al abrirla, cualquier socio la trae de la liga', !r.error && r.rows[0]?.cambio === true, r.error);
ok('…pide solo la dirección de Deporstar con el número', pedida === 'https://api.deporstar.com/api/fixture/match/tabla-positions/71290/', pedida);
ok('…y queda en orden, con el Jara marcado y los números', x.filas.map((f) => f.equipo).join() === 'Mantis,Hugo Jara Sr,Henry FC'
  && x.filas[1].es_jara && !x.filas[0].es_jara && x.filas[1].pts === 4 && x.filas[1].gc === 10 && !('team_img' in x.filas[0]), JSON.stringify(x.filas));

await responder(200, liga([['Otro', 1, 1, 0, 0, 1, 0, 3]]));
r = await como('jugador', 'select tabla_refrescar($1) as cambio', [JUNIOR]);
ok('Antes de 3 horas no vuelve a preguntar', !r.error && r.rows[0]?.cambio === false && (await tablas('jugador'))[0].filas.length === 3, r.error);
r = await como('jugador', 'select tabla_refrescar($1, true)', [JUNIOR]);
ok('El jugador no fuerza la actualización', /Solo el encargado/.test(r.error ?? ''), r.error);
r = await como('encargado', 'select tabla_refrescar($1, true) as cambio', [JUNIOR]);
ok('El encargado la actualiza en el acto', !r.error && r.rows[0]?.cambio === true && (await tablas('jugador'))[0].filas[0].equipo === 'Otro', r.error);

await responder(500, 'error');
r = await como('encargado', 'select tabla_refrescar($1, true)', [JUNIOR]);
ok('Si la liga no responde, se avisa y no se borra la tabla', /no respondió/.test(r.error ?? '') && (await tablas('jugador'))[0].filas.length === 1, r.error);
await responder(200, '<html>caído</html>');
r = await como('encargado', 'select tabla_refrescar($1, true)', [JUNIOR]);
ok('Si la liga responde otra cosa, tampoco', /no es una tabla/.test(r.error ?? ''), r.error);
await responder(200, '[]');
r = await como('encargado', 'select tabla_refrescar($1, true)', [JUNIOR]);
ok('Una tabla vacía de la liga no borra la nuestra', /no devolvió una tabla/.test(r.error ?? '') && (await tablas('jugador'))[0].filas.length === 1, r.error);

r = await como('jugador', 'select * from tabla_desde_deporstar($1::jsonb)', ['[]']);
ok('La función interna no se llama desde el navegador', /permission denied/.test(r.error ?? ''), r.error);
r = await anon('select tabla_refrescar($1)', [JUNIOR]);
ok('Sin cuenta no se actualiza', /permission denied/.test(r.error ?? ''), r.error);
r = await como('encargado', 'select tabla_conectar($1, null)', [JUNIOR]);
x = (await tablas('jugador'))[0];
ok('Se puede desconectar y la tabla queda', !r.error && x.conectada === false && x.filas.length === 1, r.error);

console.log('\nVarias tablas por plantel (0036)');
const guardarEn = (quien, grupo, filas, antes = null) =>
  como(quien, 'select tabla_guardar($1, $2, $3::jsonb, null, $4, $5)', [JUNIOR, 'Liga Inventada', JSON.stringify(filas), grupo, antes]);
r = await guardarEn('encargado', 'General', [fila('Rival Uno', 5), fila('Hugo Jara', 2, { es_jara: true })]);
x = (await tablas('jugador')).filter((t) => t.equipo_id === JUNIOR);
ok('El encargado agrega una segunda pestaña', !r.error && x.length === 2 && x[0].grupo === '' && x[1].grupo === 'General' && x[1].filas.length === 2, r.error ?? JSON.stringify(x));
ok('La primera pestaña sigue igual (con su conexión)', x[0].filas.length === 1 && x[0].conectada === false);
r = await guardarEn('encargado', 'Grupo A', [fila('Rival Uno', 5)], '');
x = (await tablas('jugador')).filter((t) => t.equipo_id === JUNIOR);
ok('Se puede renombrar una pestaña', !r.error && x.map((t) => t.grupo).join() === 'Grupo A,General', r.error ?? JSON.stringify(x.map((t) => t.grupo)));
r = await guardarEn('encargado', 'General', [fila('Rival Uno', 5)], 'Grupo A');
ok('No se puede renombrar a un nombre que ya existe', /Ya hay una tabla/.test(r.error ?? ''), r.error);
r = await guardarEn('jugador', 'Otra', [fila('Rival Uno', 5)]);
ok('El jugador no agrega pestañas', /Solo el encargado/.test(r.error ?? ''), r.error);
r = await guardarEn('encargado', 'x'.repeat(40), [fila('Rival Uno', 5)]);
x = (await tablas('jugador')).filter((t) => t.equipo_id === JUNIOR);
ok('El nombre de la pestaña se corta a 30 letras', !r.error && x.some((t) => t.grupo === 'x'.repeat(30)), r.error);
r = await como('jugador', 'select tabla_borrar($1, $2)', [JUNIOR, 'General']);
ok('El jugador no borra pestañas', /Solo el encargado/.test(r.error ?? ''), r.error);
r = await como('prueba', 'select tabla_borrar($1, $2)', [JUNIOR, 'General']);
ok('La cuenta de prueba no borra pestañas', !!r.error, r.error);
r = await como('encargado', 'select tabla_borrar($1, $2)', [JUNIOR, 'x'.repeat(30)]);
x = (await tablas('jugador')).filter((t) => t.equipo_id === JUNIOR);
ok('El encargado borra una pestaña', !r.error && x.map((t) => t.grupo).join() === 'Grupo A,General', r.error ?? JSON.stringify(x.map((t) => t.grupo)));
await como('encargado', 'select tabla_conectar($1, 555, $2)', [JUNIOR, 'General']);
await responder(200, liga([['Liga Uno', 1, 1, 0, 0, 1, 0, 3], ['Hugo Jara', 1, 0, 0, 1, 0, 1, 0]]));
r = await como('encargado', 'select tabla_refrescar($1, true, $2) as cambio', [JUNIOR, 'General']);
x = (await tablas('jugador')).filter((t) => t.equipo_id === JUNIOR);
ok('Cada pestaña se conecta y actualiza por su cuenta', !r.error && x[1].filas[0].equipo === 'Liga Uno' && x[1].conectada && x[0].filas.length === 1 && !x[0].conectada, r.error ?? JSON.stringify(x));
r = await anon('select tabla_borrar($1, $2)', [JUNIOR, 'General']);
ok('Sin cuenta no se borra', /permission denied/.test(r.error ?? ''), r.error);

console.log(`\n${pass} pruebas pasaron, ${fail} fallaron.`);
process.exit(fail ? 1 : 0);
