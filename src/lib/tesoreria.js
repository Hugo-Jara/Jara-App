import { correrDias, hoyIso } from './fechas.js';

// Tesorería · PROTOTIPO. Todos los datos de este archivo son inventados y nada
// se guarda: sirve para que los tesoreros vean cómo sería su tablero y digan qué
// les falta. Cuando se conecten los datos reales, este archivo se reemplaza por
// llamadas a la base (con permisos: cada tesorero ve solo su plantel).

// Cuánto de la cuota le corresponde pagar a cada condición.
const FACTOR = { ok: 1, beca: 0.5, sin: 0 };
export const NOMBRE_CONDICION = { ok: 'Cuota completa', beca: 'Media cuota', sin: 'Sin cuota' };

const hace = (dias) => correrDias(hoyIso(), -dias);

const jugadores = (cuota, filas) => filas.map(([nombre, condicion, pagado]) => ({
  nombre, condicion, pagado: pagado === 'todo' ? cuota * FACTOR[condicion] : pagado,
}));

const CUOTA_JUEVES = 10000;
const CUOTA_SABADO = 12000;
const CUOTA_JUNIOR = 8000;

const PLANTELES = [
  {
    id: 'e-jueves', nombre: 'Senior Jueves', cuota: CUOTA_JUEVES,
    jugadores: jugadores(CUOTA_JUEVES, [
      ['Chuta', 'ok', 'todo'], ['Pelao', 'ok', 'todo'], ['Gordo', 'ok', 0], ['Flaco', 'beca', 'todo'],
      ['Cabezón', 'ok', 'todo'], ['Turco', 'ok', 5000], ['Conejo', 'ok', 'todo'], ['Tigre', 'sin', 0],
    ]),
    movimientos: [
      { id: 1, fecha: hace(2), tipo: 'ingreso', categoria: 'Cuotas', descripcion: 'Cuotas de la semana', monto: 45000 },
      { id: 2, fecha: hace(6), tipo: 'gasto', categoria: 'Implementos', descripcion: 'Balones nuevos', monto: 32000 },
      { id: 3, fecha: hace(12), tipo: 'ingreso', categoria: 'Rifa', descripcion: 'Rifa del plantel', monto: 60000 },
    ],
  },
  {
    id: 'e-sabado', nombre: 'Senior Sábado', cuota: CUOTA_SABADO,
    jugadores: jugadores(CUOTA_SABADO, [
      ['Mono', 'ok', 'todo'], ['Pollo', 'ok', 'todo'], ['Rucio', 'ok', 0], ['Zurdo', 'ok', 'todo'],
      ['Negro', 'beca', 0], ['Chino', 'ok', 'todo'], ['Gato', 'ok', 6000], ['Pipe', 'ok', 'todo'],
      ['Beto', 'ok', 'todo'], ['Lalo', 'sin', 0],
    ]),
    movimientos: [
      { id: 1, fecha: hace(1), tipo: 'ingreso', categoria: 'Cuotas', descripcion: 'Cuotas del mes', monto: 78000 },
      { id: 2, fecha: hace(3), tipo: 'gasto', categoria: 'Arbitraje', descripcion: 'Pago de la fecha', monto: 24000 },
      { id: 3, fecha: hace(9), tipo: 'gasto', categoria: 'Implementos', descripcion: 'Petos', monto: 38000 },
      { id: 4, fecha: hace(15), tipo: 'ingreso', categoria: 'Aporte fiesta', descripcion: 'Aporte para la fiesta de aniversario', monto: 50000 },
    ],
  },
  {
    id: 'e-junior', nombre: 'Junior Sábado', cuota: CUOTA_JUNIOR,
    jugadores: jugadores(CUOTA_JUNIOR, [
      ['Dani', 'ok', 'todo'], ['Rafa', 'ok', 'todo'], ['Leo', 'ok', 'todo'], ['Fede', 'ok', 0],
      ['Koke', 'ok', 'todo'], ['Javi', 'beca', 'todo'], ['Mauro', 'ok', 0],
    ]),
    movimientos: [
      { id: 1, fecha: hace(2), tipo: 'ingreso', categoria: 'Cuotas', descripcion: 'Cuotas del mes', monto: 40000 },
      { id: 2, fecha: hace(8), tipo: 'gasto', categoria: 'Arbitraje', descripcion: 'Pago de la fecha', monto: 18000 },
    ],
  },
];

export const planteles = () => PLANTELES;

const suma = (lista, f) => lista.reduce((t, x) => t + f(x), 0);

// Lo que corresponde pagar a un jugador este mes, lo que debe y su estado.
export const estadoJugador = (plantel, j) => {
  const corresponde = plantel.cuota * FACTOR[j.condicion];
  const debe = Math.max(0, corresponde - j.pagado);
  return { ...j, corresponde, debe, alDia: corresponde > 0 && debe === 0, exento: corresponde === 0 };
};

// Los números de un plantel (o de varios juntos, para la vista de todo el club).
export function resumen(lista) {
  const estados = lista.flatMap((p) => p.jugadores.map((j) => estadoJugador(p, j)));
  const movs = lista.flatMap((p) => p.movimientos);
  const meta = suma(estados, (e) => e.corresponde);
  const recaudado = suma(estados, (e) => Math.min(e.pagado, e.corresponde));
  const ingresos = suma(movs.filter((m) => m.tipo === 'ingreso'), (m) => m.monto);
  const gastos = suma(movs.filter((m) => m.tipo === 'gasto'), (m) => m.monto);
  return {
    meta, recaudado, falta: Math.max(0, meta - recaudado),
    porcentaje: meta ? Math.round((recaudado / meta) * 100) : 0,
    ingresos, gastos, caja: ingresos - gastos,
    alDia: estados.filter((e) => e.alDia).length,
    deben: estados.filter((e) => e.debe > 0).length,
    exentos: estados.filter((e) => e.exento).length,
  };
}

export const movimientosDe = (lista) =>
  lista.flatMap((p) => p.movimientos.map((m) => ({ ...m, plantel: p.nombre, id: `${p.id}-${m.id}` })))
    .sort((a, b) => (a.fecha < b.fecha ? 1 : -1));

export const pesos = (n) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n);

export const mesActual = () =>
  new Date().toLocaleDateString('es-CL', { month: 'long', year: 'numeric' });
