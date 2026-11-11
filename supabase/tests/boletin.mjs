// Prueba El Jara Informa publicado (0050) en un Postgres en memoria (PGlite):
// permisos, publicar sin quedar a medias, retirar, republicar y eliminar.
//   npm run test:boletin-db (también corre con npm run test:db)
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
  create function extensions.urlencode(s varchar) returns varchar language sql as $$ select s $$;
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
await db.exec(`grant update, delete on storage.objects to authenticated`);

const OTRO_CLUB = '10000000-0000-0000-0000-000000000002';
const U = { com: '00000000-0000-0000-0000-0000000000b1', socio: '00000000-0000-0000-0000-0000000000b2',
            admin: '00000000-0000-0000-0000-0000000000b3', ajeno: '00000000-0000-0000-0000-0000000000b4',
            inactivo: '00000000-0000-0000-0000-0000000000b5' };
await db.exec(`
  insert into clubes (id, nombre, slug) values ('${OTRO_CLUB}', 'Otro Club', 'otro-club');
  insert into auth.users (id, email) values ${Object.entries(U).map(([k, id]) => `('${id}', '${k}@correo.cl')`).join(', ')};
  insert into personas (club_id, nombre, user_id, es_admin, edita_comunicaciones, estado) values
    ('${CLUB}', 'Comunicaciones Inventada', '${U.com}', false, true, 'activo'),
    ('${CLUB}', 'Socio Inventado', '${U.socio}', false, false, 'activo'),
    ('${CLUB}', 'Admin Inventado', '${U.admin}', true, false, 'activo'),
    ('${OTRO_CLUB}', 'Comunicaciones de Otro Club', '${U.ajeno}', false, true, 'activo'),
    ('${CLUB}', 'Comunicaciones Inactiva', '${U.inactivo}', false, true, 'inactivo');
`);

async function como(quien, sql, params = []) {
  await db.exec('set role authenticated');
  await db.query(`select set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claims', $2, false)`,
                 [U[quien], JSON.stringify({ email: `${quien}@correo.cl` })]);
  try { const r = await db.query(sql, params); return { rows: r.rows, error: null }; }
  catch (e) { return { rows: [], error: e.message }; }
  finally { await db.exec('reset role'); }
}
const uno = async (quien, sql, params) => { const r = await como(quien, sql, params); return { v: r.rows[0] && Object.values(r.rows[0])[0], error: r.error }; };
const subir = (quien, nombre) => como(quien, `insert into storage.objects (bucket_id, name) values ('boletin', $1)`, [nombre]);
const ve = async (quien, nombre) => (await como(quien, `select 1 from storage.objects where bucket_id = 'boletin' and name = $1`, [nombre])).rows.length === 1;
const catalogo = async (quien) => (await uno(quien, 'select boletin_catalogo()')).v ?? [];
const pag = (id, v, n) => `${id}/v${v}/pagina-${String(n).padStart(2, '0')}.png`;
const guardar = (quien, id, numero, contenido = { bloques: [] }) =>
  uno(quien, 'select boletin_guardar($1, $2, $3, $4, $5, $6)', [id, numero, `Edición ${numero}`, 'Resumen', 'Noviembre 2026', contenido]);

const E4 = 'e0000000-0000-0000-0000-000000000004', E5 = 'e0000000-0000-0000-0000-000000000005';
const H1 = 'e0000000-0000-0000-0000-000000000001';
let r, x;

// --- Quién gestiona -------------------------------------------------------------
r = await guardar('socio', E4, 4);
ok('Un socio no puede crear ediciones', /Solo Comunicaciones/.test(r.error ?? ''), r.error);
r = await guardar('inactivo', E4, 4);
ok('Comunicaciones inactiva no puede crear ediciones', /Solo Comunicaciones/.test(r.error ?? ''), r.error);
r = await guardar('com', E4, 4, { bloques: [{ id: 'b1', texto: 'versión uno' }], fotos: [`${E4}/fotos/a.jpg`] });
ok('Comunicaciones crea un borrador', r.v?.estado === 'borrador' && r.v?.numero === 4, r.error);
r = await guardar('admin', E5, 4);
ok('No se repite el número de edición', /Ya existe El Jara Informa N°4/.test(r.error ?? ''), r.error);
r = await como('socio', 'select * from boletin_ediciones');
ok('La tabla no se lee directo desde la app', /permission denied/.test(r.error ?? ''), r.error);
r = await como('com', 'select boletin_exigir($1)', [E4]);
ok('Las funciones internas no se llaman desde la app', /permission denied/.test(r.error ?? ''), r.error);

// --- Archivos del borrador ---------------------------------------------------------
ok('Comunicaciones sube fotos del borrador', !(await subir('com', `${E4}/fotos/a.jpg`)).error);
ok('Un socio no sube archivos', !!(await subir('socio', `${E4}/fotos/b.jpg`)).error);
ok('Comunicaciones de otro club no sube a esta edición', !!(await subir('ajeno', `${E4}/fotos/c.jpg`)).error);
ok('No se sube a una carpeta inventada', !!(await subir('com', `${E4}/otra/c.jpg`)).error && !!(await subir('com', `${E5}/fotos/c.jpg`)).error);
ok('Un socio no ve un borrador en el catálogo', (await catalogo('socio')).length === 0);
ok('Un socio no ve las fotos de un borrador', !(await ve('socio', `${E4}/fotos/a.jpg`)));
r = await uno('socio', 'select boletin_edicion($1)', [E4]);
ok('Un socio no abre un borrador', /no está disponible/.test(r.error ?? ''), r.error);
ok('Comunicaciones ve su borrador en el catálogo', (await catalogo('com')).some((e) => e.id === E4));
ok('Comunicaciones de otro club no lo ve', (await catalogo('ajeno')).length === 0);

// --- Publicar sin quedar a medias ---------------------------------------------------
await subir('com', pag(E4, 1, 1)); await subir('com', pag(E4, 1, 2));
r = await uno('com', 'select boletin_publicar($1, 1, 3)', [E4]);
ok('Con una página faltante no se publica', /Faltan 1 de 3 páginas/.test(r.error ?? ''), r.error);
ok('… y la edición sigue en borrador', (await catalogo('socio')).length === 0);
r = await uno('socio', 'select boletin_publicar($1, 1, 2)', [E4]);
ok('Un socio no publica', /Solo Comunicaciones/.test(r.error ?? ''), r.error);
r = await uno('ajeno', 'select boletin_publicar($1, 1, 2)', [E4]);
ok('Comunicaciones de otro club no publica', /No encontramos/.test(r.error ?? ''), r.error);
r = await uno('com', 'select boletin_publicar($1, 1, 2)', [E4]);
ok('Con todas las páginas se publica', r.v?.estado === 'publicada' && r.v?.paginas === 2 && r.v?.carpeta === `${E4}/v1`, r.error);
x = await catalogo('socio');
ok('El socio ve la edición publicada', x.length === 1 && x[0].numero === 4);
ok('El socio ve sus páginas y fotos', (await ve('socio', pag(E4, 1, 1))) && (await ve('socio', `${E4}/fotos/a.jpg`)));
x = (await uno('socio', 'select boletin_edicion($1)', [E4])).v;
ok('El socio recibe la copia publicada y no el borrador', x?.contenido_publicado?.bloques?.[0]?.texto === 'versión uno' && !('contenido' in x));
ok('Inicio muestra la última edición', (await uno('socio', 'select boletin_ultima()')).v?.numero === 4);
ok('No se pisan las páginas a la vista', !!(await subir('com', pag(E4, 1, 3))).error
   && (await como('com', `update storage.objects set metadata = '{}' where name = $1 returning 1`, [pag(E4, 1, 1)])).rows.length === 0);

// --- Corregir sin que el socio vea el borrador y republicar -----------------------------
await guardar('com', E4, 4, { bloques: [{ id: 'b1', texto: 'versión dos' }] });
x = (await uno('socio', 'select boletin_edicion($1)', [E4])).v;
ok('Guardar el borrador no cambia lo que ve el socio', x?.contenido_publicado?.bloques?.[0]?.texto === 'versión uno');
r = await uno('com', 'select boletin_publicar($1, 1, 2)', [E4]);
ok('No se republica con la misma versión', /mayor que la publicada/.test(r.error ?? ''), r.error);
await subir('com', pag(E4, 2, 1));
r = await uno('com', 'select boletin_publicar($1, 2, 1)', [E4]);
ok('Se republica con una versión nueva', r.v?.version === 2 && r.v?.version_anterior === 1, r.error);
ok('El socio deja de ver la versión vieja y ve la nueva', !(await ve('socio', pag(E4, 1, 1))) && (await ve('socio', pag(E4, 2, 1))));
x = (await uno('socio', 'select boletin_edicion($1)', [E4])).v;
ok('… con el contenido corregido', x?.contenido_publicado?.bloques?.[0]?.texto === 'versión dos');
r = await como('com', `delete from storage.objects where name like $1 returning 1`, [`${E4}/v1/%`]);
ok('Comunicaciones borra la carpeta vieja', r.rows.length === 2, r.error);

// --- Retirar y eliminar ---------------------------------------------------------------
r = await uno('com', 'select boletin_eliminar($1, 4)', [E4]);
ok('Una edición publicada no se elimina', /Primero retira/.test(r.error ?? ''), r.error);
r = await uno('socio', 'select boletin_retirar($1)', [E4]);
ok('Un socio no retira', /Solo Comunicaciones/.test(r.error ?? ''), r.error);
r = await uno('com', 'select boletin_retirar($1)', [E4]);
ok('Comunicaciones retira la edición', r.v?.estado === 'retirada', r.error);
ok('El socio ya no la ve, ni sus páginas', (await catalogo('socio')).length === 0 && !(await ve('socio', pag(E4, 2, 1))));
ok('Retirada sigue editable', !(await guardar('com', E4, 4, { bloques: [] })).error);
r = await uno('com', 'select boletin_eliminar($1, 5)', [E4]);
ok('Con el número equivocado no se elimina', /escribe el número de la edición \(4\)/.test(r.error ?? ''), r.error);
r = await uno('admin', 'select boletin_eliminar($1, 4)', [E4]);
ok('Con el número correcto se elimina', !r.error, r.error);
ok('… y desaparece del catálogo', (await catalogo('com')).length === 0);

// --- Edición anterior en PNG -----------------------------------------------------------
r = await uno('com', 'select boletin_crear_historica($1, 1, $2, $3, $4)', [H1, 'El Jara Informa N°1', '', 'Marzo 2026']);
ok('Se registra una edición anterior', r.v?.origen === 'historica' && r.v?.estado === 'borrador', r.error);
ok('Una edición anterior no lleva fotos sueltas', !!(await subir('com', `${H1}/fotos/a.jpg`)).error);
for (const n of [1, 2, 3]) await subir('com', pag(H1, 1, n));
r = await uno('com', 'select boletin_publicar($1, 1, 3)', [H1]);
ok('Se publica con sus páginas en orden', r.v?.estado === 'publicada' && r.v?.paginas === 3, r.error);
ok('Queda en el historial del socio', (await catalogo('socio')).some((e) => e.numero === 1 && e.origen === 'historica'));
r = await guardar('com', H1, 1);
ok('Una edición anterior no se edita como borrador', /no se edita/.test(r.error ?? ''), r.error);

console.log(`\n${pass} pruebas pasaron, ${fail} fallaron.`);
process.exit(fail ? 1 : 0);
