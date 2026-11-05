// Prueba el jugador del partido (MVP), los comentarios y las reacciones (0027)
// en un Postgres en memoria (PGlite), con todas las migraciones en orden.
//   npm run test:charla (también corre con npm run test:db)
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

const ids = ['enc', 'a', 'b', 'c', 'd', 'comu', 'prueba', 'admin'];
const U = Object.fromEntries(ids.map((k, i) => [k, `00000000-0000-0000-0000-0000000000${(0xc1 + i).toString(16)}`]));
const PER = Object.fromEntries(ids.map((k, i) => [k, `20000000-0000-0000-0000-0000000000${(0xc1 + i).toString(16)}`]));
const PLANTEL = '40000000-0000-0000-0000-000000000001';
const OTRO = '40000000-0000-0000-0000-000000000002';
const P = { hoy: '50000000-0000-0000-0000-000000000001', ayer: '50000000-0000-0000-0000-000000000002',
            viejo: '50000000-0000-0000-0000-000000000003', sin: '50000000-0000-0000-0000-000000000004',
            otro: '50000000-0000-0000-0000-000000000005' };
await db.exec(`
  insert into auth.users (id, email) values ${ids.map((k) => `('${U[k]}', '${k}@correo.cl')`).join(', ')};
  insert into equipos (id, club_id, nombre, orden) values ('${PLANTEL}', '${CLUB}', 'Plantel Inventado', 1), ('${OTRO}', '${CLUB}', 'Otro Plantel Inventado', 2);
  insert into personas (id, club_id, nombre, user_id) values
    ${ids.map((k) => `('${PER[k]}', '${CLUB}', 'Persona ${k} Inventada', '${U[k]}')`).join(', ')};
  update personas set edita_comunicaciones = true where id in ('${PER.comu}', '${PER.prueba}');
  update personas set prueba_roles = array['socio', 'comunicaciones'], prueba_rol = 'comunicaciones' where id = '${PER.prueba}';
  update personas set es_admin = true where id = '${PER.admin}';
  insert into persona_equipos (persona_id, equipo_id, rol) values
    ('${PER.enc}', '${PLANTEL}', 'encargado'), ('${PER.a}', '${PLANTEL}', 'jugador'), ('${PER.b}', '${PLANTEL}', 'jugador'),
    ('${PER.c}', '${PLANTEL}', 'jugador'), ('${PER.d}', '${PLANTEL}', 'jugador');
  insert into partidos (id, club_id, equipo_id, rival, fecha, goles_favor, goles_contra) values
    ('${P.hoy}', '${CLUB}', '${PLANTEL}', 'Rival Inventado', hoy(), 2, 1),
    ('${P.ayer}', '${CLUB}', '${PLANTEL}', 'Rival Inventado', hoy() - 1, 0, 0),
    ('${P.viejo}', '${CLUB}', '${PLANTEL}', 'Rival Inventado', hoy() - 7, 3, 0),
    ('${P.sin}', '${CLUB}', '${PLANTEL}', 'Rival Inventado', hoy(), null, null),
    ('${P.otro}', '${CLUB}', '${OTRO}', 'Rival Inventado', hoy() - 10, 1, 0);
  insert into partido_jugadores (partido_id, persona_id)
    select p, x from unnest(array['${P.hoy}', '${P.ayer}', '${P.viejo}', '${P.otro}']::uuid[]) p,
                     unnest(array['${PER.a}', '${PER.b}', '${PER.c}']::uuid[]) x;
  insert into partido_votos (partido_id, votante_id, elegido_id) values
    ('${P.viejo}', '${PER.a}', '${PER.b}'), ('${P.viejo}', '${PER.c}', '${PER.b}'), ('${P.viejo}', '${PER.b}', '${PER.a}'),
    ('${P.otro}', '${PER.a}', '${PER.b}'), ('${P.otro}', '${PER.b}', '${PER.a}');
`);

async function como(quien, sql, params = []) {
  await db.exec('set role authenticated');
  await db.query(`select set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claims', $2, false)`,
                 [U[quien], JSON.stringify({ email: `${quien}@correo.cl` })]);
  try { const r = await db.query(sql, params); return { rows: r.rows, error: null }; }
  catch (e) { return { rows: [], error: e.message }; }
  finally { await db.exec('reset role'); }
}
const charla = async (quien, partido) => {
  const r = await como(quien, 'select partido_charla($1) as c', [partido]);
  if (r.error) throw new Error(r.error);
  return r.rows[0].c;
};
const votar = (quien, partido, elegido) => como(quien, 'select mvp_votar($1, $2)', [partido, PER[elegido]]);
let r, x;

console.log('\nJugador del partido');
x = await charla('a', P.hoy);
ok('Partido de hoy con resultado: votación abierta', x.mvp.abierta && !x.mvp.cerrada && x.mvp.puedo_votar && x.mvp.candidatos.length === 3);
x = await charla('d', P.hoy);
ok('Quien no jugó ve la votación pero no puede votar', x.mvp.abierta && !x.mvp.puedo_votar && !x.mvp.jugue);
r = await votar('d', P.hoy, 'a');
ok('…y la base se lo rechaza', /Votan solo los que jugaron/.test(r.error ?? ''), r.error);
r = await votar('a', P.hoy, 'a');
ok('No se puede votar por uno mismo', /No puedes votar por ti mismo/.test(r.error ?? ''), r.error);
r = await votar('a', P.hoy, 'd');
ok('Solo se vota por alguien que jugó', /alguien que jugó/.test(r.error ?? ''), r.error);
r = await votar('a', P.hoy, 'b');
ok('Un jugador vota', !r.error, r.error);
r = await votar('a', P.hoy, 'c');
x = await charla('a', P.hoy);
ok('…y puede cambiar su voto mientras está abierta', !r.error && x.mvp.mi_voto === PER.c && x.mvp.votaron === 1, r.error);
ok('Mientras está abierta no se ve el conteo', x.mvp.ganadores.length === 0);
r = await votar('b', P.sin, 'a');
ok('Sin resultado no se vota', /cuando se anota el resultado/.test(r.error ?? ''), r.error);
x = await charla('a', P.ayer);
r = await votar('a', P.ayer, 'b');
ok('Partido de ayer: sigue abierta hasta esta noche', x.mvp.abierta && !r.error, r.error);
await db.exec(`insert into partidos (id, club_id, equipo_id, rival, fecha, goles_favor, goles_contra)
  values ('50000000-0000-0000-0000-000000000007', '${CLUB}', '${PLANTEL}', 'Rival Inventado', hoy() - 6, 1, 0);
  insert into partido_jugadores (partido_id, persona_id) values
  ('50000000-0000-0000-0000-000000000007', '${PER.a}'), ('50000000-0000-0000-0000-000000000007', '${PER.b}');`);
x = await charla('a', '50000000-0000-0000-0000-000000000007');
r = await votar('a', '50000000-0000-0000-0000-000000000007', 'b');
ok('Partido de hace seis días: sigue abierta hasta esta noche (0034)', x.mvp.abierta && !x.mvp.cerrada && !r.error, r.error);
x = await charla('a', P.viejo);
r = await votar('c', P.viejo, 'a');
ok('Partido de hace una semana: ya cerró', !x.mvp.abierta && x.mvp.cerrada && /ya cerró/.test(r.error ?? ''), r.error);
ok('…y muestra al MVP con sus votos', x.mvp.ganadores.length === 1 && x.mvp.ganadores[0].persona_id === PER.b && x.mvp.ganadores[0].votos === 2);
x = await charla('d', P.otro);
ok('Si empatan, son MVP los empatados', x.mvp.ganadores.length === 2);
x = (await como('d', 'select mvp_conteo(null, null) as c')).rows[0].c;
ok('Conteo de MVP del club (para las estadísticas)', x[PER.b] === 2 && x[PER.a] === 1 && !x[PER.c], JSON.stringify(x));
x = (await como('d', `select mvp_conteo(null, array['${OTRO}']::uuid[]) as c`)).rows[0].c;
ok('…filtrado por plantel', x[PER.b] === 1 && x[PER.a] === 1, JSON.stringify(x));

console.log('\nCuerpo técnico (0033)');
const OTRO_HOY = '50000000-0000-0000-0000-000000000006';
await db.exec(`update personas set cuerpo_tecnico = true where id = '${PER.d}';
  insert into partidos (id, club_id, equipo_id, rival, fecha, goles_favor, goles_contra)
    values ('${OTRO_HOY}', '${CLUB}', '${OTRO}', 'Rival Inventado', hoy(), 1, 0);
  insert into partido_jugadores (partido_id, persona_id) values ('${OTRO_HOY}', '${PER.a}');`);
x = await charla('d', P.hoy);
ok('El cuerpo técnico de su plantel puede votar sin haber jugado', x.mvp.puedo_votar && !x.mvp.jugue);
r = await votar('d', P.hoy, 'b');
x = await charla('d', P.hoy);
ok('…y la base le acepta el voto', !r.error && x.mvp.mi_voto === PER.b, r.error);
ok('…pero no pasa a ser candidato', !x.mvp.candidatos.some((c) => c.persona_id === PER.d));
r = await votar('a', P.hoy, 'd');
ok('…ni se puede votar por él', /alguien que jugó/.test(r.error ?? ''), r.error);
x = await charla('d', OTRO_HOY);
r = await votar('d', OTRO_HOY, 'a');
ok('En un plantel que no es el suyo no vota', !x.mvp.puedo_votar && /Votan solo/.test(r.error ?? ''), r.error);
x = await charla('enc', P.hoy);
r = await votar('enc', P.hoy, 'b');
ok('Sin el permiso, quien no jugó sigue sin votar', !x.mvp.puedo_votar && /Votan solo/.test(r.error ?? ''), r.error);
r = await como('d', `update personas set cuerpo_tecnico = true where id = '${PER.c}'`);
ok('El permiso no se da desde el navegador', !!r.error || r.rows.length === 0, r.error);

r = await como('a', 'select * from partido_votos');
ok('Los votos no se leen desde el navegador', !!r.error);

console.log('\nComentarios');
r = await como('d', `select comentario_agregar($1, '  ¡Gran partido muchachos!  ') as id`, [P.hoy]);
const c1 = r.rows[0]?.id;
ok('Cualquiera del club comenta', !r.error && c1, r.error);
r = await como('a', `select comentario_agregar($1, 'Gracias!', $2) as id`, [P.hoy, c1]);
const c2 = r.rows[0]?.id;
r = await como('b', `select comentario_agregar($1, 'Respuesta a la respuesta', $2) as id`, [P.hoy, c2]);
const c3 = r.rows[0]?.id;
x = await charla('c', P.hoy);
const porId = Object.fromEntries(x.comentarios.map((c) => [c.id, c]));
ok('Las respuestas quedan en la cadena del primero', porId[c2]?.padre_id === c1 && porId[c3]?.padre_id === c1);
ok('El texto se guarda sin espacios sobrantes', porId[c1]?.texto === '¡Gran partido muchachos!');
r = await como('a', `select comentario_agregar($1, '   ')`, [P.hoy]);
ok('No se manda un comentario vacío', /Escribe algo/.test(r.error ?? ''), r.error);
r = await como('a', `select comentario_agregar($1, $2)`, [P.hoy, 'x'.repeat(501)]);
ok('Máximo 500 letras', /hasta 500/.test(r.error ?? ''), r.error);
r = await como('a', `select comentario_agregar($1, 'hola', $2)`, [P.viejo, c1]);
ok('No se responde un comentario de otro partido', /no existe/.test(r.error ?? ''), r.error);
ok('Cada uno puede borrar lo suyo y no lo ajeno', porId[c3].puedo_borrar === false && (await charla('b', P.hoy)).comentarios.find((c) => c.id === c3).puedo_borrar);
r = await como('c', 'select comentario_borrar($1)', [c1]);
ok('Un jugador no borra comentarios ajenos', /Solo puedes borrar tus/.test(r.error ?? ''), r.error);
r = await como('prueba', 'select comentario_borrar($1)', [c1]);
ok('Una cuenta de prueba de Comunicaciones tampoco', /Solo puedes borrar tus/.test(r.error ?? ''), r.error);
r = await como('b', 'select comentario_borrar($1)', [c3]);
ok('El autor borra el suyo', !r.error, r.error);
r = await como('enc', 'select comentario_borrar($1)', [c2]);
ok('El encargado del plantel (capitán o DT) borra cualquiera', !r.error, r.error);
r = await como('comu', 'select comentario_borrar($1)', [c1]);
ok('Comunicaciones borra cualquiera', !r.error, r.error);
r = await como('d', `select comentario_agregar($1, 'otro') as id`, [P.otro]);
const c4 = r.rows[0]?.id;
r = await como('enc', 'select comentario_borrar($1)', [c4]);
ok('El encargado no modera partidos de otro plantel', /Solo puedes borrar tus/.test(r.error ?? ''), r.error);
r = await como('admin', 'select comentario_borrar($1)', [c4]);
ok('Un administrador modera todo', !r.error, r.error);
x = await charla('c', P.hoy);
ok('Un borrado deja su lugar sin texto, para no romper la cadena', x.comentarios.length === 3 && x.comentarios.every((c) => c.borrado && c.texto === null && !c.puedo_borrar));
r = await como('a', 'select * from partido_comentarios');
ok('Los comentarios no se leen desde el navegador', !!r.error);

console.log('\nReacciones');
r = await como('a', `select reaccionar_partido($1, '🔥')`, [P.hoy]);
await como('b', `select reaccionar_partido($1, '🔥')`, [P.hoy]);
await como('b', `select reaccionar_partido($1, '👏')`, [P.hoy]);
x = await charla('a', P.hoy);
ok('Reacciones al partido: conteo y la mía', !r.error && x.reacciones[0].emoji === '🔥' && x.reacciones[0].n === 2 && x.reacciones[0].mia
   && x.reacciones.find((e) => e.emoji === '👏').mia === false, JSON.stringify(x.reacciones));
await como('a', `select reaccionar_partido($1, '🔥')`, [P.hoy]);
x = await charla('a', P.hoy);
ok('Tocar de nuevo la quita', x.reacciones.find((e) => e.emoji === '🔥').n === 1 && !x.reacciones.find((e) => e.emoji === '🔥').mia);
r = await como('a', `select reaccionar_partido($1, '💩')`, [P.hoy]);
ok('Solo emojis de la lista', /no está disponible/.test(r.error ?? ''), r.error);
r = await como('d', `select comentario_agregar($1, 'Vamos!') as id`, [P.hoy]);
const c5 = r.rows[0].id;
r = await como('a', `select reaccionar_comentario($1, '😂')`, [c5]);
x = await charla('d', P.hoy);
ok('Reacciones a un comentario', !r.error && x.comentarios.find((c) => c.id === c5).reacciones[0].n === 1, r.error);
r = await como('a', `select reaccionar_comentario($1, '😂')`, [c1]);
ok('No se reacciona a un comentario borrado', /fue borrado/.test(r.error ?? ''), r.error);
r = await como('a', 'select * from partido_reacciones');
ok('Las reacciones no se leen desde el navegador', !!r.error);

console.log(`\n${pass} pruebas pasaron, ${fail} fallaron.`);
process.exit(fail ? 1 : 0);
