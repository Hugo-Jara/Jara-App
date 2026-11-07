import { esDemo, llamar } from './supabase.js';
import { crearAlmacen } from './almacen.js';

// La tabla de posiciones de cada plantel. Las ligas la publican como imagen o
// dentro de una app, así que el encargado la copia acá después de cada fecha:
// pega el texto (una línea por equipo) y la app lo ordena (migración 0026).

const NUMEROS = ['pj', 'pg', 'pe', 'pp', 'gf', 'gc', 'pts'];

const desdeFila = (t) => ({
  equipoId: t.equipo_id, equipo: t.equipo, grupo: t.grupo ?? '', torneo: t.torneo ?? '', fuente: t.fuente ?? '',
  actualizadaEn: t.actualizada_en, puedoEditar: !!t.puedo_editar,
  conectada: !!t.conectada, deporstarTabla: t.deporstar_tabla ?? null, revisadaEn: t.revisada_en ?? null,
  filas: (t.filas ?? []).map((f) => ({ ...f, esJara: !!f.es_jara })),
});

const base = {
  cargar: async () => (await llamar('tablas_posiciones')).map(desdeFila),
  // grupo: el nombre de la pestaña ('' si el plantel tiene una sola tabla, 0036).
  // grupoAntes: si se está renombrando la pestaña.
  guardar: (equipoId, torneo, filas, fuente, grupo = '', grupoAntes = null) => llamar('tabla_guardar', {
    p_equipo: equipoId, p_torneo: torneo || null, p_fuente: fuente || null,
    p_filas: filas.map(({ esJara, ...f }) => ({ ...f, es_jara: esJara })),
    p_grupo: grupo, p_grupo_antes: grupoAntes,
  }),
  borrar: (equipoId, grupo) => llamar('tabla_borrar', { p_equipo: equipoId, p_grupo: grupo }),
  // Traer la tabla desde la liga (0032). Sin forzar, la base decide si ya toca.
  refrescar: (equipoId, forzar = false, grupo = '') => llamar('tabla_refrescar', { p_equipo: equipoId, p_forzar: forzar, p_grupo: grupo }),
  conectar: (equipoId, numero, grupo = '') => llamar('tabla_conectar', { p_equipo: equipoId, p_deporstar: numero ?? null, p_grupo: grupo }),
};

// --- Modo demostración: equipos inventados, en memoria --------------------
const f = (equipo, pj, pg, pe, pp, gf, gc, esJara = false) => ({ equipo, pj, pg, pe, pp, gf, gc, pts: pg * 3 + pe, esJara });
let demo = [
  { equipoId: 'e-jueves', equipo: 'Senior Jueves', grupo: 'Grupo A', torneo: 'Liga de ejemplo · 1ª Fase', fuente: '', actualizadaEn: new Date().toISOString(), puedoEditar: true,
    filas: [f('Rival Uno de Ejemplo', 7, 5, 1, 1, 18, 7), f('Hugo Jara', 7, 4, 2, 1, 15, 9, true), f('Rival Dos de Ejemplo', 7, 3, 2, 2, 11, 10),
            f('Rival Tres de Ejemplo', 7, 2, 1, 4, 9, 14), f('Rival Cuatro de Ejemplo', 7, 0, 2, 5, 5, 18)] },
  { equipoId: 'e-jueves', equipo: 'Senior Jueves', grupo: 'General', torneo: 'Liga de ejemplo · 1ª Fase', fuente: '', actualizadaEn: new Date().toISOString(), puedoEditar: true,
    filas: [f('Rival Seis de Ejemplo', 7, 6, 0, 1, 20, 6), f('Rival Uno de Ejemplo', 7, 5, 1, 1, 18, 7), f('Hugo Jara', 7, 4, 2, 1, 15, 9, true),
            f('Rival Dos de Ejemplo', 7, 3, 2, 2, 11, 10), f('Rival Siete de Ejemplo', 7, 3, 0, 4, 10, 12), f('Rival Tres de Ejemplo', 7, 2, 1, 4, 9, 14),
            f('Rival Cuatro de Ejemplo', 7, 0, 2, 5, 5, 18)] },
  { equipoId: 'e-sabado', equipo: 'Senior Sábado', grupo: '', torneo: 'Liga de ejemplo', fuente: '', actualizadaEn: new Date().toISOString(), puedoEditar: true, conectada: true, deporstarTabla: 71290, revisadaEn: new Date().toISOString(),
    filas: [f('Hugo Jara', 9, 6, 2, 1, 20, 8, true), f('Rival Cinco de Ejemplo', 9, 6, 1, 2, 19, 11), f('Rival Seis de Ejemplo', 9, 4, 3, 2, 14, 12),
            f('Rival Siete de Ejemplo', 9, 2, 2, 5, 10, 17), f('Rival Ocho de Ejemplo', 9, 1, 2, 6, 7, 22)] },
  { equipoId: 'e-junior', equipo: 'Junior Sábado', grupo: '', torneo: '', fuente: '', actualizadaEn: null, puedoEditar: true, filas: [] },
];
const es = (equipoId, grupo) => (t) => t.equipoId === equipoId && t.grupo === grupo;
const enDemo = {
  cargar: async () => demo,
  guardar: async (equipoId, torneo, filas, fuente, grupo = '', grupoAntes = null) => {
    const antes = grupoAntes ?? grupo;
    if (antes !== grupo && demo.some(es(equipoId, grupo))) throw new Error(`Ya hay una tabla que se llama "${grupo}"`);
    const cambio = { torneo, fuente, filas, grupo, actualizadaEn: new Date().toISOString() };
    if (demo.some(es(equipoId, antes))) demo = demo.map((t) => (es(equipoId, antes)(t) ? { ...t, ...cambio } : t));
    else {
      const modelo = demo.find((t) => t.equipoId === equipoId);
      const vacia = !modelo.filas.length && !modelo.conectada;
      if (vacia) demo = demo.map((t) => (t === modelo ? { ...t, ...cambio } : t));
      else {
        const despues = demo.findLastIndex((t) => t.equipoId === equipoId) + 1;
        demo = [...demo.slice(0, despues), { ...modelo, ...cambio, conectada: false, deporstarTabla: null }, ...demo.slice(despues)];
      }
    }
  },
  borrar: async (equipoId, grupo) => {
    const quedan = demo.filter((t) => !es(equipoId, grupo)(t));
    demo = quedan.some((t) => t.equipoId === equipoId) ? quedan
      : demo.map((t) => (es(equipoId, grupo)(t) ? { ...t, grupo: '', filas: [], torneo: '', fuente: '', actualizadaEn: null, conectada: false, deporstarTabla: null } : t));
  },
  refrescar: async (equipoId, forzar, grupo = '') => {
    if (forzar) demo = demo.map((t) => (es(equipoId, grupo)(t) ? { ...t, revisadaEn: new Date().toISOString() } : t));
    return false;
  },
  conectar: async (equipoId, numero, grupo = '') => {
    demo = demo.map((t) => (es(equipoId, grupo)(t) ? { ...t, deporstarTabla: numero ?? null, conectada: !!numero } : t));
  },
};

const origen = esDemo ? enDemo : base;
const almacen = crearAlmacen(origen.cargar);

export function useTablas() {
  const { cargando, error, datos } = almacen.usar();
  return {
    cargando, error, tablas: datos ?? [], recargar: almacen.recargar,
    guardar: async (...a) => { await origen.guardar(...a); await almacen.recargar(); },
    borrar: async (...a) => { await origen.borrar(...a); await almacen.recargar(); },
    conectar: async (...a) => { await origen.conectar(...a); await almacen.recargar(); },
    // Devuelve true si la tabla cambió.
    refrescar: async (equipoId, forzar, grupo) => {
      const cambio = await origen.refrescar(equipoId, forzar, grupo);
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

