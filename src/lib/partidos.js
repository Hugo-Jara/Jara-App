import { esDemo, llamar } from './supabase.js';
import { crearAlmacen } from './almacen.js';
import { fechaLarga, proximoDia, correrDias, hoyIso } from './fechas.js';

// Los partidos que vienen y quién va: la lista que antes se armaba copiando y
// pegando en WhatsApp. Cada jugador responde en los partidos de sus planteles
// (uno o dos); el encargado del plantel los programa.

const filaEstadistica = (g) => ({
  personaId: g.persona_id, nombre: g.nombre, pj: g.pj ?? 0, goles: g.goles ?? 0, asistencias: g.asistencias ?? 0,
  amarillas: g.amarillas ?? 0, rojas: g.rojas ?? 0,
});

const desdeFila = (f) => ({
  id: f.id, equipoId: f.equipo_id, equipo: f.equipo, rival: f.rival, torneo: f.torneo,
  fecha: f.fecha, citacion: f.citacion, horaInicio: f.hora_inicio, cancha: f.cancha, tercerTiempo: f.tercer_tiempo,
  golesFavor: f.goles_favor ?? null, golesContra: f.goles_contra ?? null,
  estadisticas: (f.estadisticas ?? []).map(filaEstadistica),
  // Quiénes jugaron (0025). Si la base todavía no lo trae, queda nulo.
  jugaron: f.jugaron ?? null,
  puedoAnotar: !!f.puedo_anotar,
  esMio: f.es_mio, puedoEditar: f.puedo_editar, plantel: f.plantel,
  respuestas: f.respuestas.map((r) => ({
    personaId: r.persona_id, nombre: r.nombre, estado: r.estado, nota: r.nota, asado: r.tercer_tiempo,
  })),
});

const base = {
  // Los que vienen y los ya jugados, juntos: la pantalla los separa por fecha.
  cargar: async () => {
    const [proximos, jugados] = await Promise.all([llamar('partidos_proximos'), llamar('partidos_jugados')]);
    return [...proximos, ...jugados].map(desdeFila);
  },
  resultado: (id, favor, contra, jugadores = [], jugaron = null) => llamar('partido_resultado', {
    p_partido: id, p_favor: favor, p_contra: contra,
    p_jugadores: jugadores.map((g) => ({
      persona_id: g.personaId, goles: g.goles, asistencias: g.asistencias, amarillas: g.amarillas, rojas: g.rojas,
    })),
    ...(jugaron ? { p_jugaron: jugaron } : {}),
  }),
  // equipoIds: uno o varios planteles (una categoría); vacío = todo el club.
  estadisticas: async (equipoIds, anio) => (await llamar('estadisticas', {
    p_anio: anio ?? null, ...(equipoIds?.length ? { p_equipos: equipoIds } : {}),
  })).map(filaEstadistica),
  responder: (id, _yo, r) => llamar('partido_responder', {
    p_partido: id, p_estado: r?.estado ?? null, p_nota: r?.nota ?? null, p_tercer_tiempo: !!r?.asado,
  }),
  guardar: (d) => llamar('partido_guardar', {
    p_id: d.id ?? null, p_equipo: d.equipoId, p_rival: d.rival, p_fecha: d.fecha,
    p_citacion: d.citacion || null, p_hora_inicio: d.horaInicio || null, p_cancha: d.cancha || null,
    p_torneo: d.torneo || null, p_tercer_tiempo: d.tercerTiempo || null,
  }),
  eliminar: (id) => llamar('partido_eliminar', { p_id: id }),
  equipos: () => llamar('equipos_del_club'),
  arquero: (personaId, anio) => llamar('arquero_cifras', { p_persona: personaId, p_anio: anio ?? null }),
  arco: async (partidoId) => {
    const r = await llamar('partido_arco', { p_partido: partidoId });
    return { arqueros: r.arqueros.map((a) => ({ personaId: a.persona_id, recibidos: a.recibidos })), sugeridos: r.sugeridos };
  },
  arcoGuardar: (partidoId, arqueros) => llamar('partido_arco_guardar', {
    p_partido: partidoId, p_arqueros: arqueros.map((a) => ({ persona_id: a.personaId, recibidos: a.recibidos })),
  }),
  dt: (personaId, anio) => llamar('dt_cifras', { p_persona: personaId, p_anio: anio ?? null }),
  banca: (partidoId) => llamar('partido_banca', { p_partido: partidoId }),
  bancaGuardar: (partidoId, tecnicos) => llamar('partido_banca_guardar', { p_partido: partidoId, p_tecnicos: tecnicos }),
};

// --- Modo demostración: lo mismo, en memoria ------------------------------
const gente = (...nombres) => nombres.map((n) => ({ id: n === 'Seba' ? 'demo' : `d-${n}`, nombre: n }));
const va = (nombre, estado, asado, nota) => ({ personaId: nombre === 'Seba' ? 'demo' : `d-${nombre}`, nombre, estado, asado: !!asado, nota });
let demo = [{
  id: 'p1', equipoId: 'e-sabado', equipo: 'Senior Sábado', torneo: 'Liga de ejemplo · 2ª fecha Clausura',
  rival: 'Rival de ejemplo', fecha: proximoDia(6), citacion: '08:15', horaInicio: '09:00', cancha: 'Cancha 1',
  tercerTiempo: 'Asado después del partido', esMio: true, puedoEditar: true, puedoAnotar: true,
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
  tercerTiempo: null, esMio: false, puedoEditar: true, puedoAnotar: true,
  plantel: gente('Memo', 'Gato', 'Toño', 'Pipe'), respuestas: [va('Memo', 'voy'), va('Gato', 'duda')],
}, {
  id: 'p3', equipoId: 'e-jueves', equipo: 'Senior Jueves', torneo: 'Liga de ejemplo',
  rival: 'Rival jugado de ejemplo', fecha: correrDias(hoyIso(), -2), citacion: '21:00', cancha: 'Cancha 2',
  tercerTiempo: null, esMio: false, puedoEditar: true, puedoAnotar: true, golesFavor: null, golesContra: null, estadisticas: [],
  plantel: gente('Memo', 'Gato'), respuestas: [va('Memo', 'voy'), va('Gato', 'voy')],
}, {
  id: 'p4', equipoId: 'e-sabado', equipo: 'Senior Sábado', torneo: 'Liga de ejemplo',
  rival: 'Otro rival jugado', fecha: correrDias(hoyIso(), -7), citacion: '08:15', cancha: 'Cancha 1',
  tercerTiempo: null, esMio: true, puedoEditar: true, puedoAnotar: true, golesFavor: 3, golesContra: 1,
  estadisticas: [
    { personaId: 'd-Pancho', nombre: 'Pancho', goles: 2, asistencias: 0, amarillas: 1, rojas: 0 },
    { personaId: 'd-Lalo', nombre: 'Lalo', goles: 1, asistencias: 2, amarillas: 0, rojas: 0 },
  ],
  plantel: gente('Pancho', 'Lalo', 'Seba'), respuestas: [va('Pancho', 'voy'), va('Lalo', 'voy'), va('Seba', 'voy')],
  jugaron: ['d-Pancho', 'd-Lalo', 'demo'],
}, {
  id: 'p5', equipoId: 'e-junior', equipo: 'Junior Sábado', torneo: 'Liga de ejemplo',
  rival: 'Rival junior de ejemplo', fecha: correrDias(hoyIso(), -7), citacion: '10:00', cancha: 'Cancha 4',
  tercerTiempo: null, esMio: false, puedoEditar: true, puedoAnotar: true, golesFavor: 2, golesContra: 2,
  estadisticas: [
    { personaId: 'd-Mati', nombre: 'Mati', goles: 2, asistencias: 0, amarillas: 0, rojas: 1 },
  ],
  plantel: gente('Mati', 'Cote'), respuestas: [va('Mati', 'voy'), va('Cote', 'voy')], jugaron: ['d-Mati', 'd-Cote'],
},
// Jugado ayer: la votación del jugador del partido sigue abierta (0027).
{
  id: 'p6', equipoId: 'e-sabado', equipo: 'Senior Sábado', torneo: 'Liga de ejemplo',
  rival: 'Rival de ayer', fecha: correrDias(hoyIso(), -1), citacion: '08:15', cancha: 'Cancha 2',
  tercerTiempo: null, esMio: true, puedoEditar: true, puedoAnotar: true, golesFavor: 1, golesContra: 0,
  estadisticas: [{ personaId: 'd-Tito', nombre: 'Tito', goles: 1, asistencias: 0, amarillas: 0, rojas: 0 }],
  plantel: gente('Pancho', 'Lalo', 'Tito', 'Nico', 'Seba'),
  respuestas: [va('Pancho', 'voy'), va('Lalo', 'voy'), va('Tito', 'voy'), va('Nico', 'voy'), va('Seba', 'voy')],
  jugaron: ['d-Pancho', 'd-Lalo', 'd-Tito', 'd-Nico', 'demo'],
},
// Fechas anteriores, para ver la racha y la tabla con más gente.
...[
  ['e-sabado', 'Senior Sábado', [[2, 0], [1, 1], [0, 2], [4, 1], [2, 1]], ['Pancho', 'Lalo', 'Tito', 'Nico', 'Seba']],
  ['e-jueves', 'Senior Jueves', [[1, 3], [2, 2], [3, 0], [0, 1], [1, 0]], ['Memo', 'Gato', 'Toño', 'Pipe']],
  ['e-junior', 'Junior Sábado', [[3, 1], [0, 0], [2, 1], [1, 2], [5, 2]], ['Mati', 'Cote', 'Benja', 'Tomi']],
].flatMap(([equipoId, equipo, marcadores, quienes]) => marcadores.map(([favor, contra], i) => {
  const jugadores = gente(...quienes);
  const goleador = jugadores[i % jugadores.length];
  return {
    id: `h-${equipoId}-${i}`, equipoId, equipo, torneo: 'Liga de ejemplo', rival: `Rival de ejemplo ${i + 1}`,
    fecha: correrDias(hoyIso(), -14 - 7 * i), citacion: null, cancha: null, tercerTiempo: null,
    esMio: equipoId === 'e-sabado', puedoEditar: true, puedoAnotar: true, golesFavor: favor, golesContra: contra,
    estadisticas: favor ? [{ personaId: goleador.id, nombre: goleador.nombre, goles: favor, asistencias: 0, amarillas: i === 2 ? 1 : 0, rojas: 0 }] : [],
    plantel: jugadores, respuestas: jugadores.map((j) => va(j.nombre, 'voy')), jugaron: jugadores.map((j) => j.id),
  };
}))];
// En demostración, quién tiene "Arquero" en su perfil y quién atajó en cada partido.
const ARQUEROS_DEMO = ['demo', 'd-Nico'];
const arcoDemo = {};
// En demostración, el DT de Senior Sábado y quién dirigió cada partido.
const TECNICOS_DEMO = { 'e-sabado': [{ id: 'd-Profe', nombre: 'Profe Inventado' }] };
const bancaDemo = {};
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
    if (d.id) { demo = demo.map((p) => (p.id === d.id ? { ...p, ...d, equipo } : p)); return d.id; }
    const id = `p${Date.now()}${Math.floor(Math.random() * 1000)}`;
    demo = [...demo, { ...d, id, equipo, esMio: false, puedoEditar: true, puedoAnotar: true, estadisticas: [], plantel: [], respuestas: [] }];
    return id;
  },
  eliminar: async (id) => { demo = demo.filter((p) => p.id !== id); },
  resultado: async (id, favor, contra, jugadores = [], jugaron = null) => {
    demo = demo.map((p) => (p.id === id ? {
      ...p, golesFavor: favor, golesContra: contra,
      jugaron: favor == null ? [] : [...new Set([
        ...(jugaron ?? p.respuestas.filter((r) => r.estado === 'voy').map((r) => r.personaId)),
        ...jugadores.filter((g) => g.goles + g.asistencias + g.amarillas + g.rojas > 0).map((g) => g.personaId),
      ])],
      estadisticas: favor == null ? [] : jugadores
        .filter((g) => g.goles + g.asistencias + g.amarillas + g.rojas > 0)
        .map((g) => ({ ...g, nombre: p.plantel.find((j) => j.id === g.personaId)?.nombre ?? g.nombre ?? '' })),
    } : p));
  },
  estadisticas: async (equipoIds) => {
    const suma = new Map();
    const fila = (id, nombre) => suma.get(id) ?? { personaId: id, nombre, pj: 0, goles: 0, asistencias: 0, amarillas: 0, rojas: 0 };
    demo.filter((p) => tieneResultado(p) && (!equipoIds?.length || equipoIds.includes(p.equipoId))).forEach((p) => {
      const nombreDe = (id) => [...p.plantel, ...p.respuestas.map((r) => ({ id: r.personaId, nombre: r.nombre }))].find((j) => j.id === id)?.nombre ?? '';
      const ids = new Set([...(p.jugaron ?? []), ...(p.estadisticas ?? []).map((g) => g.personaId)]);
      ids.forEach((id) => { const x = fila(id, nombreDe(id)); suma.set(id, { ...x, pj: x.pj + 1 }); });
      (p.estadisticas ?? []).forEach((g) => {
        const x = fila(g.personaId, g.nombre);
        suma.set(g.personaId, { ...x, goles: x.goles + g.goles, asistencias: x.asistencias + g.asistencias, amarillas: x.amarillas + g.amarillas, rojas: x.rojas + g.rojas });
      });
    });
    return [...suma.values()];
  },
  equipos: async () => EQUIPOS_DEMO,
  arquero: async (personaId) => {
    const por = {};
    demo.filter(tieneResultado).forEach((p) => {
      const marcados = arcoDemo[p.id] ?? [];
      const yo = marcados.find((a) => a.personaId === personaId);
      const jugo = (p.jugaron ?? []).includes(personaId) || p.estadisticas.some((g) => g.personaId === personaId);
      if (yo) por[p.id] = yo.recibidos;
      else if (!marcados.length && jugo && ARQUEROS_DEMO.includes(personaId)) por[p.id] = p.golesContra;
    });
    const v = Object.values(por);
    return { pj: v.length, recibidos: v.reduce((t, n) => t + n, 0), invictas: v.filter((n) => n === 0).length, por_partido: por };
  },
  arco: async (partidoId) => ({ arqueros: structuredClone(arcoDemo[partidoId] ?? []), sugeridos: ARQUEROS_DEMO }),
  dt: async (personaId, anio) => {
    const mios = demo.filter((p) => tieneResultado(p) && (!anio || p.fecha.startsWith(String(anio))))
      .filter((p) => (bancaDemo[p.id]?.length ? bancaDemo[p.id].includes(personaId)
        : (TECNICOS_DEMO[p.equipoId] ?? []).some((t) => t.id === personaId)));
    const cuenta = (f) => mios.filter(f).length;
    const goles = {};
    mios.forEach((p) => p.estadisticas.forEach((g) => { if (g.goles) goles[g.personaId] = { persona_id: g.personaId, nombre: g.nombre, goles: (goles[g.personaId]?.goles ?? 0) + g.goles }; }));
    const goleador = Object.values(goles).sort((a, b) => b.goles - a.goles)[0] ?? null;
    const porPlantel = [...new Set(mios.map((p) => p.equipoId))].map((id) => {
      const ps = mios.filter((p) => p.equipoId === id);
      return { id, nombre: ps[0].equipo, pj: ps.length, g: ps.filter((p) => signo(p) === 'G').length, e: ps.filter((p) => signo(p) === 'E').length, p: ps.filter((p) => signo(p) === 'P').length };
    });
    return {
      pj: mios.length, g: cuenta((p) => signo(p) === 'G'), e: cuenta((p) => signo(p) === 'E'), p: cuenta((p) => signo(p) === 'P'),
      gf: mios.reduce((t, p) => t + p.golesFavor, 0), gc: mios.reduce((t, p) => t + p.golesContra, 0),
      invictas: cuenta((p) => p.golesContra === 0), por_plantel: porPlantel, partidos: mios.map((p) => p.id),
      goleador, mvp: null,
    };
  },
  banca: async (partidoId) => {
    const p = demo.find((x) => x.id === partidoId);
    return { tecnicos: [...(bancaDemo[partidoId] ?? [])], sugeridos: TECNICOS_DEMO[p?.equipoId] ?? [] };
  },
  bancaGuardar: async (partidoId, tecnicos) => { bancaDemo[partidoId] = [...tecnicos]; },
  arcoGuardar: async (partidoId, arqueros) => {
    const p = demo.find((x) => x.id === partidoId);
    arcoDemo[partidoId] = arqueros.length === 1 ? [{ ...arqueros[0], recibidos: p.golesContra }] : arqueros;
  },
};

const origen = esDemo ? enDemo : base;
const almacen = crearAlmacen(origen.cargar);
export const vaciarPartidos = almacen.vaciar;

export function usePartidos(yo) {
  const { cargando, error, datos } = almacen.usar();
  const partidos = (datos ?? []).map((p) => ({ ...p, miRespuesta: p.respuestas.find((r) => r.personaId === yo.id) ?? null }));
  const y = (accion) => async (...a) => { await accion(...a); await almacen.recargar(); };
  const hoy = hoyIso();
  // Un partido sigue "próximo" hasta dos horas después de su hora de inicio (o
  // hasta que termina su día, si no tiene hora). Con el resultado anotado pasa
  // a "jugados" en el acto.
  const ahora = new Date();
  const ahoraHora = `${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}`;
  const terminado = (p) => {
    if (!p.horaInicio) return false;
    const [h, m] = p.horaInicio.split(':').map(Number);
    const fin = h * 60 + m + 120;
    return fin < 24 * 60 && ahoraHora >= `${String(Math.floor(fin / 60)).padStart(2, '0')}:${String(fin % 60).padStart(2, '0')}`;
  };
  const yaJugado = (p) => p.fecha < hoy || (p.fecha === hoy && (tieneResultado(p) || terminado(p)));
  const proximos = partidos.filter((p) => !yaJugado(p));
  const jugados = partidos.filter(yaJugado).sort((a, b) => b.fecha.localeCompare(a.fecha));
  return {
    cargando, error, recargar: almacen.recargar, todos: partidos, partidos: proximos, jugados,
    mios: proximos.filter((p) => p.esMio),
    anotarResultado: y(origen.resultado),
    responder: y((id, respuesta) => origen.responder(id, yo, respuesta)),
    guardar: y(origen.guardar),
    eliminar: y(origen.eliminar),
  };
}

export const equiposDelClub = () => origen.equipos();
// Crea un partido ya jugado (por ejemplo, desde una carpeta de fotos) y devuelve su id.
export const crearPartidoJugado = async (d) => { const id = await origen.guardar(d); await almacen.recargar(); return id; };
export const tablaEstadisticas = (equipoIds, anio) => origen.estadisticas(equipoIds, anio);
// ¿Quién atajó? (0046): partidos al arco, goles recibidos, vallas invictas y lo
// recibido en cada partido ({partidoId: n}) de un arquero.
export const cifrasArquero = (personaId, anio) => origen.arquero(personaId, anio);
// Quién atajó en un partido ({ arqueros: [{personaId, recibidos}], sugeridos: [ids] }) y anotarlo.
export const leerArco = (partidoId) => origen.arco(partidoId);
export const guardarArco = (partidoId, arqueros) => origen.arcoGuardar(partidoId, arqueros);
// Perfil del DT (0048): récord, goles a favor y en contra, vallas invictas, por
// plantel, los ids de sus partidos, goleador y jugador del partido más repetido.
export const cifrasDT = (personaId, anio) => origen.dt(personaId, anio);
// ¿Quién dirigió? ({ tecnicos: [ids], sugeridos: [{id, nombre}] }) y anotarlo.
export const leerBanca = (partidoId) => origen.banca(partidoId);
export const guardarBanca = (partidoId, tecnicos) => origen.bancaGuardar(partidoId, tecnicos);

export const tieneResultado = (p) => p.golesFavor != null && p.golesContra != null;

// 'G' ganado, 'E' empatado, 'P' perdido.
export const signo = (p) => (p.golesFavor > p.golesContra ? 'G' : p.golesFavor < p.golesContra ? 'P' : 'E');

// Los últimos n resultados de una lista de jugados (más reciente primero).
export const racha = (jugados, n = 5) => jugados.filter(tieneResultado).slice(0, n);

export const textoResultado = (p) =>
  p.golesFavor > p.golesContra ? 'Ganamos' : p.golesFavor < p.golesContra ? 'Perdimos' : 'Empatamos';

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
    (p.citacion ? `, citación ${p.citacion}` : '') + (p.horaInicio ? `, parte ${p.horaInicio}` : '') + (p.cancha ? `, ${p.cancha}` : '') + `.\n` +
    `Van ${porEstado(p, 'voy').length} y hay ${porEstado(p, 'duda').length} en duda.` +
    (faltan ? ` Faltan ${faltan} por responder.` : ' Ya respondieron todos.') +
    `\nConfirma acá 👉 ${url}`
  );
}
