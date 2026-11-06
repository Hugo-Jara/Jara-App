import { esDemo, llamar } from './supabase.js';
import { crearAlmacen } from './almacen.js';
import { hoyIso, correrDias } from './fechas.js';

// Las fechas de la liga de cada plantel: todos los partidos del campeonato
// (no solo los del Jara), los que vienen y los ya jugados. Los sábados vienen
// de Deporstar, igual que la tabla. Mientras la base no las tenga, la sección
// dice que todavía no están conectadas.

const desdeFila = (p) => ({
  id: p.id, equipoId: p.equipo_id, equipo: p.equipo, fecha: p.fecha ?? '', dia: p.dia, hora: p.hora ?? '',
  cancha: p.cancha ?? '', local: p.local, visita: p.visita,
  golesLocal: p.goles_local ?? null, golesVisita: p.goles_visita ?? null,
  esJara: !!p.es_jara,
});

const base = {
  cargar: async () => {
    try { return (await llamar('liga_fechas')).map(desdeFila); }
    catch (e) {
      // Antes de la migración la función no existe: la sección queda vacía, sin error.
      if (/liga_fechas|does not exist|Could not find/i.test(e.message)) return null;
      throw e;
    }
  },
};

// --- Modo demostración: equipos inventados --------------------------------
const hoy = hoyIso();
// El sábado de esta semana (o hoy, si es sábado) y los anteriores.
const sabado = correrDias(hoy, (6 - new Date(`${hoy}T12:00:00`).getDay() + 7) % 7);
const p = (equipoId, fecha, semanas, hora, cancha, local, visita, gl = null, gv = null) => ({
  id: `${equipoId}-${fecha}-${local}`, equipoId, equipo: equipoId === 'e-sabado' ? 'Senior Sábado' : 'Junior Sábado',
  fecha, dia: correrDias(sabado, semanas * 7), hora, cancha, local, visita, golesLocal: gl, golesVisita: gv,
  esJara: /jara/i.test(local + visita),
});
const demo = [
  p('e-sabado', 'Fecha 5', -2, '08:45', 'Cancha 2', 'Hugo Jara', 'Rival Cinco de Ejemplo', 2, 1),
  p('e-sabado', 'Fecha 5', -2, '10:30', 'Cancha 4', 'Rival Seis de Ejemplo', 'Rival Siete de Ejemplo', 0, 0),
  p('e-sabado', 'Fecha 5', -2, '12:15', 'Cancha 1', 'Rival Ocho de Ejemplo', 'Rival Nueve de Ejemplo', 3, 2),
  p('e-sabado', 'Fecha 6', -1, '08:45', 'Cancha 6', 'Rival Siete de Ejemplo', 'Rival Cinco de Ejemplo', 1, 3),
  p('e-sabado', 'Fecha 6', -1, '10:30', 'Cancha 3', 'Rival Nueve de Ejemplo', 'Rival Seis de Ejemplo', 2, 2),
  p('e-sabado', 'Fecha 6', -1, '12:15', 'Cancha 6', 'Rival Ocho de Ejemplo', 'Hugo Jara', 1, 2),
  p('e-sabado', 'Fecha 7', 0, '08:45', 'Cancha 4', 'Rival Cinco de Ejemplo', 'Rival Ocho de Ejemplo'),
  p('e-sabado', 'Fecha 7', 0, '10:30', 'Cancha 5', 'Rival Seis de Ejemplo', 'Hugo Jara'),
  p('e-sabado', 'Fecha 7', 0, '12:15', 'Cancha 1', 'Rival Siete de Ejemplo', 'Rival Nueve de Ejemplo'),
  p('e-sabado', 'Fecha 8', 1, '10:30', 'Cancha 2', 'Hugo Jara', 'Rival Siete de Ejemplo'),
  p('e-sabado', 'Fecha 8', 1, '12:15', 'Cancha 3', 'Rival Nueve de Ejemplo', 'Rival Cinco de Ejemplo'),
  p('e-junior', 'Fecha 7', -1, '10:30', 'Cancha 2', 'Rival Uno de Ejemplo', 'Rival Dos de Ejemplo', 2, 0),
  p('e-junior', 'Fecha 7', -1, '12:15', 'Cancha 5', 'Rival Tres de Ejemplo', 'Hugo Jara', 0, 5),
  p('e-junior', 'Fecha 8', 0, '12:15', 'Cancha 6', 'Hugo Jara', 'Rival Cuatro de Ejemplo'),
  p('e-junior', 'Fecha 8', 0, '14:00', 'Cancha 1', 'Rival Uno de Ejemplo', 'Rival Tres de Ejemplo'),
];

const almacen = crearAlmacen(esDemo ? async () => demo : base.cargar);

// conectadas: false si la base todavía no tiene las fechas de la liga.
export function useFechasLiga() {
  const { cargando, error, datos } = almacen.usar();
  return { cargando, error, conectadas: datos !== null, partidos: datos ?? [], recargar: almacen.recargar };
}

export const jugado = (p) => p.golesLocal !== null && p.golesVisita !== null;

// Agrupa por fecha del campeonato ("Fecha 7"), en orden de día. Dentro de cada
// fecha, por hora.
export function porFecha(partidos) {
  const grupos = new Map();
  [...partidos].sort((a, b) => a.dia.localeCompare(b.dia) || a.hora.localeCompare(b.hora)).forEach((x) => {
    const clave = x.fecha || x.dia;
    if (!grupos.has(clave)) grupos.set(clave, { fecha: x.fecha, dia: x.dia, partidos: [] });
    grupos.get(clave).partidos.push(x);
  });
  return [...grupos.values()];
}

// Próximas: las fechas con algún partido sin resultado desde hoy. Jugadas: el
// resto, la más reciente primero.
export function separar(partidos, hoy = hoyIso()) {
  const fechas = porFecha(partidos);
  const pendiente = (f) => f.partidos.some((x) => !jugado(x) && x.dia >= hoy);
  return {
    proximas: fechas.filter(pendiente),
    jugadas: fechas.filter((f) => !pendiente(f)).reverse(),
  };
}
