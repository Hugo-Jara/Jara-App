import { esDemo, llamar } from './supabase.js';
import { crearAlmacen } from './almacen.js';
import { hoyIso, correrDias } from './fechas.js';

// Historial de entrenamientos: quiénes fueron a cada uno de los que ya pasaron.
// Lo ve quien administra los entrenamientos. No trae montos ni pagos.

const sesion = (s) => ({
  id: s.id, fecha: s.fecha, horaInicio: s.hora_inicio, horaFin: s.hora_fin, lugar: s.lugar, cupo: s.cupo,
  asistentes: s.asistentes.map((a) => ({ personaId: a.persona_id, nombre: a.nombre, invitado: !!a.invitado, invitadoPor: a.invitado_por })),
  bajasTarde: s.bajas_tarde.map((b) => ({ personaId: b.persona_id, nombre: b.nombre })),
});

const base = async () => (await llamar('entrenamientos_historial')).sesiones.map(sesion);

// --- Modo demostración ------------------------------------------------------
const GENTE = ['Pancho Pérez', 'Lalo Soto', 'Tito Rojas', 'Nico Muñoz', 'Rorro Díaz', 'Mauro Vega', 'Chino Lagos',
  'Beto Fuentes', 'Coke Araya', 'Pipe Torres', 'Seba Reyes', 'Toño Castro', 'Juanjo Silva', 'Cristián Mora'];
const demo = async () => {
  const hoy = hoyIso();
  // Martes y jueves de las últimas semanas; cada uno con parte de la gente.
  return Array.from({ length: 16 }, (_, k) => {
    const fecha = correrDias(hoy, -(Math.floor(k / 2) * 7 + (k % 2 ? 5 : 2)));
    const fueron = GENTE.filter((_, j) => (j * 7 + k * 3) % 10 < 7 - (j % 4));
    return {
      id: `h${k}`, fecha, horaInicio: '20:00', horaFin: '22:00', lugar: 'Cancha de ejemplo', cupo: 22,
      asistentes: [
        ...fueron.map((nombre) => ({ personaId: `d-${GENTE.indexOf(nombre)}`, nombre, invitado: false, invitadoPor: null })),
        ...(k % 3 === 0 ? [{ personaId: null, nombre: 'Primo de Pancho', invitado: true, invitadoPor: 'Pancho Pérez' }] : []),
      ],
      bajasTarde: k % 4 === 1 ? [{ personaId: 'd-12', nombre: 'Juanjo Silva' }] : [],
    };
  });
};

const almacen = crearAlmacen(esDemo ? demo : base);

export function useHistorialEntrenamientos() {
  const { cargando, error, datos } = almacen.usar();
  return { cargando, error, recargar: almacen.recargar, sesiones: datos ?? [] };
}

// Los períodos para filtrar: desde qué fecha cuentan.
export const PERIODOS = [
  { id: 'mes', nombre: 'Último mes', desde: () => correrDias(hoyIso(), -30) },
  { id: 'tres', nombre: '3 meses', desde: () => correrDias(hoyIso(), -91) },
  { id: 'ano', nombre: 'Este año', desde: () => `${hoyIso().slice(0, 4)}-01-01` },
  { id: 'todo', nombre: 'Todo', desde: () => '' },
];

// Cuántas veces fue cada persona del club (sin invitados), de más a menos.
export function asistenciaPorPersona(sesiones) {
  const porId = new Map();
  for (const s of sesiones) {
    for (const a of s.asistentes) {
      if (a.invitado || !a.personaId) continue;
      const p = porId.get(a.personaId) ?? { personaId: a.personaId, nombre: a.nombre, veces: 0, ultima: s.fecha };
      p.veces += 1;
      if (s.fecha > p.ultima) p.ultima = s.fecha;
      porId.set(a.personaId, p);
    }
  }
  return [...porId.values()].sort((x, y) => y.veces - x.veces || x.nombre.localeCompare(y.nombre, 'es'));
}
