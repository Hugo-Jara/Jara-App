import { esDemo } from './supabase.js';
import { DEMO } from './demo.js';

// El último partido jugado. En modo demostración usa contenido de ejemplo; con
// la base conectada devuelve vacío hasta que exista el módulo de partidos.
export function useInicio() {
  if (esDemo) return DEMO;
  return { ultimoPartido: null };
}
