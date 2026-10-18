// Prueba el ingreso por nombre, los partidos y los entrenamientos en un
// Postgres en memoria (PGlite), simulando las cuentas de Supabase.
//   npm run test:club
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
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create function auth.jwt() returns jsonb language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
  grant usage on schema auth, public to anon, authenticated;
`);
for (const f of ['0001_base.sql', '0002_cotizaciones.sql', '0004_funciones_de_trigger_privadas.sql',
                 '0009_ingreso_por_nombre.sql', '0010_partidos.sql', '0011_entrenamientos.sql', '0012_resultado_y_estadisticas.sql',
                 '0013_administra_entrenamientos.sql', '0014_hora_de_inicio.sql']) {
  await db.exec(mig(f));
}

const CLUB = '10000000-0000-0000-0000-000000000001';
const EQ = { jueves: '40000000-0000-0000-0000-000000000001', sabado: '40000000-0000-0000-0000-000000000002', junior: '40000000-0000-0000-0000-000000000003' };
const P = { seba: '20000000-0000-0000-0000-000000000001', capi: '20000000-0000-0000-0000-000000000002',
            doble: '20000000-0000-0000-0000-000000000003', junior: '20000000-0000-0000-0000-000000000004',
            teso: '20000000-0000-0000-0000-000000000005' };
const U = { seba: '00000000-0000-0000-0000-000000000001', capi: '00000000-0000-0000-0000-000000000002',
            doble: '00000000-0000-0000-0000-000000000003', junior: '00000000-0000-0000-0000-000000000004',
            nuevo: '00000000-0000-0000-0000-000000000005', intruso: '00000000-0000-0000-0000-000000000006',
            teso: '00000000-0000-0000-0000-000000000007' };
const correo = (u) => `${u}@correo.cl`;

await db.exec(`
  insert into auth.users (id, email) values ${Object.entries(U).map(([k, id]) => `('${id}', '${correo(k)}')`).join(', ')};
  insert into clubes (id, nombre, slug) values ('${CLUB}', 'Hugo Jara', 'hugo-jara');
  insert into equipos (id, club_id, nombre, orden, categoria) values
    ('${EQ.jueves}', '${CLUB}', 'Senior Jueves', 1, 'senior'),
    ('${EQ.sabado}', '${CLUB}', 'Senior Sábado', 2, 'senior'),
    ('${EQ.junior}', '${CLUB}', 'Junior Sábado', 3, 'junior');
  -- Seba (administrador) y el capitán del Jueves ya tienen cuenta; el resto todavía no.
  insert into personas (id, club_id, nombre, es_admin, user_id) values
    ('${P.seba}', '${CLUB}', 'Sebastián Pino', true, '${U.seba}'),
    ('${P.capi}', '${CLUB}', 'Camilo Capitán', false, '${U.capi}'),
    ('${P.teso}', '${CLUB}', 'Tomás Tesorero', false, '${U.teso}');
  insert into personas (id, club_id, nombre) values
    ('${P.doble}', '${CLUB}', 'Benjamín Silva'),
    ('${P.junior}', '${CLUB}', 'Andrés Albornoz');
  insert into persona_equipos (persona_id, equipo_id, rol) values
    ('${P.seba}', '${EQ.sabado}', 'jugador'),
    ('${P.capi}', '${EQ.jueves}', 'jugador'), ('${P.capi}', '${EQ.jueves}', 'encargado'),
    ('${P.teso}', '${EQ.sabado}', 'tesorero'),
    ('${P.doble}', '${EQ.jueves}', 'jugador'), ('${P.doble}', '${EQ.junior}', 'jugador'),
    ('${P.junior}', '${EQ.junior}', 'jugador');
`);

// Ejecuta como una cuenta que entró a la app.
async function como(quien, sql, params = []) {
  await db.exec(`set role authenticated`);
  await db.query(`select set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claims', $2, false)`,
                 [U[quien], JSON.stringify({ email: correo(quien) })]);
  try { const r = await db.query(sql, params); return { rows: r.rows, error: null }; }
  catch (e) { return { rows: [], error: e.message }; }
  finally { await db.exec('reset role'); }
}
const uno = async (quien, sql, params) => { const r = await como(quien, sql, params); return r.error ? { error: r.error } : Object.values(r.rows[0])[0]; };
const dia = async (n) => (await db.query(`select (public.hoy() + $1::int)::text as d`, [n])).rows[0].d;
let r, x;

// ---------------------------------------------------------------------------
console.log('Ingreso por nombre');
r = await como('doble', 'select count(*) from personas');
ok('Quien no está aprobado no lee la nómina directamente', r.rows[0]?.count === 0n || r.rows[0]?.count === 0 || !!r.error, JSON.stringify(r));
r = await como('doble', 'select count(*) from ingreso_solicitudes');
ok('…ni las solicitudes de ingreso', !!r.error);
ok('Sin persona enlazada, mi_persona es vacío', (await uno('doble', 'select mi_persona()')) === null);
x = await uno('doble', `select nomina_buscar('be')`);
ok('Con menos de tres letras la búsqueda no devuelve nada', Array.isArray(x) && x.length === 0);
x = await uno('doble', `select nomina_buscar('BENJAMIN sil')`);
ok('Encuentra su nombre sin tildes ni mayúsculas, con sus dos planteles',
   x.length === 1 && x[0].nombre === 'Benjamín Silva' && x[0].equipos.length === 2, JSON.stringify(x));
x = await uno('doble', `select nomina_buscar('sebastian')`);
ok('No ofrece nombres que ya tienen cuenta', x.length === 0, JSON.stringify(x));
r = await como('doble', `select ingreso_solicitar($1)`, [P.seba]);
ok('No se puede pedir un nombre que ya tiene cuenta', /ya tiene una cuenta/.test(r.error ?? ''), r.error);
r = await como('doble', `select ingreso_solicitar($1)`, [P.doble]);
ok('Pide el ingreso con su nombre', !r.error, r.error);
x = await uno('doble', 'select ingreso_mi_estado()');
ok('Queda en espera y sabe a quién avisarle',
   x.estado === 'pendiente' && x.nombre === 'Benjamín Silva' && x.aprueban.includes('Camilo Capitán') && x.aprueban.includes('Sebastián Pino'), JSON.stringify(x));
ok('Mientras espera sigue sin entrar', (await uno('doble', 'select mi_persona()')) === null);
r = await como('doble', 'select partidos_proximos()');
ok('…y no ve los partidos', /no está en la nómina/.test(r.error ?? ''), r.error);

r = await como('intruso', `select ingreso_solicitar($1)`, [P.doble]);
ok('Otra cuenta puede pedir el mismo nombre (decide quien aprueba)', !r.error, r.error);
x = await uno('teso', 'select ingreso_pendientes()');
ok('Un tesorero no aprueba ingresos', x.length === 0, JSON.stringify(x));
x = await uno('capi', 'select ingreso_pendientes()');
ok('El encargado del plantel ve las dos solicitudes, con el correo de cada una',
   x.length === 2 && x.some((s) => s.email === correo('doble')) && x.every((s) => s.nombre === 'Benjamín Silva'), JSON.stringify(x));
const sol = (correoDe) => x.find((s) => s.email === correo(correoDe)).id;
const solDoble = sol('doble'), solIntruso = sol('intruso');
r = await como('teso', 'select ingreso_resolver($1, true)', [solDoble]);
ok('Quien no es encargado no puede aprobar', /No puedes resolver/.test(r.error ?? ''), r.error);
r = await como('doble', 'select ingreso_resolver($1, true)', [solDoble]);
ok('Nadie se aprueba a sí mismo', /No puedes resolver/.test(r.error ?? ''), r.error);
r = await como('capi', 'select ingreso_resolver($1, true)', [solDoble]);
ok('El encargado aprueba', !r.error, r.error);
x = await uno('doble', 'select mi_persona()');
ok('La cuenta queda enlazada y trae sus dos planteles',
   x?.nombre === 'Benjamín Silva' && x.equipos.map((e) => e.nombre).join() === 'Senior Jueves,Junior Sábado' && x.es_encargado === false, JSON.stringify(x));
r = await db.query(`select email from persona_contactos where persona_id = $1`, [P.doble]);
ok('Se guarda el correo con que entró', r.rows[0]?.email === correo('doble'));
x = await uno('intruso', 'select ingreso_mi_estado()');
ok('La otra solicitud por el mismo nombre queda rechazada', x.estado === 'rechazada', JSON.stringify(x));
r = await como('capi', 'select ingreso_resolver($1, true)', [solIntruso]);
ok('…y ya no se puede aprobar', /ya fue resuelta/.test(r.error ?? ''), r.error);
r = await como('doble', `select ingreso_solicitar($1)`, [P.junior]);
ok('Una cuenta ya enlazada no pide otro nombre', /ya está en la nómina/.test(r.error ?? ''), r.error);

// Alguien que no está en la lista
r = await como('nuevo', `select ingreso_solicitar(null, 'Nuevo Refuerzo', $1::uuid[])`, [[EQ.sabado]]);
ok('Quien no está en la lista pide el ingreso con nombre y plantel', !r.error, r.error);
x = await uno('capi', 'select ingreso_pendientes()');
ok('El encargado del Jueves no ve una solicitud del Sábado', x.length === 0, JSON.stringify(x));
x = await uno('seba', 'select ingreso_pendientes()');
ok('El administrador sí, marcada como fuera de la nómina', x.length === 1 && x[0].en_nomina === false && x[0].equipos[0] === 'Senior Sábado', JSON.stringify(x));
r = await como('seba', 'select ingreso_resolver($1, true)', [x[0].id]);
x = await uno('nuevo', 'select mi_persona()');
ok('Al aprobarla se crea la persona en su plantel', !r.error && x?.nombre === 'Nuevo Refuerzo' && x.equipos[0]?.nombre === 'Senior Sábado', r.error || JSON.stringify(x));
r = await como('intruso', `select ingreso_solicitar(null, 'Intruso Total')`);
x = (await uno('seba', 'select ingreso_pendientes()'))[0];
r = await como('seba', 'select ingreso_resolver($1, false)', [x.id]);
ok('Rechazar deja a la cuenta fuera', !r.error && (await uno('intruso', 'select mi_persona()')) === null && (await uno('intruso', 'select ingreso_mi_estado()')).estado === 'rechazada');

// ---------------------------------------------------------------------------
console.log('\nPartidos y asistencia');
const manana = await dia(1), ayer = await dia(-1), hoy = await dia(0);
const guardarPartido = (quien, equipo, rival, fecha, id = null, asado = 'Asado') =>
  como(quien, `select partido_guardar($1, $2, $3, $4, '08:15', 'Cancha 1', 'Liga', $5) as id`, [id, equipo, rival, fecha, asado]);
r = await guardarPartido('doble', EQ.jueves, 'Rival', manana);
ok('Un jugador no programa partidos', /Solo el encargado/.test(r.error ?? ''), r.error);
r = await guardarPartido('capi', EQ.sabado, 'Rival', manana);
ok('El encargado del Jueves no programa los del Sábado', /Solo el encargado/.test(r.error ?? ''), r.error);
r = await guardarPartido('capi', EQ.jueves, 'Los del Jueves', manana);
const pJueves = r.rows[0]?.id;
ok('El encargado programa un partido de su plantel', !!pJueves, r.error);
r = await guardarPartido('seba', EQ.junior, 'Los Junior', hoy, null, null);
const pJunior = r.rows[0]?.id;
r = await guardarPartido('seba', EQ.sabado, 'Los del Sábado', manana);
const pSabado = r.rows[0]?.id;
ok('El administrador programa para cualquier plantel', !!pJunior && !!pSabado, r.error);
await db.query(`insert into partidos (club_id, equipo_id, rival, fecha) values ($1, $2, 'Partido viejo', $3)`, [CLUB, EQ.jueves, ayer]);

x = await uno('doble', 'select partidos_proximos()');
ok('Quien juega en dos planteles ve primero sus dos partidos, y después el del otro plantel',
   x.length === 3 && x[0].es_mio && x[1].es_mio && !x[2].es_mio && x[2].equipo === 'Senior Sábado'
   && x.slice(0, 2).map((p) => p.equipo).sort().join() === 'Junior Sábado,Senior Jueves', JSON.stringify(x.map((p) => [p.equipo, p.es_mio])));
ok('El partido de ayer ya no aparece', !x.some((p) => p.rival === 'Partido viejo'));
ok('El partido trae el plantel completo', x.find((p) => p.id === pJueves).plantel.map((j) => j.nombre).join() === 'Benjamín Silva,Camilo Capitán');
r = await como('doble', `select partido_responder($1, 'voy', '  llevo carne  ', true)`, [pJueves]);
ok('Responde "voy" con comentario y tercer tiempo', !r.error, r.error);
r = await como('doble', `select partido_responder($1, 'voy', null, true)`, [pJunior]);
x = await uno('doble', 'select partidos_proximos()');
const rJ = x.find((p) => p.id === pJueves).respuestas[0], rN = x.find((p) => p.id === pJunior).respuestas[0];
ok('Queda guardada con su nombre', rJ.nombre === 'Benjamín Silva' && rJ.estado === 'voy' && rJ.nota === 'llevo carne' && rJ.tercer_tiempo === true, JSON.stringify(rJ));
ok('Si el partido no tiene tercer tiempo, no se marca', rN.tercer_tiempo === false);
r = await como('doble', `select partido_responder($1, 'baja', 'turno', true)`, [pJueves]);
x = (await uno('capi', 'select partidos_proximos()')).find((p) => p.id === pJueves);
ok('Cambiar la respuesta reemplaza la anterior (y una baja no va al tercer tiempo)',
   x.respuestas.length === 1 && x.respuestas[0].estado === 'baja' && x.respuestas[0].tercer_tiempo === false, JSON.stringify(x.respuestas));
ok('El encargado ve que puede editar su partido', x.puedo_editar === true);
r = await como('doble', `select partido_responder($1, 'voy')`, [pSabado]);
ok('No se responde en el partido de otro plantel', /otro plantel/.test(r.error ?? ''), r.error);
r = await como('doble', `select partido_responder($1, 'quizás')`, [pJueves]);
ok('No se acepta una respuesta inventada', /no válida/.test(r.error ?? ''), r.error);
r = await como('doble', `select partido_responder($1, null)`, [pJueves]);
x = (await uno('doble', 'select partidos_proximos()')).find((p) => p.id === pJueves);
ok('Se puede quitar la respuesta', !r.error && x.respuestas.length === 0);
r = await guardarPartido('capi', EQ.jueves, 'Rival corregido', manana, pJueves);
ok('El encargado corrige su partido', !r.error && (await uno('capi', 'select partidos_proximos()')).some((p) => p.rival === 'Rival corregido'), r.error);
r = await como('doble', 'select partido_eliminar($1)', [pJueves]);
ok('Un jugador no elimina partidos', /Solo el encargado/.test(r.error ?? ''), r.error);
r = await como('capi', 'select partido_eliminar($1)', [pSabado]);
ok('Ni el encargado de otro plantel', /Solo el encargado/.test(r.error ?? ''), r.error);
r = await como('intruso', 'select partidos_proximos()');
ok('Una cuenta rechazada no ve nada', /no está en la nómina/.test(r.error ?? ''), r.error);
r = await como('doble', 'select count(*) from partido_respuestas');
ok('Las tablas no se leen directamente', !!r.error);

// ---------------------------------------------------------------------------
console.log('\nEntrenamientos');
const abrir = (quien, fecha, cupo = 3, id = null) =>
  como(quien, `select entrenamiento_guardar($1, $2, '20:00', '22:00', 'Cancha de ejemplo', $3, 2000, 4000, 5000, 1000) as id`, [id, fecha, cupo]);
r = await abrir('doble', manana);
ok('Un jugador no abre listas de entrenamiento', /Solo quienes administran/.test(r.error ?? ''), r.error);
x = await uno('doble', 'select entrenamiento_actual()');
ok('Sin lista abierta, no hay entrenamiento', x.entrenamiento === null && x.puedo_administrar === false);
r = await abrir('capi', manana);
const ent = r.rows[0]?.id;
ok('Un encargado abre la lista', !!ent, r.error);
x = await uno('doble', 'select entrenamiento_actual()');
ok('Quien juega en un plantel senior paga precio senior', x.entrenamiento.mi_precio === 4000, String(x.entrenamiento.mi_precio));
await db.query(`update personas set user_id = $1 where id = $2`, [U.junior, P.junior]);
ok('Quien solo juega en junior paga precio junior', (await uno('junior', 'select entrenamiento_actual()')).entrenamiento.mi_precio === 2000);
r = await como('doble', 'select entrenamiento_inscribirme($1)', [ent]);
r = await como('doble', 'select entrenamiento_inscribirme($1)', [ent]);
x = (await uno('doble', 'select entrenamiento_actual()')).entrenamiento;
ok('Se inscribe una sola vez aunque apriete dos veces', !r.error && x.inscritos.length === 1 && x.inscritos[0].monto === 4000 && x.inscritos[0].es_mio, r.error);
r = await como('doble', `select entrenamiento_invitar($1, 'Primo de Benja')`, [ent]);
r = await como('junior', 'select entrenamiento_inscribirme($1)', [ent]);
x = (await uno('capi', 'select entrenamiento_actual()')).entrenamiento;
const invitado = x.inscritos.find((i) => i.invitado);
ok('Suma un invitado a su nombre, con precio de invitado', invitado?.monto === 5000 && invitado.invitado_por === 'Benjamín Silva', JSON.stringify(invitado));
r = await como('capi', 'select entrenamiento_inscribirme($1)', [ent]);
ok('Con el cupo lleno no entra nadie más', /completa/.test(r.error ?? ''), r.error);
r = await como('junior', 'select entrenamiento_bajar($1)', [invitado.id]);
ok('No se baja al invitado de otro', /Solo puedes bajarte/.test(r.error ?? ''), r.error);
const mio = x.inscritos.find((i) => i.persona_id === P.junior);
r = await como('junior', 'select entrenamiento_bajar($1)', [mio.id]);
x = (await uno('capi', 'select entrenamiento_actual()')).entrenamiento;
ok('Bajarse antes del día libera el cupo sin multa', !r.error && x.inscritos.length === 2 && x.bajas_tarde.length === 0, r.error);
r = await como('capi', 'select entrenamiento_inscribirme($1)', [ent]);
ok('…y el cupo lo toma otro', !r.error, r.error);

r = await como('doble', 'select entrenamiento_pago($1, true)', [invitado.id]);
ok('Un jugador no marca pagos', /marcan los pagos/.test(r.error ?? ''), r.error);
r = await como('capi', 'select entrenamiento_pago($1, true)', [invitado.id]);
ok('Un capitán tampoco, si no es tesorero', /marcan los pagos/.test(r.error ?? ''), r.error);
await db.query(`update personas set cobra_entrenamientos = true where id = $1`, [P.junior]);
r = await como('junior', 'select entrenamiento_pago($1, true)', [invitado.id]);
ok('Quien tiene el permiso de cobrar sí puede', !r.error && (await uno('junior', 'select entrenamiento_actual()')).puedo_cobrar === true, r.error);
r = await como('junior', 'select entrenamiento_pago($1, false)', [invitado.id]);
r = await como('teso', 'select entrenamiento_pago($1, true)', [invitado.id]);
x = (await uno('doble', 'select entrenamiento_actual()')).entrenamiento;
ok('El tesorero marca un pago y todo el club lo ve', !r.error && x.inscritos.find((i) => i.id === invitado.id).pagado === true, r.error);

// El día del entrenamiento
await db.query(`update entrenamientos set fecha = public.hoy() where id = $1`, [ent]);
x = (await uno('doble', 'select entrenamiento_actual()')).entrenamiento;
const deDoble = x.inscritos.find((i) => i.persona_id === P.doble);
r = await como('doble', 'select entrenamiento_bajar($1)', [deDoble.id]);
x = (await uno('doble', 'select entrenamiento_actual()')).entrenamiento;
ok('Bajarse el mismo día deja la multa por pagar y libera el cupo',
   !r.error && x.bajas_tarde.length === 1 && x.bajas_tarde[0].monto === 1000 && x.bajas_tarde[0].pagado === false && x.inscritos.length === 2, JSON.stringify(x.bajas_tarde));
const deCapi = x.inscritos.find((i) => i.persona_id === P.capi);
r = await como('seba', 'select entrenamiento_bajar($1)', [deCapi.id]);
x = (await uno('doble', 'select entrenamiento_actual()')).entrenamiento;
ok('Si lo baja un encargado el mismo día, no hay multa', !r.error && x.bajas_tarde.length === 1 && x.inscritos.length === 1, r.error);

// Al día siguiente
await db.query(`update entrenamientos set fecha = public.hoy() - 1 where id = $1`, [ent]);
x = await uno('doble', 'select entrenamiento_actual()');
ok('Pasado el entrenamiento, la multa impaga aparece en "Deben"',
   x.entrenamiento === null && x.deben.length === 1 && x.deben[0].nombre === 'Benjamín Silva' && x.deben[0].multa === true && x.deben[0].monto === 1000, JSON.stringify(x.deben));
r = await como('doble', 'select entrenamiento_inscribirme($1)', [ent]);
ok('No se inscribe en un entrenamiento que ya pasó', /ya pasó/.test(r.error ?? ''), r.error);
r = await como('teso', 'select entrenamiento_pago($1, true)', [x.deben[0].id]);
ok('Al pagar, sale de "Deben"', !r.error && (await uno('doble', 'select entrenamiento_actual()')).deben.length === 0, r.error);
r = await como('doble', 'select count(*) from entrenamiento_inscritos');
ok('Las tablas no se leen directamente', !!r.error);

// Permiso de administrar entrenamientos (0013): abre listas, baja gente y cobra sin ser encargado ni tesorero.
const diaLista = await dia(3);
await db.query(`update personas set administra_entrenamientos = false where id = $1`, [P.doble]);
r = await abrir('doble', diaLista);
ok('Sin el permiso, un jugador sigue sin abrir listas', /Solo quienes administran/.test(r.error ?? ''), r.error);
await db.query(`update personas set administra_entrenamientos = true where id = $1`, [P.doble]);
r = await abrir('doble', diaLista);
const ent2 = r.rows[0]?.id;
ok('Con el permiso, un jugador abre la lista', !!ent2, r.error);
x = await uno('doble', 'select entrenamiento_actual()');
ok('…y la app le muestra que puede administrar y cobrar', x.puedo_administrar === true && x.puedo_cobrar === true, JSON.stringify(x.puedo_administrar));
r = await como('capi', 'select entrenamiento_inscribirme($1)', [ent2]);
x = (await uno('doble', 'select entrenamiento_actual()')).entrenamiento;
const deCapi2 = x.inscritos.find((i) => i.persona_id === P.capi);
r = await como('doble', 'select entrenamiento_bajar($1)', [deCapi2.id]);
ok('Con el permiso, baja a otra persona de la lista', !r.error, r.error);
r = await como('capi', 'select entrenamiento_inscribirme($1)', [ent2]);
x = (await uno('doble', 'select entrenamiento_actual()')).entrenamiento;
r = await como('doble', 'select entrenamiento_pago($1, true)', [x.inscritos.find((i) => i.persona_id === P.capi).id]);
ok('Con el permiso, marca pagos', !r.error, r.error);
r = await como('doble', 'select entrenamiento_eliminar($1)', [ent2]);
ok('Con el permiso, elimina la lista', !r.error && (await db.query('select 1 from entrenamientos where id = $1', [ent2])).rows.length === 0, r.error);
await db.query(`update personas set administra_entrenamientos = false where id = $1`, [P.doble]);
r = await abrir('doble', diaLista);
ok('Al quitarle el permiso, deja de poder', /Solo quienes administran/.test(r.error ?? ''), r.error);

// Hora de inicio del partido (0014).
const diaInicio = await dia(9);
r = await como('seba', `select partido_guardar(null, $1, 'Rival con hora', $2, '20:30', 'Cancha 2', 'Liga', null, '21:00') as id`, [EQ.jueves, diaInicio]);
const conHora = r.rows[0]?.id;
x = (await uno('seba', 'select partidos_proximos()')).find((p) => p.id === conHora);
ok('El partido guarda la hora de citación y la de inicio', !r.error && x?.citacion === '20:30' && x?.hora_inicio === '21:00', r.error);
r = await como('seba', `select partido_guardar($1, $2, 'Rival con hora', $3, '20:30', 'Cancha 2', 'Liga', null) as id`, [conHora, EQ.jueves, diaInicio]);
x = (await uno('seba', 'select partidos_proximos()')).find((p) => p.id === conHora);
ok('Sin indicarla, la hora de inicio queda vacía (la app anterior sigue funcionando)', !r.error && x?.hora_inicio === null, r.error);
r = await como('doble', `select partido_guardar($1, $2, 'Rival con hora', $3, null, null, null, null, '21:00')`, [conHora, EQ.jueves, diaInicio]);
ok('Un jugador no cambia la hora de inicio', /Solo el encargado/.test(r.error ?? ''), r.error);

// --- Resultado y estadísticas (0012) -------------------------------------------
const viejo = (await db.query(`select id from partidos where rival = 'Partido viejo'`)).rows[0].id;
const J = (...xs) => JSON.stringify(xs.map(([persona_id, goles = 0, asistencias = 0, amarillas = 0, rojas = 0]) =>
  ({ persona_id, goles, asistencias, amarillas, rojas })));
x = await uno('doble', 'select partidos_jugados()');
ok('Un partido de ayer aparece entre los jugados, sin resultado',
   x.length === 1 && x[0].rival === 'Partido viejo' && x[0].goles_favor === null && x[0].estadisticas.length === 0, JSON.stringify(x));
ok('Un jugador común ve que no puede anotar', x[0].puedo_anotar === false);
r = await como('doble', 'select partido_resultado($1, 3, 5, $2)', [viejo, J([P.doble, 1])]);
ok('Un jugador no anota resultados', /Solo quien anota/.test(r.error ?? ''), r.error);
r = await como('capi', 'select partido_resultado($1, 3, 5, $2)', [viejo, J([P.doble, 2, 1, 1], [P.capi, 1, 2, 0, 1])]);
ok('El encargado anota 3-5 con goles, asistencias y tarjetas', !r.error, r.error);
x = (await uno('doble', 'select partidos_jugados()'))[0];
ok('Todo el club ve el marcador y las cifras de cada uno',
   x.goles_favor === 3 && x.goles_contra === 5 && x.estadisticas.length === 2
   && x.estadisticas[0].nombre === 'Benjamín Silva' && x.estadisticas[0].goles === 2 && x.estadisticas[0].amarillas === 1
   && x.estadisticas[1].asistencias === 2 && x.estadisticas[1].rojas === 1, JSON.stringify(x));
r = await como('capi', 'select partido_resultado($1, 4, 5, $2)', [viejo, J([P.doble, 3], [P.capi, 0, 0, 0, 0])]);
x = (await uno('doble', 'select partidos_jugados()'))[0];
ok('Se puede corregir: las cifras se reemplazan y las filas vacías se ignoran',
   !r.error && x.goles_favor === 4 && x.estadisticas.length === 1 && x.estadisticas[0].goles === 3 && x.estadisticas[0].asistencias === 0, r.error);
r = await como('capi', 'select partido_resultado($1, 2, 1, $2)', [viejo, J([P.doble, 3])]);
ok('Los goles de los jugadores no pueden sumar más que el marcador', /suman más/.test(r.error ?? ''), r.error);
r = await como('capi', 'select partido_resultado($1, 2, 1, $2)', [viejo, J([P.doble, 1, 3])]);
ok('Ni las asistencias más que los goles del equipo', /Las asistencias/.test(r.error ?? ''), r.error);
r = await como('capi', 'select partido_resultado($1, 3, 1, $2)', [viejo, J([P.doble, 0, 0, 3])]);
ok('Ni 3 amarillas a una persona', /2 amarillas/.test(r.error ?? ''), r.error);
r = await como('capi', 'select partido_resultado($1, 3, 1, $2)', [viejo, J([P.doble, 0, 0, 0, 2])]);
ok('Ni 2 rojas', /1 roja/.test(r.error ?? ''), r.error);
r = await como('capi', 'select partido_resultado($1, 3, 1, $2)', [viejo, J([P.doble, 1], [P.doble, 1])]);
ok('Un jugador no se repite', /repetido/.test(r.error ?? ''), r.error);
r = await como('capi', 'select partido_resultado($1, 3, 1, $2)', [viejo, J(['20000000-0000-0000-0000-0000000000ff', 1])]);
ok('Ni se acepta alguien que no está en la nómina', /nómina/.test(r.error ?? ''), r.error);
x = (await uno('doble', 'select partidos_jugados()'))[0];
ok('Un intento fallido no cambia lo anotado', x.goles_favor === 4 && x.estadisticas[0].goles === 3, JSON.stringify(x));
r = await como('capi', 'select partido_resultado($1, 2, null, $2)', [viejo, '[]']);
ok('No se acepta medio marcador', /Faltan los goles/.test(r.error ?? ''), r.error);
r = await como('capi', 'select partido_resultado($1, -1, 2, $2)', [viejo, '[]']);
ok('Ni goles negativos', /no válidos/.test(r.error ?? ''), r.error);
r = await como('capi', 'select partido_resultado($1, 1, 0, $2)', [pSabado, '[]']);
ok('El encargado de otro plantel no anota en este', /Solo quien anota/.test(r.error ?? ''), r.error);
r = await como('capi', 'select partido_resultado($1, 1, 0, $2)', [pJueves, '[]']);
ok('No se anota un partido que todavía no se juega', /todavía no se juega/.test(r.error ?? ''), r.error);

await db.query(`update personas set anota_partidos = true where id = $1`, [P.teso]);
x = (await uno('teso', 'select partidos_jugados()'))[0];
ok('Quien tiene el permiso personal ve que puede anotar', x.puedo_anotar === true);
r = await como('teso', 'select partido_resultado($1, 2, 2, $2)', [viejo, J([P.capi, 2, 0, 1])]);
ok('…y anota aunque no sea encargado del plantel', !r.error, r.error);

x = await uno('doble', 'select estadisticas()');
ok('La tabla del club', x.length === 1 && x[0].nombre === 'Camilo Capitán' && x[0].goles === 2 && x[0].amarillas === 1, JSON.stringify(x));
await db.query(`insert into partidos (club_id, equipo_id, rival, fecha, goles_favor, goles_contra)
                values ($1, $2, 'Otro viejo', $3, 4, 0)`, [CLUB, EQ.sabado, ayer]);
const otro = (await db.query(`select id from partidos where rival = 'Otro viejo'`)).rows[0].id;
await db.query(`insert into partido_estadisticas (partido_id, persona_id, goles, asistencias, rojas) values ($1, $2, 3, 0, 1), ($1, $3, 1, 2, 0)`, [otro, P.doble, P.capi]);
x = await uno('doble', 'select estadisticas()');
const b = x.find((e) => e.nombre === 'Benjamín Silva'), c = x.find((e) => e.nombre === 'Camilo Capitán');
ok('Suma entre partidos: goles, asistencias, amarillas y rojas',
   x.length === 2 && b.goles === 3 && b.rojas === 1 && c.goles === 3 && c.asistencias === 2 && c.amarillas === 1, JSON.stringify(x));
x = await uno('doble', 'select estadisticas($1)', [EQ.sabado]);
ok('Se puede filtrar por plantel', x.length === 2 && x.every((e) => e.goles <= 3) && !x.some((e) => e.amarillas), JSON.stringify(x));
x = await uno('doble', 'select estadisticas(null, 1999)');
ok('Y por año', x.length === 0, JSON.stringify(x));
r = await como('seba', 'select partido_resultado($1, null, null, $2)', [viejo, '[]']);
x = (await uno('doble', 'select partidos_jugados()')).find((p) => p.id === viejo);
ok('El administrador puede borrar el resultado, y se van las cifras', !r.error && x.goles_favor === null && x.estadisticas.length === 0, r.error);
x = await uno('doble', 'select partidos_proximos()');
ok('Los jugados no vuelven a "próximos"', !x.some((p) => p.id === viejo));
r = await como('intruso', 'select partidos_jugados()');
ok('Una cuenta rechazada tampoco ve los jugados', /no está en la nómina/.test(r.error ?? ''), r.error);
r = await como('intruso', 'select estadisticas()');
ok('Ni las estadísticas', /no está en la nómina/.test(r.error ?? ''), r.error);
r = await como('doble', 'select count(*) from partido_estadisticas');
ok('Las tablas de estadística no se leen directamente', !!r.error);

console.log(`\n${pass} pruebas pasaron, ${fail} fallaron.`);
process.exit(fail ? 1 : 0);
