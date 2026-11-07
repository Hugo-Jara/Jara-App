// Prueba las fechas de la liga (0038) en un Postgres en memoria (PGlite),
// con todas las migraciones en orden.
//   npm run test:liga (también corre con npm run test:db)
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
// La extensión http de Supabase, de mentira: responde según la dirección
// (tabla extensions.paginas) y anota cada pedido.
await db.exec(`
  create schema extensions;
  create table extensions.paginas (patron text, status int, content text);
  create table extensions.pedidas (uri text);
  create type extensions.http_response as (status int, content_type varchar, content varchar);
  create function extensions.http_set_curlopt(curlopt varchar, value varchar) returns boolean language sql as $$ select true $$;
  create function extensions.http_get(uri varchar) returns extensions.http_response language plpgsql as $$
  declare r extensions.http_response;
  begin
    insert into extensions.pedidas values (uri);
    select status, 'text/html', content into r from extensions.paginas where uri like patron limit 1;
    if r.status is null then r.status := 404; end if;
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
            jugador: '00000000-0000-0000-0000-0000000000e3' };
const PER = { admin: '20000000-0000-0000-0000-0000000000e1', encargado: '20000000-0000-0000-0000-0000000000e2',
              jugador: '20000000-0000-0000-0000-0000000000e3' };
const JUNIOR = '40000000-0000-0000-0000-0000000000e1';
const SENIOR = '40000000-0000-0000-0000-0000000000e2';
await db.exec(`
  insert into auth.users (id, email) values ${Object.entries(U).map(([k, id]) => `('${id}', '${k}@correo.cl')`).join(', ')};
  insert into equipos (id, club_id, nombre, orden) values ('${JUNIOR}', '${CLUB}', 'Junior Inventado', 1), ('${SENIOR}', '${CLUB}', 'Senior Inventado', 2);
  insert into personas (id, club_id, nombre, user_id, es_admin) values
    ('${PER.admin}', '${CLUB}', 'Admin Inventado', '${U.admin}', true),
    ('${PER.encargado}', '${CLUB}', 'Encargado Inventado', '${U.encargado}', false),
    ('${PER.jugador}', '${CLUB}', 'Jugador Inventado', '${U.jugador}', false);
  insert into persona_equipos (persona_id, equipo_id, rol) values
    ('${PER.encargado}', '${SENIOR}', 'encargado'), ('${PER.jugador}', '${SENIOR}', 'jugador');
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

// La página real de una fecha jugada (Fecha 6 del Senior, 31 oct 2026).
const JUGADA = readFileSync(join(here, 'fixtures', 'deporstar-fecha-jugada.html'), 'utf8');
// Una fecha por jugar, armada igual que las de Deporstar, a 5 y 12 días.
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const enDias = (n) => { const d = new Date(Date.now() + n * 864e5); return d; };
const iso = (d) => d.toISOString().slice(0, 10);
const linea = (d, hora, division) => `sáb ${String(d.getUTCDate()).padStart(2, '0')} ${MESES[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)} - ${hora}H (${division})`;
const tarjeta = (id, d, hora, division, local, visita, cancha) => `<div class="py-2 px-4 rounded-lg bg-colorW mb-3 shadow-lg relative"><div class="flex justify-center items-center font-ffBarlow mb-4"><p class="text-[11px] font-bold text-center md:text-[13px] lg:text-[14px] capitalize">${linea(d, hora, division)}</p></div><div class="flex justify-center items-center "><div class="flex flex-col justify-center items-center w-[36%]"><img src="/udefault.png" alt="logo${local}" class="w-14 h-14 mb-2"/><a href="/equipo/aaa111/" class="text-sm font-ffBarlow capitalize max-w-[140px] truncate hover:cursor-pointer">${local}</a></div><div class="flex flex-col items-center justify-center font-ffGeo font-bold w-[28%]"><span class="text-colorW rounded-md min-w-[60px] text-center px-1 bg-colorText">${hora} Hrs</span></div><div class="flex flex-col justify-center items-center w-[36%]"><img src="/udefault.png" alt="logo${visita}" class="w-14 h-14 mb-2"/><a href="/equipo/bbb222/" class="text-sm font-ffBarlow capitalize max-w-[140px] truncate hover:cursor-pointer">${visita}</a></div></div><div class="flex justify-between items-center border-t border-colorBorder py-2 mt-2"><div class=""> <p class="text-sm max-w-[150px] capitalize truncate font-ffBarlow">${cancha}</p> </div><a href="/torneo/20738/${id}/partido" class="bg-colorMain p-1">Ver más</a></div></div>`;
const D7 = enDias(5), D8 = enDias(12);
const fecha7 = (hora) => '<h4> Fecha 7 </h4>'
  + tarjeta(900001, D7, hora, '2DA División Clausura', 'Cabaret FC', 'Hugo Jara Sr', 'Cancha 5')
  + tarjeta(900002, D7, '08:45', '1ERA División Clausura', 'Rukán FC', 'Provito', 'Cancha 1');
const fecha8 = tarjeta(900003, D8, '12:15', '2DA División Clausura', 'Hugo Jara Sr', 'Mantis', 'Cancha 2');
const LISTA = JSON.stringify([{ id: 1, tag: 'Amistoso 1' }, { id: 10, tag: 'Fecha 6' }, { id: 11, tag: 'Fecha 7' },
                              { id: 12, tag: 'Fecha 8' }, { id: 13, tag: 'Fecha 9' }]);
const pagina = (patron, content, status = 200) =>
  db.query('insert into extensions.paginas values ($1, $2, $3)', [patron, status, content]);
await pagina('%simple-list-jornadas/torneo/20738/', LISTA);
await pagina('%jornada=10', `<html>${JUGADA}</html>`);
await pagina('%jornada=11', `<html>${fecha7('10:30')}</html>`);
await pagina('%jornada=12', `<html>${fecha8}</html>`);
await pagina('%jornada=13', '<html><h4> Fecha 9 </h4></html>');
const pedidas = async () => Number((await db.query('select count(*) as n from extensions.pedidas')).rows[0].n);
const fechas = async (quien) => (await como(quien, 'select liga_fechas() as f')).rows[0]?.f;
const refrescar = (quien, forzar = false) => como(quien, 'select liga_refrescar($1, $2) as n', [SENIOR, forzar]);
const partidosSenior = async () => (await db.query(
  `select rival, torneo, fecha::text, to_char(hora_inicio, 'HH24:MI') as hora, cancha, liga_partido from partidos where equipo_id = $1 order by fecha`, [SENIOR])).rows;
let r, x;

console.log('\nLeer la página de una fecha');
x = (await db.query('select liga_desde_deporstar($1) as p', [JUGADA])).rows[0].p;
ok('Lee los 12 partidos de la Fecha 6', x.length === 12, x.length);
ok('El primero, con día, hora, división y resultado', x[0].local === 'AS Palma' && x[0].visita === 'Capitán Memo Senior'
   && x[0].goles_local === 1 && x[0].goles_visita === 2 && x[0].dia === '2026-10-31' && x[0].hora === '08:45'
   && x[0].division === '1ERA División Clausura' && x[0].id === 1654457 && x[0].cancha === null, JSON.stringify(x[0]));
ok('Los nombres con apóstrofo quedan bien', x.some((p) => p.visita === "Jacot's Sr"), x.map((p) => p.visita).join());
ok('El partido del Jara', x.some((p) => p.local === 'Henry FC' && p.visita === 'Hugo Jara Sr' && p.goles_local === 1 && p.goles_visita === 2 && p.division === '2DA División Clausura'));
x = (await db.query('select liga_desde_deporstar($1) as p', [fecha7('10:30')])).rows[0].p;
ok('Una fecha por jugar: sin resultado, con cancha', x.length === 2 && x[0].goles_local === null && x[0].cancha === 'Cancha 5' && x[0].hora === '10:30' && x[0].dia === iso(D7), JSON.stringify(x[0]));
x = (await db.query(`select liga_desde_deporstar('<html>no es una fecha</html>') as p`)).rows[0].p;
ok('Una página rara no rompe nada', Array.isArray(x) && x.length === 0);

console.log('\nTraer las fechas');
r = await refrescar('jugador');
ok('Sin conectar, avisa', /no está conectado/.test(r.error ?? ''), r.error);
x = await fechas('jugador');
ok('Sin conectar, la app no ve nada', x.conectados.length === 0 && x.partidos.length === 0, JSON.stringify(x));

await db.query('insert into partidos (club_id, equipo_id, rival, fecha) values ($1, $2, $3, $4)', [CLUB, SENIOR, 'Por confirmar', iso(D8)]);
await db.query(`insert into liga_torneos (equipo_id, club_id, deporstar_torneo, desde_jornada) values ($1, $2, 20738, 10)`, [SENIOR, CLUB]);
r = await refrescar('jugador');
ok('Cualquiera del club la trae; quedan fechas por leer', !r.error && r.rows[0].n === 1, r.error ?? r.rows[0].n);
ok('No pide los amistosos', !(await db.query(`select 1 from extensions.pedidas where uri like '%jornada=1'`)).rows.length);
r = await refrescar('jugador');
ok('La segunda vez lee la que faltaba', !r.error && r.rows[0].n === 0, r.error ?? r.rows[0].n);
let antes = await pedidas();
r = await refrescar('jugador');
ok('Después espera 3 horas sin salir a la liga', !r.error && (await pedidas()) === antes, r.error);

x = await fechas('jugador');
ok('El plantel aparece conectado', x.conectados.length === 1 && x.conectados[0].equipo === 'Senior Inventado', JSON.stringify(x.conectados));
ok('Solo la división del Jara (6 jugados + 2 por jugar)', x.partidos.length === 8 && x.partidos.every((p) => p.local !== 'AS Palma' && p.local !== 'Rukán FC'), x.partidos.map((p) => p.local).join());
ok('Cada partido trae su fecha de la liga', x.partidos.find((p) => p.local === 'Cabaret FC' && p.goles_local === null).fecha === 'Fecha 7');
ok('El Jara viene marcado', x.partidos.filter((p) => p.es_jara).length === 3);

x = await partidosSenior();
ok('Los partidos del Jara que vienen quedan creados en la app', x.length === 2 && x[0].rival === 'Cabaret FC' && x[0].hora === '10:30'
   && x[0].cancha === 'Cancha 5' && x[0].torneo === 'Fecha 7' && x[0].fecha === iso(D7), JSON.stringify(x));
ok('Si ya había un partido ese día, se usa ese y se completa con lo de la liga', x[1].rival === 'Mantis' && x[1].hora === '12:15' && x[1].cancha === 'Cancha 2' && Number(x[1].liga_partido) === 900003, JSON.stringify(x[1]));
ok('El partido jugado no se crea', !x.some((p) => p.rival === 'Henry FC'));

antes = await pedidas();
r = await refrescar('jugador', true);
ok('Un jugador aprieta el botón recién actualizado: no sale a la liga', !r.error && r.rows[0].n === 0 && (await pedidas()) === antes, r.error);
await db.query(`update liga_torneos set revisada_en = now() - interval '10 minutes' where equipo_id = $1`, [SENIOR]);
r = await refrescar('jugador', true);
ok('Pasados 5 minutos, un jugador sí la actualiza', !r.error && (await pedidas()) > antes, r.error);
x = await fechas('jugador');
ok('Todos ven el botón', x.conectados.every((c) => c.puedo_actualizar), JSON.stringify(x.conectados));
await db.query(`update extensions.paginas set content = $1 where patron = '%jornada=11'`, [`<html>${fecha7('12:15')}</html>`]);
r = await refrescar('encargado', true);
ok('El encargado la actualiza en el acto', !r.error, r.error);
x = await partidosSenior();
ok('Si la liga cambia la hora, el partido se actualiza sin duplicarse', x.length === 2 && x[0].hora === '12:15', JSON.stringify(x));

await db.query(`update extensions.paginas set content = '' where patron = '%jornada=11'`);
r = await refrescar('encargado', true);
x = await fechas('jugador');
ok('Una página vacía no borra lo que ya había', !r.error && x.partidos.some((p) => p.local === 'Cabaret FC'), r.error);

await db.query(`update extensions.paginas set status = 500 where patron like '%simple-list%'`);
r = await refrescar('encargado', true);
ok('Si la liga no responde, se avisa', /no respondió/.test(r.error ?? ''), r.error);

r = await como('jugador', 'select * from liga_partidos');
ok('Las tablas no se leen directo', !!r.error, r.error);
r = await anon('select liga_fechas()');
ok('Sin cuenta no se ve nada', !!r.error, r.error);

console.log('\nEl jueves, desde copafacil');
const CF = JSON.parse(readFileSync(join(here, 'fixtures', 'copafacil-jueves.json'), 'utf8'));
const JUEVES = '40000000-0000-0000-0000-0000000000e3';
const idJara = Object.entries(CF.teams).find(([, t]) => /jara/i.test(t.name))[0];
const idRival = Object.entries(CF.teams).find(([, t]) => t.name === 'Monarcas')[0];
const ultimaFecha = Object.keys(CF.m_set).sort().at(-1);
const futuro = Date.UTC(...(() => { const d = enDias(6); return [d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 0]; })());
const matchs = { ...CF.matchs, 1799999999001: { d_i: futuro, evt: '-68fm5@riynh', l: '3830477', m_set: ultimaFecha, st: 0, team1: idRival, team2: idJara },
                 1799999999002: { d_i: futuro, evt: '-68fm5@otro', m_set: ultimaFecha, team1: idRival, team2: idJara } };
await db.exec(`insert into equipos (id, club_id, nombre, orden) values ('${JUEVES}', '${CLUB}', 'Jueves Inventado', 3)`);
await db.query('insert into tablas_posiciones (equipo_id, club_id, grupo, filas) values ($1, $2, $3, $4)',
               [JUEVES, CLUB, 'Grupo A', JSON.stringify([{ equipo: 'Del pantallazo', pts: 1 }])]);
await pagina('%copafacil-web.firebaseio.com/events/-68fm5/matchs.json', JSON.stringify(matchs));
await pagina('%copafacil-web.firebaseio.com/events/-68fm5@riynh/teams.json', JSON.stringify(CF.teams));
await pagina('%copafacil-web.firebaseio.com/events/-68fm5@riynh/m_set.json', JSON.stringify(CF.m_set));
await pagina('%copafacil-web.firebaseio.com/events/-68fm5/places.json', JSON.stringify(CF.places));

x = (await db.query('select liga_desde_copafacil($1, $2, $3, $4) as p', [JSON.stringify(CF.matchs), JSON.stringify(CF.teams), JSON.stringify(CF.places), '-68fm5@riynh'])).rows[0].p;
ok('Lee los partidos del torneo, sin los de Cupo Libre', x.length === 49 && !x.some((p) => /cupo libre/i.test(p.local + p.visita)), x.length);
const mj = x.find((p) => p.local === 'Monarcas' && /jara/i.test(p.visita) && p.jornada === Number(ultimaFecha) - 0);
ok('Monarcas 1 - 1 Hugo Jara, con hora de Santiago y cancha', mj && mj.goles_local === 1 && mj.goles_visita === 1 && /^\d\d:\d\d$/.test(mj.hora) && /^Cancha \d$/.test(mj.cancha ?? ''), JSON.stringify(mj));
ok('Los goles en cero cuentan (copafacil no los manda)', x.some((p) => p.local === 'Hugo Jara' && p.visita === 'Sagrados' && p.goles_local === 2 && p.goles_visita === 0)
   && x.some((p) => p.local === 'Hugo Jara' && p.visita === 'Peselaco' && p.goles_local === 0 && p.goles_visita === 2));
ok('Jueves en la noche, en hora de Chile', x.some((p) => p.visita === 'Sagrados' && p.dia === '2026-08-27' && p.hora === '21:30'));
ok('El nombre del Jara viene sin espacios de más', x.some((p) => p.visita === 'Hugo Jara' || p.local === 'Hugo Jara'));
x = (await db.query('select tabla_desde_copafacil($1) as t', [JSON.stringify(CF.teams)])).rows[0].t;
const mota = x.general.find((f) => f.equipo === 'Mota Classic');
ok('La tabla trae la línea de cada equipo', mota && mota.pts === 11 && mota.pj === 7 && mota.pg === 3 && mota.pe === 2 && mota.pp === 2 && mota.gf === 9 && mota.gc === 11, JSON.stringify(mota));
ok('General con los 15 equipos (sin Cupo Libre) y el grupo del Jara', x.general.length === 15 && !x.general.some((f) => /cupo/i.test(f.equipo)) && x.grupo === 'A' && x.grupos.A.length >= 2 && x.grupos.A.some((f) => f.es_jara), JSON.stringify(Object.keys(x.grupos)));
ok('Ordenada por puesto', x.grupos.A.every((f, i, a) => i === 0 || a[i - 1].pts >= f.pts), x.grupos.A.map((f) => f.pts).join());

await db.query(`insert into liga_torneos (equipo_id, club_id, fuente, copafacil_torneo) values ($1, $2, 'copafacil', '-68fm5@riynh')`, [JUEVES, CLUB]);
r = await db.query(`insert into liga_torneos (equipo_id, club_id, fuente) values ($1, $2, 'copafacil')`, [JUNIOR, CLUB]).catch((e) => ({ error: e.message }));
ok('copafacil sin torneo no se acepta', !!r.error, JSON.stringify(r));
antes = await pedidas();
r = await como('jugador', 'select liga_refrescar($1) as n', [JUEVES]);
ok('Se trae de una vez (4 archivos)', !r.error && r.rows[0].n === 0 && (await pedidas()) - antes === 4, r.error ?? (await pedidas()) - antes);
x = await fechas('jugador');
const jue = x.partidos.filter((p) => p.equipo_id === JUEVES);
ok('El jueves aparece conectado con sus partidos', x.conectados.some((c) => c.equipo_id === JUEVES) && jue.length === 50, jue.length);
ok('Cada partido con su fecha de la liga', jue.every((p) => /Fecha/.test(p.fecha)), [...new Set(jue.map((p) => p.fecha))].join());
x = (await db.query(`select rival, torneo, fecha::text, to_char(hora_inicio, 'HH24:MI') as hora, cancha from partidos where equipo_id = $1`, [JUEVES])).rows;
ok('El partido del Jara que viene queda creado', x.length === 1 && x[0].rival === 'Monarcas' && x[0].cancha === 'Cancha 1' && /Fecha/.test(x[0].torneo), JSON.stringify(x));
x = (await como('jugador', 'select tablas_posiciones() as t')).rows[0].t.filter((t) => t.equipo_id === JUEVES);
ok('Quedan las dos tablas (Grupo A y General), conectadas', x.length === 2 && x.map((t) => t.grupo).sort().join() === 'General,Grupo A' && x.every((t) => t.conectada && t.filas.length > 1), JSON.stringify(x.map((t) => [t.grupo, t.conectada, t.filas.length])));
ok('La del pantallazo se reemplaza por la de la liga', !x.find((t) => t.grupo === 'Grupo A').filas.some((f) => f.equipo === 'Del pantallazo'));
antes = await pedidas();
r = await como('jugador', 'select liga_refrescar($1) as n', [JUEVES]);
ok('Después espera 3 horas', !r.error && (await pedidas()) === antes, r.error);
await db.query(`update extensions.paginas set status = 500 where patron like '%-68fm5/matchs.json'`);
r = await como('admin', 'select liga_refrescar($1, true) as n', [JUEVES]);
ok('Si copafacil no responde, se avisa', /no respondió/.test(r.error ?? ''), r.error);

console.log(`\n${pass} pruebas pasaron, ${fail} fallaron.`);
process.exit(fail ? 1 : 0);
