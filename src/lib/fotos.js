import { esDemo, llamar } from './supabase.js';
import { crearAlmacen } from './almacen.js';
import { correrDias, hoyIso } from './fechas.js';
import { buscarCarpetasDelClub } from './fotosDrive.js';

// Qué carpeta del Drive tiene las fotos de cada partido (migración 0031).
// La base guarda solo el enlace; las fotos se ven desde el Drive.

// Llave de Google para leer carpetas públicas del Drive. Va en el navegador
// (como la de Supabase): se limita en Google Cloud a esta página y a la Drive API.
export const LLAVE_GOOGLE = import.meta.env.VITE_GOOGLE_API_KEY || '';

const desdeFila = (f) => ({
  partidoId: f.partido_id, carpetaId: f.carpeta_id, carpetaNombre: f.carpeta_nombre, puedoCambiar: !!f.puedo_cambiar,
});

const base = {
  cargar: async () => (await llamar('fotos_enlaces')).map(desdeFila),
  enlazar: (partidoId, carpetaId, nombre) => llamar('fotos_enlazar', { p_partido: partidoId, p_carpeta: carpetaId, p_nombre: nombre ?? null }),
  desenlazar: (partidoId) => llamar('fotos_desenlazar', { p_partido: partidoId }),
  buscar: (raiz, alAvanzar) => {
    if (!LLAVE_GOOGLE) throw new Error('Falta la llave de Google para leer el Drive. Mientras, pega el link de la carpeta en cada partido.');
    return buscarCarpetasDelClub(raiz, LLAVE_GOOGLE, { alAvanzar });
  },
};

// --- Modo demostración: carpetas inventadas que calzan con los partidos de ejemplo.
let demo = [];
const enDemo = {
  cargar: async () => demo,
  enlazar: async (partidoId, carpetaId, nombre) => {
    if (demo.some((e) => e.carpetaId === carpetaId && e.partidoId !== partidoId)) throw new Error('Esa carpeta ya está enlazada a otro partido');
    demo = [...demo.filter((e) => e.partidoId !== partidoId), { partidoId, carpetaId, carpetaNombre: nombre ?? null, puedoCambiar: true }];
  },
  desenlazar: async (partidoId) => { demo = demo.filter((e) => e.partidoId !== partidoId); },
  buscar: async (_raiz, alAvanzar) => {
    await new Promise((r) => setTimeout(r, 400));
    alAvanzar?.({ revisadas: 6, encontradas: 3 });
    const hace7 = correrDias(hoyIso(), -7);
    return [
      { id: 'demoCarpetaSenior01', nombre: 'Otro Rival Jugado Sr vs Club Sr', ruta: ['Senior Clausura', 'Fecha 2'], rival: 'Otro Rival Jugado', categoria: 'sr', dia: hace7, fotos: 84 },
      { id: 'demoCarpetaJunior01', nombre: 'Club Jr vs Rival Junior de Ejemplo', ruta: ['Junior Clausura', 'Fecha 2'], rival: 'Rival Junior de Ejemplo', categoria: 'jr', dia: hace7, fotos: 120 },
      { id: 'demoCarpetaJunior00', nombre: 'Rival Antiguo vs Club Jr', ruta: ['Junior Clausura', 'Fecha 1'], rival: 'Rival Antiguo', categoria: 'jr', dia: correrDias(hoyIso(), -14), fotos: 97 },
    ];
  },
};

const origen = esDemo ? enDemo : base;
const almacen = crearAlmacen(origen.cargar);
export const vaciarFotos = almacen.vaciar;
// En demostración se puede recorrer la búsqueda sin llave.
export const puedeBuscar = esDemo || !!LLAVE_GOOGLE;

export function useEnlacesFotos() {
  const { cargando, error, datos } = almacen.usar();
  const y = (accion) => async (...a) => { await accion(...a); await almacen.recargar(); };
  const enlaces = datos ?? [];
  return {
    cargando, error, enlaces, recargar: almacen.recargar,
    dePartido: (id) => enlaces.find((e) => e.partidoId === id) ?? null,
    enlazar: y(origen.enlazar),
    desenlazar: y(origen.desenlazar),
  };
}

export const buscarCarpetas = (raiz, alAvanzar) => origen.buscar(raiz, alAvanzar);
