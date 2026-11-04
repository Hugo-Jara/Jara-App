import { useEffect, useState } from 'react';
import { esDemo, llamar } from './supabase.js';

// Apodos del club ({persona_id: apodo}, migración 0024). Se piden una vez y se
// comparten entre pantallas; al guardar el propio, se actualiza la copia.
let cache = esDemo ? {} : null;
let pedido = null;
const oyentes = new Set();
const avisar = () => oyentes.forEach((f) => f(cache));

export function useApodos() {
  const [apodos, setApodos] = useState(cache ?? {});
  useEffect(() => {
    oyentes.add(setApodos);
    if (!cache && !pedido) {
      pedido = llamar('apodos').then((a) => { cache = a ?? {}; avisar(); }).catch(() => { pedido = null; });
    }
    return () => oyentes.delete(setApodos);
  }, []);
  return apodos;
}

export async function leerMiApodo() {
  return esDemo ? (cache.demo ?? '') : ((await llamar('mi_apodo')) ?? '');
}

export async function guardarMiApodo(personaId, apodo) {
  const limpio = apodo.trim();
  if (!esDemo) await llamar('mi_apodo_guardar', { p_apodo: limpio });
  cache = { ...(cache ?? {}) };
  if (limpio) cache[personaId] = limpio; else delete cache[personaId];
  avisar();
}
