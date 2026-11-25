// B3: permisos y comportamiento de las RPC con una base y cuentas ficticias.
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';

const db = new PGlite();
const migrations = new URL('../migrations/', import.meta.url);
const mig = (f) => readFileSync(new URL(f, migrations), 'utf8');
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
const migs = readdirSync(migrations).filter((f) => f.endsWith('.sql')).sort();
for (const f of migs) {
  await db.exec(mig(f));
  if (f.startsWith('0001_')) await db.exec(`insert into clubes (id, nombre, slug) values ('${CLUB}', 'Club de prueba', 'hugo-jara')`);
}


const uuid = (i) => `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`;
const [sabado, jueves, junior, otroClub, plantelAjeno, plantelExcluido] = [1, 2, 3, 4, 5, 6].map(uuid);
const actores = {
  com: [10, CLUB, true, false, []],
  prueba: [11, CLUB, true, true, []],
  sinPlantel: [12, CLUB, false, false, []],
  ambos: [13, CLUB, false, false, [jueves, sabado]],
  jugadorSabado: [14, CLUB, false, false, [sabado]],
  jugadorJueves: [15, CLUB, false, false, [jueves]],
  jugadorJunior: [16, CLUB, false, false, [junior]],
  comunicacionesAjenas: [17, otroClub, true, false, [plantelAjeno]],
};

await db.query("insert into clubes(id, nombre, slug) values ($1, 'Otro club ficticio', 'otro-club-ficticio')", [otroClub]);
for (const [id, club, nombre] of [
  [sabado, CLUB, 'Senior Sábado'], [jueves, CLUB, 'Sénior Jueves'], [junior, CLUB, 'Junior Sábado'],
  [plantelAjeno, otroClub, 'Senior Sábado'], [plantelExcluido, CLUB, 'Otro plantel ficticio'],
]) {
  await db.query('insert into equipos(id, club_id, nombre) values ($1,$2,$3)', [id, club, nombre]);
}
for (const [nombre, [numero, club, com, prueba, equipos]] of Object.entries(actores)) {
  const user = uuid(numero + 100);
  await db.query('insert into auth.users(id) values ($1)', [user]);
  await db.query(`insert into personas(id, user_id, club_id, nombre, edita_comunicaciones, prueba_roles)
                  values ($1,$2,$3,$4,$5,$6)`, [uuid(numero), user, club, nombre, com, prueba ? ['comunicaciones'] : null]);
  for (const equipo of equipos) {
    await db.query('insert into persona_equipos(persona_id, equipo_id) values ($1,$2)', [uuid(numero), equipo]);
  }
}

async function como(actor, sql, params = [], rol = 'authenticated') {
  await db.exec(`set role ${rol}`);
  try {
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [actor ? uuid(actores[actor][0] + 100) : '']);
    return (await db.query(sql, params)).rows[0]?.resultado;
  } finally {
    await db.exec('reset role');
  }
}

const rpc = (actor, llamada, params) => como(actor, `select ${llamada} as resultado`, params);
const publicar = (actor, equipo, vigencia = '3d', tipo = 'suspension', titulo = 'Partido suspendido') =>
  rpc(actor, 'aviso_publicar($1,$2,$3,$4,$5)', [titulo, 'Mensaje de prueba', tipo, equipo, vigencia]);
const historial = (actor, estado = null) => rpc(actor, 'avisos_historial($1)', [estado]);
const listar = (actor) => rpc(actor, 'avisos_vigentes()');
const abrir = (actor, id) => rpc(actor, 'aviso_abrir($1)', [id]);
const retirar = (actor, id) => rpc(actor, 'aviso_retirar($1)', [id]);
const editar = (actor, aviso, { renotificar = false, cambiar = false, vencimiento = null, equipo = aviso.equipo_id } = {}) =>
  rpc(actor, 'aviso_editar($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    [aviso.id, 'Título editado', 'Mensaje editado', aviso.tipo, equipo, cambiar, vencimiento, renotificar, aviso.modificado_en]);
const fila = async (id) => (await historial('com')).avisos.find((aviso) => aviso.id === id);
const leido = async (actor, id) => (await listar(actor)).find((aviso) => aviso.id === id)?.leido;

const general = await publicar('com', null, 'manual', 'informativo');
const delSabado = await publicar('com', sabado, '24h', 'horario');
const delJueves = await publicar('com', jueves);
const delJunior = await publicar('com', junior, '7d', 'recordatorio');
const delOtroClub = await publicar('comunicacionesAjenas', plantelAjeno, 'manual', 'importante');
assert.deepEqual(new Set((await historial('com')).planteles.map((e) => e.id)), new Set([sabado, jueves, junior]));
for (const [actor, esperados] of [
  ['sinPlantel', [general]], ['jugadorSabado', [general, delSabado]],
  ['jugadorJueves', [general, delJueves]], ['jugadorJunior', [general, delJunior]],
  ['ambos', [general, delSabado, delJueves]], ['comunicacionesAjenas', [delOtroClub]],
]) {
  assert.deepEqual(new Set((await listar(actor)).map((a) => a.id)), new Set(esperados), actor);
}
assert.deepEqual(await listar(null), []);
assert.equal(await abrir('jugadorJunior', delJueves), null);
assert.equal(await abrir('comunicacionesAjenas', delJueves), null);
assert.equal(await abrir('com', delJueves), null);
console.log('OK · Cuatro destinatarios, club, pertenencias múltiples, socio sin plantel y apertura por ID');

const inicial = await fila(delJueves);
assert.equal(inicial.autor, 'com');
for (const [id, horas] of [[delSabado, 24], [delJueves, 72], [delJunior, 168]]) {
  const aviso = await fila(id);
  assert.equal(Date.parse(aviso.vence_en) - Date.parse(aviso.publicado_en), horas * 3600000);
}
assert.equal((await fila(general)).vence_en, null);
for (const equipo of [plantelExcluido, plantelAjeno]) await assert.rejects(publicar('com', equipo), /plantel/);
await assert.rejects(publicar('com', null, '1d'), /vigencia/);
await assert.rejects(publicar('com', null, '24h', 'incorrecto'), /check constraint/);
for (const actor of ['jugadorSabado', 'prueba']) {
  await assert.rejects(historial(actor), /Solo Comunicaciones/);
  await assert.rejects(publicar(actor, null), /Solo Comunicaciones/);
  await assert.rejects(editar(actor, inicial), /Solo Comunicaciones/);
  await assert.rejects(retirar(actor, delJueves), /Solo Comunicaciones/);
}
await assert.rejects(editar('comunicacionesAjenas', inicial, { equipo: null }), /no está disponible/);
await retirar('comunicacionesAjenas', delJueves);
assert.equal((await fila(delJueves)).estado, 'vigente');
await assert.rejects(como(null, 'select avisos_vigentes()', [], 'anon'), /permission denied/);
await assert.rejects(como('com', 'select * from avisos'), /permission denied/);
await assert.rejects(como('com', 'select * from aviso_lecturas'), /permission denied/);
await assert.rejects(rpc('com', 'avisos_puedo_gestionar()'), /permission denied/);
console.log('OK · Vigencias, entradas inválidas, historial privado, bloqueo de escrituras para cuentas de prueba y acceso directo');

assert.equal(await leido('jugadorJueves', delJueves), false);
assert.equal((await abrir('jugadorJueves', delJueves)).leido, true);
assert.equal((await abrir('jugadorJueves', delJueves)).leido, true);
assert.equal(await leido('jugadorJueves', delJueves), true);
assert.equal(await leido('ambos', delJueves), false);
assert.equal((await db.query('select count(*)::int as n from aviso_lecturas')).rows[0].n, 1);

await editar('com', inicial);
let editado = await fila(delJueves);
assert.equal(editado.titulo, 'Título editado');
assert.equal(editado.publicado_en, inicial.publicado_en);
assert.equal(editado.vence_en, inicial.vence_en);
assert.equal(editado.version, 1);
assert.ok(editado.modificado_en);
assert.equal(await leido('jugadorJueves', delJueves), true);
await assert.rejects(editar('com', inicial), /cambió/);
await assert.rejects(editar('com', editado, { cambiar: true, vencimiento: '2000-01-01T00:00:00Z' }), /fecha futura/);
const extendidoHasta = new Date(Date.now() + 10 * 86400000);
await editar('com', editado, { cambiar: true, vencimiento: extendidoHasta.toISOString() });
editado = await fila(delJueves);
assert.equal(Date.parse(editado.vence_en), +extendidoHasta);
assert.equal(await leido('jugadorJueves', delJueves), true);
await editar('com', editado, { renotificar: true, equipo: sabado });
editado = await fila(delJueves);
assert.equal(editado.version, 2);
assert.equal(Date.parse(editado.vence_en), +extendidoHasta);
assert.equal(await abrir('jugadorJueves', delJueves), null);
assert.equal(await leido('ambos', delJueves), false);
assert.equal((await abrir('ambos', delJueves)).version, 2);
assert.equal(await leido('ambos', delJueves), true);
console.log('OK · Lectura por cuenta, idempotencia, edición, extensión, renotificación y cambio de público');

await db.query(`update avisos set publicado_en = now() - interval '4 days', vence_en = now() - interval '1 day'
                where id = $1`, [delJunior]);
assert.equal(await abrir('jugadorJunior', delJunior), null);
assert.equal(await leido('jugadorJunior', delJunior), undefined);
assert.equal((await historial('com', 'vencido')).avisos[0].id, delJunior);
await retirar('com', delJueves);
assert.equal(await abrir('ambos', delJueves), null);
assert.equal(await leido('ambos', delJueves), undefined);
assert.equal((await historial('com', 'retirado')).avisos[0].id, delJueves);
assert.deepEqual(new Set((await historial('com', 'vigente')).avisos.map((a) => a.id)), new Set([general, delSabado]));
assert.equal((await historial('com')).avisos.length, 4);
console.log('OK · Vencimiento automático, retiro, filtros y conservación del historial');
await db.close();
