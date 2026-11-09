import { esDemo, llamar } from './supabase.js';
import { crearAlmacen } from './almacen.js';
import { correrDias, hoyIso } from './fechas.js';

// Fotos de cada partido (migración 0041). La base revisa el Drive del
// fotógrafo de la liga, guarda la lista de fotos de cada carpeta del club y
// enlaza sola las seguras. Las fotos se ven desde el Drive: no se copian.

const enlaceDesdeFila = (f) => ({
  partidoId: f.partido_id, carpetaId: f.carpeta_id, carpetaNombre: f.carpeta_nombre,
  fotos: f.fotos ?? null, automatico: !!f.automatico, puedoCambiar: !!f.puedo_cambiar,
});
const carpetaDesdeFila = (f) => ({
  id: f.carpeta_id, nombre: f.nombre, ruta: f.ruta ?? [], rival: f.rival, categoria: f.categoria,
  dia: f.dia, creada: f.creada, fotos: f.fotos, partidoId: f.partido_id, automatico: !!f.automatico,
});
const fotoDesdeFila = (f) => ({ id: f.archivo_id, nombre: f.nombre, tomada: f.tomada, ancho: f.ancho, alto: f.alto });

const base = {
  cargar: async () => (await llamar('fotos_enlaces')).map(enlaceDesdeFila),
  revisar: (forzar) => llamar('fotos_revisar', { p_forzar: !!forzar }),
  carpetas: async () => (await llamar('fotos_carpetas_ver')).map(carpetaDesdeFila),
  fotosDePartido: async (id) => (await llamar('fotos_de_partido', { p_partido: id })).map(fotoDesdeFila),
  enlazar: (partidoId, carpetaId, nombre) => llamar('fotos_enlazar', { p_partido: partidoId, p_carpeta: carpetaId, p_nombre: nombre ?? null }),
  desenlazar: (partidoId) => llamar('fotos_desenlazar', { p_partido: partidoId }),
};

// --- Modo demostración: carpetas inventadas que calzan con los partidos de ejemplo.
const hace = (n) => correrDias(hoyIso(), -n);
let demoCarpetas = [
  { id: 'demoCarpetaSenior01', nombre: 'Otro Rival Jugado Sr vs Club Sr', ruta: ['Senior Clausura', 'Fecha 2'], rival: 'Otro Rival Jugado', categoria: 'sr', dia: hace(7), fotos: 14 },
  { id: 'demoCarpetaJunior01', nombre: 'Club Jr vs Rival Junior de Ejemplo', ruta: ['Junior Clausura', 'Fecha 2'], rival: 'Rival Junior de Ejemplo', categoria: 'jr', dia: hace(7), fotos: 9 },
  { id: 'demoCarpetaJunior00', nombre: 'Rival Antiguo vs Club Jr', ruta: ['Junior Clausura', 'Fecha 1'], rival: 'Rival Antiguo', categoria: 'jr', dia: hace(14), fotos: 6 },
  { id: 'demoCarpetaApertura1', nombre: 'Rival de Abril vs Club Sr', ruta: ['APERTURA 2026', 'Fecha 4'], rival: 'Rival de Abril', categoria: 'sr', dia: '2026-04-25', fotos: 10 },
  { id: 'demoCarpetaApertura2', nombre: 'Club Jr vs Rival de Mayo', ruta: ['APERTURA 2026', 'Fecha 6'], rival: 'Rival de Mayo', categoria: 'jr', dia: '2026-05-16', fotos: 12 },
];
let demoEnlaces = [{ partidoId: 'p4', carpetaId: 'demoCarpetaSenior01', automatico: true }];
let demoRevisada = new Date().toISOString();
const demoEnlace = (e) => {
  const c = demoCarpetas.find((k) => k.id === e.carpetaId);
  return { ...e, carpetaNombre: c?.nombre ?? 'Carpeta del Drive', fotos: c?.fotos ?? null, puedoCambiar: true };
};
const enDemo = {
  cargar: async () => demoEnlaces.map(demoEnlace),
  revisar: async () => {
    await new Promise((r) => setTimeout(r, 300));
    demoRevisada = new Date().toISOString();
    return { pendientes: 0, enlazadas: 0, error: null, revisada_en: demoRevisada };
  },
  carpetas: async () => demoCarpetas.map((c) => {
    const e = demoEnlaces.find((x) => x.carpetaId === c.id);
    return { ...c, partidoId: e?.partidoId ?? null, automatico: !!e?.automatico };
  }),
  fotosDePartido: async (id) => {
    const e = demoEnlaces.find((x) => x.partidoId === id);
    const c = demoCarpetas.find((k) => k.id === e?.carpetaId);
    return Array.from({ length: c?.fotos ?? 0 }, (_, i) => ({ id: `demo-${i}`, nombre: `Foto ${i + 1}`, ancho: 1600, alto: 1067 }));
  },
  enlazar: async (partidoId, carpetaId, nombre) => {
    if (demoEnlaces.some((e) => e.carpetaId === carpetaId && e.partidoId !== partidoId)) throw new Error('Esa carpeta ya está enlazada a otro partido');
    if (!demoCarpetas.some((c) => c.id === carpetaId)) demoCarpetas = [...demoCarpetas, { id: carpetaId, nombre: nombre || 'Carpeta del Drive', ruta: [], fotos: 5 }];
    demoEnlaces = [...demoEnlaces.filter((e) => e.partidoId !== partidoId), { partidoId, carpetaId, automatico: false }];
  },
  desenlazar: async (partidoId) => { demoEnlaces = demoEnlaces.filter((e) => e.partidoId !== partidoId); },
};

const origen = esDemo ? enDemo : base;
const almacen = crearAlmacen(origen.cargar);

// Da la vuelta completa por el Drive: la base avanza de a pocas carpetas por
// llamada, así que se repite mientras queden pendientes.
export async function revisarDrive(forzar = false, alAvanzar) {
  let r, veces = 0, enlazadas = 0;
  do {
    r = await origen.revisar(forzar && veces === 0);
    veces++;
    enlazadas += r?.enlazadas ?? 0;
    alAvanzar?.({ ...r, veces });
  } while (r?.pendientes > 0 && !r.error && veces < 25);
  return { sinLlave: !!r?.sin_llave, error: r?.error ?? null, revisadaEn: r?.revisada_en ?? null, enlazadas, pendientes: r?.pendientes ?? 0 };
}

// Al abrir un partido o la pantalla de fotos se le pide a la base que mire si
// hay fotos nuevas (ella decide si toca: cada 6 horas). Una vez por pestaña
// cada 10 minutos, en silencio.
let ultimaVuelta = 0;
async function vueltaEnSilencio() {
  if (Date.now() - ultimaVuelta < 10 * 60 * 1000) return;
  ultimaVuelta = Date.now();
  try {
    const r = await revisarDrive(false);
    if (r.enlazadas > 0) await almacen.recargar();
  } catch { /* sin señal o sin permiso: no molesta, se intenta otra vez después */ }
}

export function useEnlacesFotos() {
  const { cargando, error, datos } = almacen.usar();
  const y = (accion) => async (...a) => { await accion(...a); await almacen.recargar(); };
  const enlaces = datos ?? [];
  return {
    cargando, error, enlaces, recargar: almacen.recargar,
    dePartido: (id) => enlaces.find((e) => e.partidoId === id) ?? null,
    enlazar: y(async (...a) => { await origen.enlazar(...a); await revisarDrive(false).catch(() => {}); }),
    desenlazar: y(origen.desenlazar),
    vueltaEnSilencio,
  };
}

export const carpetasDelDrive = () => origen.carpetas();
export const fotosDePartido = (id) => origen.fotosDePartido(id);
