import { useSyncExternalStore } from 'react';
import { esDemo } from './supabase.js';

// Tres tipos de publicación, los mismos que hoy circulan por WhatsApp:
//   boletin     "El Jara Informa": una edición con varias notas y fotos
//   entrevista  "Cortita y al pie": ficha del jugador y preguntas por sección
//   aviso       un anuncio con fecha límite (pagos, asambleas, promociones)
export const TIPOS = {
  boletin: 'Boletín',
  entrevista: 'Cortita y al pie',
  aviso: 'Aviso',
};

// Plantilla de "Cortita y al pie": las preguntas que Comunicaciones ya usa.
export const PLANTILLA_ENTREVISTA = {
  ficha: ['Serie', 'Posición', 'Pie hábil', 'Altura'],
  secciones: [
    {
      titulo: 'Hablemos de fútbol',
      preguntas: [
        '¿De qué club eres hincha?',
        '¿Quién es tu partner del equipo?',
        '¿Cuál es el mejor partido que has jugado?',
        '¿Cuál es el mejor triunfo colectivo con el Jara?',
        '¿Qué referente tienes en tu posición?',
      ],
    },
    {
      titulo: 'Fuera de cancha',
      preguntas: [
        '¿Qué canción para la pista de baile?',
        '¿Qué canción como placer culpable?',
        '¿Cuál es tu película favorita?',
        '¿Cuál es tu serie favorita?',
        '¿Quién es tu ídolo de infancia?',
        '¿Algún consejo importante que recibiste?',
      ],
    },
  ],
};

// Contenido de ejemplo para el modo demostración (sin nombres ni datos reales).
const EJEMPLOS = [
  {
    id: 'aviso-fiesta',
    tipo: 'aviso',
    fecha: '1 de octubre',
    titulo: 'Fiesta de los 20 años: paga tu entrada',
    bajada: '21 de noviembre, 20:00 horas. Asado, barra libre y sorpresas.',
    vence: 'Hasta el 5 de octubre',
    texto: 'La entrada cuesta $20.000 e incluye música, barra libre y asado. Los datos de transferencia se los pides a tu tesorero.',
    fotos: [{ demo: 1 }],
  },
  {
    id: 'boletin-2',
    tipo: 'boletin',
    fecha: '28 de septiembre',
    titulo: 'El Jara Informa N°2',
    bajada: 'Primera asamblea general, entrenamientos más baratos y la fiesta de los 20 años.',
    notas: [
      {
        titulo: 'Más de 40 socios en la primera asamblea general',
        texto: 'Nos conectamos más de 40 socios. Cada ministerio presentó su trabajo y los hitos que quedan para el año.',
        fotos: [{ demo: 0, pie: 'Asamblea general' }, { demo: 2 }, { demo: 3 }],
      },
      {
        titulo: 'Bajan los precios de los entrenamientos',
        texto: 'Por demanda popular, desde este lunes los junior pagan $2.000 y los senior $4.000.',
        fotos: [{ demo: 1 }, { demo: 0 }],
      },
      {
        titulo: 'Se viene la fiesta',
        texto: 'El 21 de noviembre celebramos los 20 años del Jara con jugadores y ex jugadores.',
        fotos: [{ demo: 3 }],
      },
    ],
  },
  {
    id: 'cortita-2',
    tipo: 'entrevista',
    fecha: '20 de septiembre',
    titulo: 'Cortita y al pie: Jugador de ejemplo',
    bajada: 'Arquero del Junior y del Senior Jueves.',
    fotos: [{ demo: 2 }, { demo: 0 }],
    ficha: [['Serie', 'Junior y Jueves'], ['Posición', 'Arquero'], ['Pie hábil', 'Derecho'], ['Altura', '1,80']],
    secciones: [
      {
        titulo: 'Hablemos de fútbol',
        preguntas: [
          ['¿De qué club eres hincha?', 'Respuesta de ejemplo'],
          ['¿Cuál es el mejor partido que has jugado?', 'Uno que terminó 4-0, con un penal tapado.'],
          ['¿Qué referente tienes en tu posición?', 'Respuesta de ejemplo'],
        ],
      },
      {
        titulo: 'Fuera de cancha',
        preguntas: [
          ['¿Cuál es tu película favorita?', 'Respuesta de ejemplo'],
          ['¿Algún consejo importante que recibiste?', 'Siempre sé tú, en cualquier parte.'],
        ],
      },
    ],
  },
];

// Almacén en memoria para la demostración: lo publicado dura hasta recargar.
let lista = esDemo ? EJEMPLOS : [];
const oyentes = new Set();
const suscribir = (f) => { oyentes.add(f); return () => oyentes.delete(f); };
const leer = () => lista;

export function useNoticias() {
  const publicaciones = useSyncExternalStore(suscribir, leer);
  const publicar = (p) => {
    const nueva = { ...p, id: `nueva-${Date.now()}`, fecha: 'Hoy' };
    lista = [nueva, ...lista];
    oyentes.forEach((f) => f());
    return nueva.id;
  };
  // Con la base conectada esto se leerá del área de la persona (Comunicaciones).
  return { publicaciones, publicar, puedePublicar: esDemo };
}

// Fotos de una publicación, sea cual sea su tipo, para portadas y carruseles.
export function portada(p) {
  if (p.fotos?.length) return p.fotos[0];
  const conFoto = p.notas?.find((n) => n.fotos?.length);
  return conFoto ? conFoto.fotos[0] : null;
}

export function siguienteNumeroBoletin(publicaciones) {
  const numeros = publicaciones
    .filter((p) => p.tipo === 'boletin')
    .map((p) => Number(/N°\s*(\d+)/.exec(p.titulo)?.[1] ?? 0));
  return Math.max(0, ...numeros) + 1;
}
