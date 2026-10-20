// Comprueba contra el proyecto real que sin sesión no se puede leer nada.
//   node --env-file=.env.local supabase/tests/api-anonima.mjs
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_KEY);
let mal = 0;

// Tablas de 0001 y 0002 (cerradas en 0018) y el registro de búsquedas de la nómina.
for (const t of ['clubes', 'personas', 'persona_contactos', 'equipos', 'persona_equipos', 'areas', 'persona_areas',
                 'solicitudes_compra', 'solicitud_adjuntos', 'solicitud_eventos', 'nomina_busquedas']) {
  const { data, error } = await sb.from(t).select('*').limit(5);
  const filas = data?.length ?? 0;
  if (error && !error.code) {
    console.log('No se pudo conectar con Supabase:', error.message);
    process.exit(2);
  }
  if (!error && filas > 0) mal++;
  console.log(t.padEnd(28), error ? `rechazado (${error.code})` : `${filas} filas`);
}

// M2: tampoco se escribe.
{
  const { error } = await sb.from('personas').update({ es_admin: true }).eq('nombre', 'nadie');
  if (!error) mal++;
  console.log('escribir en personas'.padEnd(28), error ? `rechazado (${error.code})` : 'ACEPTADO');
}

// Funciones que piden una cuenta: M1 (gestionar planteles), M3 (nómina) y M5 (invitados).
const NADA = '00000000-0000-0000-0000-000000000000';
const funciones = [
  ['vincular_persona', {}],
  ['mi_persona', {}],
  ['nomina_buscar', { p_texto: 'mar' }],
  ['equipos_del_club', {}],
  ['ingreso_pendientes', {}],
  ['ingreso_resolver', { p_solicitud: NADA, p_aprobar: true }],
  ['partido_guardar', { p_id: null, p_equipo: NADA, p_rival: 'x', p_fecha: '2030-01-01' }],
  ['partido_eliminar', { p_id: NADA }],
  ['entrenamiento_guardar', { p_id: null, p_fecha: '2030-01-01', p_hora_inicio: null, p_hora_fin: null, p_lugar: null,
                              p_cupo: 1, p_precio_junior: 0, p_precio_senior: 0, p_precio_invitado: 0, p_multa: 0 }],
  ['entrenamiento_eliminar', { p_id: NADA }],
  ['entrenamiento_bajar', { p_inscrito: NADA }],
  ['entrenamiento_invitar', { p_id: NADA, p_nombre: 'Invitado de prueba' }],
];
for (const [f, params] of funciones) {
  const r = await sb.rpc(f, params);
  // Sin permiso responde 42501; cualquier otro resultado es un hueco.
  const rechazado = r.error?.code === '42501';
  if (!rechazado) mal++;
  console.log(`rpc ${f}`.padEnd(28), rechazado ? 'rechazado (42501)' : `ABIERTO: ${r.error?.message ?? JSON.stringify(r.data)}`);
}
process.exit(mal ? 1 : 0);
