import { esDemo, llamar } from './supabase.js';
import { crearAlmacen } from './almacen.js';
import { fechaLarga, proximoDia } from './fechas.js';

// Los partidos que vienen y quién va: la lista que antes se armaba copiando y
// pegando en WhatsApp. Cada jugador responde en los partidos de sus planteles
// (uno o dos); el encargado del plantel los programa.

const desdeFila = (f) => ({
  id: f.id, equipoId: f.equipo_id, equipo: f.equipo, rival: f.rival, torneo: f.torneo,
  fecha: f.fecha, citacion: f.citacion, cancha: f.cancha, tercerTiempo: f.tercer_tiempo,
  esMio: f.es_mio, puedoEditar: f.puedo_editar, plantel: f.plantel,
  respuestas: f.respuestas.map((r) => ({
    personaId: r.persona_id, nombre: r.nombre, estado: r.estado, nota: r.nota, asado: r.tercer_tiempo,
  })),
});

const base = {
  cargar: async () => (await llamar('partidos_proximos')).map(desdeFila),
  responder: (id, _yo, r) => llamar('partido_responder', {
    p_partido: id, p_estado: r?.estado ?? null, p_nota: r?.nota ?? null, p_tercer_tiempo: !!r?.asado,
  }),
  guardar: (d) => llamar('partido_guardar', {
    p_id: d.id ?? null, p_equipo: d.equipoId, p_rival: d.rival, p_fecha: d.fecha,
    p_citacion: d.citacion || null, p_cancha: d.cancha || null,
    p_torneo: d.torneo || null, p_tercer_tiempo: d.tercerTiempo || null,
  }),
  eliminar: (id) => llamar('partido_eliminar', { p_id: id }),
  equipos: () => llamar('equipos_del_club'),
};

// --- Modo demostración: lo mismo, en memoria ------------------------------
const gente = (...nombres) => nombres.map((n) => ({ id: n === 'Seba' ? 'demo' : `d-${n}`, nombre: n }));
const va = (nombre, estado, asado, nota) => ({ personaId: nombre === 'Seba' ? 'demo' : `d-${nombre}`, nombre, estado, asado: !!asado, nota });
let demo = [{
  id: 'p1', equipoId: 'e-sabado', equipo: 'Senior Sábado', torneo: 'Liga de ejemplo · 2ª fecha Clausura',
  rival: 'Rival de ejemplo', fecha: proximoDia(6), citacion: '08:15', cancha: 'Cancha 1',
  tercerTiempo: 'Asado después del partido', esMio: true, puedoEditar: true,
  plantel: gente('Pancho', 'Lalo', 'Tito', 'Nico', 'Rorro', 'Chino', 'Beto', 'Mauro', 'Javi', 'Leo', 'Fede', 'Koke', 'Dani', 'Rafa', 'Seba'),
  respuestas: [
    va('Pancho', 'voy', true, 'llevo carne'), va('Lalo', 'voy', true, 'llevo bebidas'), va('Tito', 'voy', false, 'solo partido'),
    va('Nico', 'voy', true), va('Rorro', 'voy', true, 'llevo pan'), va('Chino', 'voy', false), va('Beto', 'voy', true),
    va('Mauro', 'voy', true, 'llevo carbón'), va('Javi', 'duda', false, 'intentando cambiar el turno'),
    va('Leo', 'baja', false, 'turno'), va('Fede', 'baja', false, 'fuera de Santiago'),
  ],
}, {
  id: 'p2', equipoId: 'e-jueves', equipo: 'Senior Jueves', torneo: 'Liga de ejemplo',
  rival: 'Otro rival de ejemplo', fecha: proximoDia(4), citacion: '21:00', cancha: 'Cancha 3',
  tercerTiempo: null, esMio: false, puedoEditar: true,
  plantel: gente('Memo', 'Gato', 'Toño', 'Pipe'), respuestas: [va('Memo', 'voy'), va('Gato', 'duda')],
}];
const EQUIPOS_DEMO = [{ id: 'e-jueves', nombre: 'Senior Jueves' }, { id: 'e-sabado', nombre: 'Senior Sábado' }, { id: 'e-junior', nombre: 'Junior Sábado' }];
const enDemo = {
  cargar: async () => demo,
  responder: async (id, yo, r) => {
    demo = demo.map((p) => (p.id !== id ? p : {
      ...p,
      respuestas: [...p.respuestas.filter((x) => x.personaId !== yo.id), ...(r ? [{ personaId: yo.id, nombre: yo.nombre, ...r }] : [])],
    }));
  },
  guardar: async (d) => {
    const equipo = EQUIPOS_DEMO.find((e) => e.id === d.equipoId).nombre;
    if (d.id) demo = demo.map((p) => (p.id === d.id ? { ...p, ...d, equipo } : p));
    else demo = [...demo, { ...d, id: `p${Date.now()}`, equipo, esMio: false, puedoEditar: true, plantel: [], respuestas: [] }];
  },
  eliminar: async (id) => { demo = demo.filter((p) => p.id !== id); },
  equipos: async () => EQUIPOS_DEMO,
};

const origen = esDemo ? enDemo : base;
const almacen = crearAlmacen(origen.cargar);
export const vaciarPartidos = almacen.vaciar;

export function usePartidos(yo) {
  const { cargando, error, datos } = almacen.usar();
  const partidos = (datos ?? []).map((p) => ({ ...p, miRespuesta: p.respuestas.find((r) => r.personaId === yo.id) ?? null }));
  const y = (accion) => async (...a) => { await accion(...a); await almacen.recargar(); };
  return {
    cargando, error, partidos,
    mios: partidos.filter((p) => p.esMio),
    responder: y((id, respuesta) => origen.responder(id, yo, respuesta)),
    guardar: y(origen.guardar),
    eliminar: y(origen.eliminar),
  };
}

export const equiposDelClub = () => origen.equipos();

export const porEstado = (partido, e) => partido.respuestas.filter((r) => r.estado === e);

export const sinResponder = (partido) =>
  partido.plantel.filter((j) => !partido.respuestas.some((r) => r.personaId === j.id));

// El recordatorio para el grupo no lleva la lista, lleva el link. La lista
// vive en la app; WhatsApp solo empuja a entrar.
export function recordatorioPartido(p, url) {
  const faltan = sinResponder(p).length;
  return (
    `⚽ ¿Ya confirmaste para el partido?\n` +
    `${p.equipo} vs ${p.rival} · ${fechaLarga(p.fecha)}` +
    (p.citacion ? `, citación ${p.citacion}` : '') + (p.cancha ? `, ${p.cancha}` : '') + `.\n` +
    `Van ${porEstado(p, 'voy').length} y hay ${porEstado(p, 'duda').length} en duda.` +
    (faltan ? ` Faltan ${faltan} por responder.` : ' Ya respondieron todos.') +
    `\nConfirma acá 👉 ${url}`
  );
}
