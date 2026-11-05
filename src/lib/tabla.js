import { esDemo, llamar } from './supabase.js';
import { crearAlmacen } from './almacen.js';

// La tabla de posiciones de cada plantel. Las ligas la publican como imagen o
// dentro de una app, así que el encargado la copia acá después de cada fecha:
// pega el texto (una línea por equipo) y la app lo ordena (migración 0026).

const NUMEROS = ['pj', 'pg', 'pe', 'pp', 'gf', 'gc', 'pts'];

const desdeFila = (t) => ({
  equipoId: t.equipo_id, equipo: t.equipo, torneo: t.torneo ?? '', fuente: t.fuente ?? '',
  actualizadaEn: t.actualizada_en, puedoEditar: !!t.puedo_editar,
  conectada: !!t.conectada, deporstarTabla: t.deporstar_tabla ?? null, revisadaEn: t.revisada_en ?? null,
  filas: (t.filas ?? []).map((f) => ({ ...f, esJara: !!f.es_jara })),
});

const base = {
  cargar: async () => (await llamar('tablas_posiciones')).map(desdeFila),
  guardar: (equipoId, torneo, filas, fuente) => llamar('tabla_guardar', {
    p_equipo: equipoId, p_torneo: torneo || null, p_fuente: fuente || null,
    p_filas: filas.map(({ esJara, ...f }) => ({ ...f, es_jara: esJara })),
  }),
  // Traer la tabla desde la liga (0032). Sin forzar, la base decide si ya toca.
  refrescar: (equipoId, forzar = false) => llamar('tabla_refrescar', { p_equipo: equipoId, p_forzar: forzar }),
  conectar: (equipoId, numero) => llamar('tabla_conectar', { p_equipo: equipoId, p_deporstar: numero ?? null }),
};

// --- Modo demostración: equipos inventados, en memoria --------------------
const f = (equipo, pj, pg, pe, pp, gf, gc, esJara = false) => ({ equipo, pj, pg, pe, pp, gf, gc, pts: pg * 3 + pe, esJara });
let demo = [
  { equipoId: 'e-jueves', equipo: 'Senior Jueves', torneo: 'Liga de ejemplo · Clausura', fuente: '', actualizadaEn: new Date().toISOString(), puedoEditar: true,
    filas: [f('Rival Uno de Ejemplo', 7, 5, 1, 1, 18, 7), f('Hugo Jara', 7, 4, 2, 1, 15, 9, true), f('Rival Dos de Ejemplo', 7, 3, 2, 2, 11, 10),
            f('Rival Tres de Ejemplo', 7, 2, 1, 4, 9, 14), f('Rival Cuatro de Ejemplo', 7, 0, 2, 5, 5, 18)] },
  { equipoId: 'e-sabado', equipo: 'Senior Sábado', torneo: 'Liga de ejemplo', fuente: '', actualizadaEn: new Date().toISOString(), puedoEditar: true, conectada: true, deporstarTabla: 71290, revisadaEn: new Date().toISOString(),
    filas: [f('Hugo Jara', 9, 6, 2, 1, 20, 8, true), f('Rival Cinco de Ejemplo', 9, 6, 1, 2, 19, 11), f('Rival Seis de Ejemplo', 9, 4, 3, 2, 14, 12),
            f('Rival Siete de Ejemplo', 9, 2, 2, 5, 10, 17), f('Rival Ocho de Ejemplo', 9, 1, 2, 6, 7, 22)] },
  { equipoId: 'e-junior', equipo: 'Junior Sábado', torneo: '', fuente: '', actualizadaEn: null, puedoEditar: true, filas: [] },
];
const enDemo = {
  cargar: async () => demo,
  guardar: async (equipoId, torneo, filas, fuente) => {
    demo = demo.map((t) => (t.equipoId === equipoId ? { ...t, torneo, fuente, filas, actualizadaEn: new Date().toISOString() } : t));
  },
  refrescar: async (equipoId, forzar) => {
    if (forzar) demo = demo.map((t) => (t.equipoId === equipoId ? { ...t, revisadaEn: new Date().toISOString() } : t));
    return false;
  },
  conectar: async (equipoId, numero) => {
    demo = demo.map((t) => (t.equipoId === equipoId ? { ...t, deporstarTabla: numero ?? null, conectada: !!numero } : t));
  },
};

const origen = esDemo ? enDemo : base;
const almacen = crearAlmacen(origen.cargar);

export function useTablas() {
  const { cargando, error, datos } = almacen.usar();
  return {
    cargando, error, tablas: datos ?? [], recargar: almacen.recargar,
    guardar: async (...a) => { await origen.guardar(...a); await almacen.recargar(); },
    conectar: async (...a) => { await origen.conectar(...a); await almacen.recargar(); },
    // Devuelve true si la tabla cambió.
    refrescar: async (equipoId, forzar) => {
      const cambio = await origen.refrescar(equipoId, forzar);
      if (cambio || forzar) await almacen.recargar();
      return cambio;
    },
  };
}

export const diferencia = (fila) => fila.gf - fila.gc;

// --- Pegar la tabla como texto --------------------------------------------
// Una línea por equipo, en el orden de la tabla: "Hugo Jara 9 6 2 1 20 8 20"
// (PJ G E P GF GC Pts). Si trae la diferencia de gol antes de los puntos (8
// números), se ignora. Un número de puesto al comienzo ("1." o "1") también.
export function leerTabla(texto) {
  const filas = [];
  const problemas = [];
  texto.split('\n').map((l) => l.replace(/\t/g, ' ').trim()).filter(Boolean).forEach((linea, i) => {
    const partes = linea.split(/\s+/);
    const nums = [];
    while (partes.length && /^[-+]?\d+$/.test(partes.at(-1))) nums.unshift(Number(partes.pop()));
    let nombre = partes.join(' ').replace(/^\d+\s*[.)º°-]?\s+/, '').trim();
    if (!nombre || nums.length < 7) {
      problemas.push(`Línea ${i + 1}: "${linea}" necesita el equipo y 7 números (PJ G E P GF GC Pts).`);
      return;
    }
    const v = nums.length >= 8 ? [...nums.slice(-8, -2), nums.at(-1)] : nums.slice(-7);
    const fila = { equipo: nombre.slice(0, 60), esJara: /jara/i.test(nombre) };
    NUMEROS.forEach((k, j) => { fila[k] = v[j]; });
    filas.push(fila);
  });
  // Si más de una fila dice "Jara", ninguna queda marcada sola: se marca la primera.
  let visto = false;
  filas.forEach((x) => { if (x.esJara) { x.esJara = !visto; visto = true; } });
  return { filas, problemas };
}

export const textoDeTabla = (filas) =>
  filas.map((x) => [x.equipo, ...NUMEROS.map((k) => x[k])].join(' ')).join('\n');

// --- Pegar las fechas del campeonato (fixture) ------------------------------
// Una línea por partido: "14/11 Rival FC" o "14/11 09:00 Rival FC". El año se
// deduce: si la fecha ya pasó hace más de dos meses, es del año siguiente.
export function leerFixture(texto, hoy) {
  const [anioHoy] = hoy.split('-').map(Number);
  const partidos = [];
  const problemas = [];
  texto.split('\n').map((l) => l.replace(/\t/g, ' ').trim()).filter(Boolean).forEach((linea, i) => {
    const m = linea.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\s+(?:(\d{1,2})[:.](\d{2})\s*(?:h|hrs)?\s+)?(?:vs\.?\s+)?(.+)$/i);
    if (!m) {
      problemas.push(`Línea ${i + 1}: "${linea}" no se entiende. Escríbela como "14/11 Rival" o "14/11 09:00 Rival".`);
      return;
    }
    const [, d, mes, a, hh, mm, rival] = m;
    let anio = a ? Number(a.length === 2 ? `20${a}` : a) : anioHoy;
    const fecha = (y) => `${y}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const valida = (iso) => { const x = new Date(`${iso}T12:00:00`); return !Number.isNaN(x) && x.toISOString().slice(0, 10) === iso; };
    if (!a && fecha(anio) < restarDias(hoy, 60)) anio += 1;
    const iso = fecha(anio);
    if (Number(mes) > 12 || !valida(iso)) {
      problemas.push(`Línea ${i + 1}: la fecha "${d}/${mes}" no existe.`);
      return;
    }
    const hora = hh ? `${String(hh).padStart(2, '0')}:${mm}` : '';
    if (hora && (Number(hh) > 23 || Number(mm) > 59)) {
      problemas.push(`Línea ${i + 1}: la hora "${hora}" no existe.`);
      return;
    }
    partidos.push({ fecha: iso, horaInicio: hora, rival: rival.trim().slice(0, 80) });
  });
  return { partidos, problemas };
}

function restarDias(iso, n) {
  const x = new Date(`${iso}T12:00:00`);
  x.setDate(x.getDate() - n);
  return x.toISOString().slice(0, 10);
}

// Crear un partido sin recargar la lista cada vez (para cargar muchas fechas
// juntas). En modo demostración no existe: se usa el guardar de usePartidos.
export const crearPartidoSuelto = esDemo ? null : (d) => llamar('partido_guardar', {
  p_id: null, p_equipo: d.equipoId, p_rival: d.rival, p_fecha: d.fecha,
  p_citacion: d.citacion || null, p_hora_inicio: d.horaInicio || null, p_cancha: d.cancha || null,
  p_torneo: d.torneo || null, p_tercer_tiempo: null,
});
