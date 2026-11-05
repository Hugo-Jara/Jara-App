import { useCallback, useEffect, useState } from 'react';
import { esDemo, llamar } from './supabase.js';
import { correrDias, hoyIso } from './fechas.js';

// Lo que pasa después del partido (migración 0027): el jugador del partido
// (MVP), los comentarios en cadena y las reacciones con emoji.
//   · MVP: votan solo los que jugaron, no a sí mismos. Abre al anotar el
//     resultado y cierra a las 23:59 del sexto día después (0034). El conteo se ve al cerrar.
//   · Comentarios: todo el club; cada uno borra los suyos, y los moderan
//     Comunicaciones, el encargado del plantel y los administradores.

// La misma lista que acepta la base (emoji_valido).
export const EMOJIS = ['👏', '🔥', '⚽', '💪', '😂', '😮', '😢', '❤️'];
export const MAX_COMENTARIO = 500;

const desdeReacciones = (l) => (l ?? []).map((r) => ({ emoji: r.emoji, n: r.n, mia: !!r.mia }));
const desdeFila = (f) => ({
  mvp: {
    abierta: f.mvp.abierta, cerrada: f.mvp.cerrada, cierra: f.mvp.cierra,
    puedoVotar: f.mvp.puedo_votar, jugue: f.mvp.jugue, miVoto: f.mvp.mi_voto ?? null, votaron: f.mvp.votaron,
    candidatos: f.mvp.candidatos.map((c) => ({ id: c.persona_id, nombre: c.nombre })),
    ganadores: f.mvp.ganadores.map((g) => ({ id: g.persona_id, nombre: g.nombre, votos: g.votos })),
  },
  reacciones: desdeReacciones(f.reacciones),
  puedoModerar: f.puedo_moderar,
  comentarios: f.comentarios.map((c) => ({
    id: c.id, padreId: c.padre_id, personaId: c.persona_id, nombre: c.nombre, texto: c.texto,
    borrado: c.borrado, creadoEn: c.creado_en, puedoBorrar: c.puedo_borrar, reacciones: desdeReacciones(c.reacciones),
  })),
});

const base = {
  cargar: async (partido) => desdeFila(await llamar('partido_charla', { p_partido: partido.id })),
  votar: (partido, _yo, elegido) => llamar('mvp_votar', { p_partido: partido.id, p_elegido: elegido }),
  comentar: (partido, _yo, texto, padre) => llamar('comentario_agregar', { p_partido: partido.id, p_texto: texto, p_padre: padre ?? null }),
  borrar: (_partido, _yo, id) => llamar('comentario_borrar', { p_comentario: id }),
  reaccionarPartido: (partido, _yo, emoji) => llamar('reaccionar_partido', { p_partido: partido.id, p_emoji: emoji }),
  reaccionarComentario: (_partido, _yo, id, emoji) => llamar('reaccionar_comentario', { p_comentario: id, p_emoji: emoji }),
  mvpConteo: async (equipoIds, anio) => (await llamar('mvp_conteo', {
    p_anio: anio ?? null, ...(equipoIds?.length ? { p_equipos: equipoIds } : {}),
  })) ?? {},
};

// --- Modo demostración: lo mismo, en memoria ------------------------------
const hace = (min) => new Date(Date.now() - min * 60000).toISOString();
const memoria = {
  p4: {
    votos: { 'd-Pancho': 'd-Lalo', 'd-Lalo': 'd-Pancho', demo: 'd-Lalo' },
    reacciones: [['d-Pancho', '🔥'], ['d-Lalo', '🔥'], ['demo', '👏'], ['d-Tito', '💪']],
    comentarios: [
      { id: 'c1', padreId: null, personaId: 'd-Tito', nombre: 'Tito', texto: '¡Gran partido muchachos! Ese segundo tiempo fue otra cosa.', creadoEn: hace(60 * 24 * 6), reacciones: [['d-Lalo', '👏'], ['demo', '👏']] },
      { id: 'c2', padreId: 'c1', personaId: 'd-Lalo', nombre: 'Lalo', texto: 'Vamos que se puede 💪', creadoEn: hace(60 * 24 * 6 - 30), reacciones: [] },
      { id: 'c3', padreId: null, personaId: 'd-Pancho', nombre: 'Pancho', texto: 'El asado estuvo mejor que el partido 😂', creadoEn: hace(60 * 24 * 5), reacciones: [['d-Tito', '😂']] },
    ],
  },
};
const de = (id) => (memoria[id] ??= { votos: {}, reacciones: [], comentarios: [] });
const contar = (pares, yo) => EMOJIS.map((emoji) => ({
  emoji, n: pares.filter(([, e]) => e === emoji).length, mia: pares.some(([p, e]) => p === yo && e === emoji),
})).filter((r) => r.n > 0).sort((a, b) => b.n - a.n);
const alternar = (pares, yo, emoji) => (pares.some(([p, e]) => p === yo && e === emoji)
  ? pares.filter(([p, e]) => !(p === yo && e === emoji)) : [...pares, [yo, emoji]]);
const ganadores = (votos, nombreDe) => {
  const n = {};
  Object.values(votos).forEach((id) => { n[id] = (n[id] ?? 0) + 1; });
  const max = Math.max(0, ...Object.values(n));
  return Object.entries(n).filter(([, v]) => v === max).map(([id, votos]) => ({ id, nombre: nombreDe(id), votos }));
};
const estado = (partido) => {
  const hay = partido.golesFavor != null;
  // Cierra a las 23:59 del sexto día después: sigue abierta si el partido fue hace seis días o menos.
  const abierta = hay && partido.fecha >= correrDias(hoyIso(), -6) && (partido.jugaron ?? []).length > 0;
  return { hay, abierta, cerrada: hay && !abierta && partido.fecha < correrDias(hoyIso(), -6) };
};

const enDemo = {
  cargar: async (partido, yo) => {
    const m = de(partido.id);
    const nombres = [...partido.plantel, ...partido.respuestas.map((r) => ({ id: r.personaId, nombre: r.nombre }))];
    const nombreDe = (id) => nombres.find((j) => j.id === id)?.nombre ?? '';
    const { abierta, cerrada } = estado(partido);
    const jugue = (partido.jugaron ?? []).includes(yo.id);
    return {
      mvp: {
        abierta, cerrada, cierra: null, puedoVotar: abierta && jugue, jugue,
        miVoto: m.votos[yo.id] ?? null, votaron: Object.keys(m.votos).length,
        candidatos: (partido.jugaron ?? []).map((id) => ({ id, nombre: nombreDe(id) })).sort((a, b) => a.nombre.localeCompare(b.nombre)),
        ganadores: cerrada ? ganadores(m.votos, nombreDe) : [],
      },
      reacciones: contar(m.reacciones, yo.id),
      puedoModerar: partido.puedoEditar,
      comentarios: m.comentarios.map((c) => ({
        ...c, puedoBorrar: !c.borrado && (c.personaId === yo.id || partido.puedoEditar),
        texto: c.borrado ? null : c.texto, reacciones: contar(c.reacciones, yo.id),
      })),
    };
  },
  votar: async (partido, yo, elegido) => {
    if (elegido === yo.id) throw new Error('No puedes votar por ti mismo');
    de(partido.id).votos[yo.id] = elegido;
  },
  comentar: async (partido, yo, texto, padre) => {
    const m = de(partido.id);
    const raiz = padre ? (m.comentarios.find((c) => c.id === padre)?.padreId ?? padre) : null;
    m.comentarios.push({ id: `c${Date.now()}`, padreId: raiz, personaId: yo.id, nombre: yo.nombre, texto: texto.trim(), creadoEn: new Date().toISOString(), reacciones: [] });
  },
  borrar: async (partido, _yo, id) => {
    const m = de(partido.id);
    m.comentarios = m.comentarios.map((c) => (c.id === id ? { ...c, borrado: true, reacciones: [] } : c));
  },
  reaccionarPartido: async (partido, yo, emoji) => { const m = de(partido.id); m.reacciones = alternar(m.reacciones, yo.id, emoji); },
  reaccionarComentario: async (partido, yo, id, emoji) => {
    const m = de(partido.id);
    m.comentarios = m.comentarios.map((c) => (c.id === id ? { ...c, reacciones: alternar(c.reacciones, yo.id, emoji) } : c));
  },
  mvpConteo: async () => {
    const n = {};
    Object.values(memoria).forEach((m) => {
      ganadores(m.votos, () => '').forEach((g) => { n[g.id] = (n[g.id] ?? 0) + 1; });
    });
    return n;
  },
};

const origen = esDemo ? enDemo : base;

export function useCharla(partido, yo) {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');
  const recargar = useCallback(async () => {
    try { setDatos(await origen.cargar(partido, yo)); setError(''); }
    catch (e) { setError(e.message); }
  }, [partido.id, partido.golesFavor, (partido.jugaron ?? []).join(), yo.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { recargar(); }, [recargar]);
  const y = (accion) => async (...a) => { await accion(partido, yo, ...a); await recargar(); };
  return {
    datos, error, recargar,
    votar: y(origen.votar),
    comentar: y(origen.comentar),
    borrar: y(origen.borrar),
    reaccionarPartido: y(origen.reaccionarPartido),
    reaccionarComentario: y(origen.reaccionarComentario),
  };
}

// {persona_id: veces que fue MVP}, con los filtros de la tabla del club.
export const conteoMvp = (equipoIds, anio) => origen.mvpConteo(equipoIds, anio);
