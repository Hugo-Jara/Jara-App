import { useSyncExternalStore } from 'react';
import { esDemo } from './supabase.js';

// Las listas que hoy se arman copiando y pegando en WhatsApp: quién va al
// partido (voy / duda / baja, con su comentario) y quién entrena (con cupos,
// precio por categoría y quién pagó). En modo demostración viven en memoria.

const PARTIDO_DEMO = {
  equipo: 'Senior Sábado',
  torneo: 'Liga de ejemplo · 2ª fecha Clausura',
  rival: 'Rival de ejemplo',
  fecha: 'Sábado 10 de octubre',
  citacion: '08:15',
  cancha: 'Cancha 1',
  tercerTiempo: 'Asado después del partido',
  // Todo el plantel, para saber quién falta por responder.
  plantel: ['Pancho', 'Lalo', 'Tito', 'Nico', 'Rorro', 'Chino', 'Beto', 'Mauro', 'Javi', 'Leo', 'Fede', 'Koke', 'Dani', 'Rafa', 'Seba'],
  respuestas: [
    { nombre: 'Pancho', estado: 'voy', asado: true, nota: 'llevo carne' },
    { nombre: 'Lalo', estado: 'voy', asado: true, nota: 'llevo bebidas' },
    { nombre: 'Tito', estado: 'voy', asado: false, nota: 'solo partido' },
    { nombre: 'Nico', estado: 'voy', asado: true },
    { nombre: 'Rorro', estado: 'voy', asado: true, nota: 'llevo pan' },
    { nombre: 'Chino', estado: 'voy', asado: false },
    { nombre: 'Beto', estado: 'voy', asado: true },
    { nombre: 'Mauro', estado: 'voy', asado: true, nota: 'llevo carbón' },
    { nombre: 'Javi', estado: 'duda', nota: 'intentando cambiar el turno' },
    { nombre: 'Leo', estado: 'baja', nota: 'turno' },
    { nombre: 'Fede', estado: 'baja', nota: 'fuera de Santiago' },
  ],
};

const ENTRENAMIENTO_DEMO = {
  fecha: 'Lunes 5 de octubre',
  hora: '20:00 a 22:00',
  lugar: 'Cancha de ejemplo',
  cupo: 22,
  precios: [['Junior', '$2.000'], ['Senior y Jueves', '$4.000'], ['Galleta', '$5.000']],
  multa: 'Si te bajas el mismo lunes se cobra una multa de $1.000.',
  inscritos: [
    { nombre: 'Pancho', pagado: true },
    { nombre: 'Lalo', pagado: true },
    { nombre: 'Tito', pagado: false },
    { nombre: 'Nico', pagado: true },
    { nombre: 'Rorro', pagado: false },
    { nombre: 'Invitado 1', pagado: true, galleta: true },
    { nombre: 'Mauro', pagado: false },
  ],
  deben: [{ nombre: 'Chino', de: 'entrenamiento del 28 de septiembre' }],
};

let estado = esDemo
  ? { partido: PARTIDO_DEMO, entrenamiento: ENTRENAMIENTO_DEMO }
  : { partido: null, entrenamiento: null };
const oyentes = new Set();
const suscribir = (f) => { oyentes.add(f); return () => oyentes.delete(f); };
const cambiar = (nuevo) => { estado = { ...estado, ...nuevo }; oyentes.forEach((f) => f()); };

export function useListas(yo) {
  const { partido, entrenamiento } = useSyncExternalStore(suscribir, () => estado);

  const miRespuesta = partido?.respuestas.find((r) => r.nombre === yo) ?? null;
  const responder = (respuesta) => {
    const otras = partido.respuestas.filter((r) => r.nombre !== yo);
    cambiar({ partido: { ...partido, respuestas: respuesta ? [...otras, { nombre: yo, ...respuesta }] : otras } });
  };

  const inscrito = entrenamiento?.inscritos.some((i) => i.nombre === yo) ?? false;
  const inscribirme = () =>
    cambiar({ entrenamiento: { ...entrenamiento, inscritos: [...entrenamiento.inscritos, { nombre: yo, pagado: false }] } });
  const bajarme = () =>
    cambiar({ entrenamiento: { ...entrenamiento, inscritos: entrenamiento.inscritos.filter((i) => i.nombre !== yo) } });

  return { partido, miRespuesta, responder, entrenamiento, inscrito, inscribirme, bajarme };
}

export const porEstado = (partido, e) => partido.respuestas.filter((r) => r.estado === e);

export const sinResponder = (partido) =>
  partido.plantel.filter((n) => !partido.respuestas.some((r) => r.nombre === n));

// Recordatorios para el grupo: no llevan la lista, llevan el link. La lista
// vive en la app; WhatsApp solo empuja a entrar.
export function recordatorioPartido(p, url) {
  const faltan = sinResponder(p);
  return (
    `⚽ ¿Ya confirmaste para el partido?\n` +
    `Hugo Jara vs ${p.rival} · ${p.fecha}, citación ${p.citacion}, ${p.cancha}.\n` +
    `Van ${porEstado(p, 'voy').length} y hay ${porEstado(p, 'duda').length} en duda.` +
    (faltan.length ? ` Faltan por responder: ${faltan.join(', ')}.` : ' Ya respondieron todos.') +
    `\nConfirma acá 👉 ${url}`
  );
}

export function recordatorioEntrenamiento(e, url) {
  const libres = e.cupo - e.inscritos.length;
  return (
    `⚽ ¿Entrenas este ${e.fecha.toLowerCase()}?\n` +
    `${e.hora} · ${e.lugar}. ` +
    (libres > 0 ? `Quedan ${libres} de ${e.cupo} cupos.` : 'La lista está completa.') +
    `\nInscríbete acá 👉 ${url}`
  );
}
