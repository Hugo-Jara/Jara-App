import { TABLERO_DEMO } from './tableroDemo.js';

// Tablero de tesoreros.
//
// FORMA DE LOS DATOS (la que tienen que respetar los datos reales de la Fase 5):
//
//   {
//     temporada: { nombre, meses: ['2026-03', …], mesActual: '2026-10' },
//     planteles: [{
//       id, nombre, cuotaMensual, aportePorJugador,
//       jugadores: [{ id, nombre, cuotas: [{ mes: '2026-03', pagado: true }, …] }],
//       otrosIngresosTemporada, otrosEgresosTemporada,   // sin cuotas ni aporte al club
//       entregasAlClub: [{ id, fecha, monto }],           // aporte ya entregado
//       movimientos: [{ id, fecha, tipo: 'ingreso'|'egreso', concepto, monto }],  // solo el mes actual
//     }],
//     entrenamiento: { nombre, ingresosTemporada: [{concepto, monto}], egresosTemporada: [{concepto, monto}] },
//   }
//
// Los números (saldo, por recaudar, quién debe qué) NO vienen en los datos: se
// calculan acá con funciones puras, para que cuadren siempre con la grilla.

const sumar = (xs, f = (x) => x) => xs.reduce((t, x) => t + f(x), 0);

// "debe 2 meses" / "al día"
export function estadoJugador(jugador, cuotaMensual, mesActual) {
  const vencidas = jugador.cuotas.filter((c) => c.mes <= mesActual);
  const debe = vencidas.filter((c) => !c.pagado).map((c) => c.mes);
  return {
    ...jugador,
    mesesDebe: debe,
    deuda: debe.length * cuotaMensual,
    alDia: debe.length === 0,
  };
}

export function calcularPlantel(p, mesActual) {
  const jugadores = p.jugadores.map((j) => estadoJugador(j, p.cuotaMensual, mesActual));
  const cobrado = sumar(jugadores, (j) => j.cuotas.filter((c) => c.mes <= mesActual && c.pagado).length * p.cuotaMensual);
  const porRecaudar = sumar(jugadores, (j) => j.deuda);
  const entregado = sumar(p.entregasAlClub, (e) => e.monto);
  const mesesCobrados = jugadores[0] ? jugadores[0].cuotas.filter((c) => c.mes <= mesActual).length : 0;
  const comprometido = jugadores.length * p.aportePorJugador * mesesCobrados;
  const ingresosTemporada = cobrado + p.otrosIngresosTemporada;
  const egresosTemporada = p.otrosEgresosTemporada + entregado;
  const delMes = (tipo) => sumar(p.movimientos.filter((m) => m.tipo === tipo), (m) => m.monto);
  return {
    id: p.id,
    nombre: p.nombre,
    cuotaMensual: p.cuotaMensual,
    jugadores,
    alDia: jugadores.filter((j) => j.alDia).length,
    cobrado,
    porRecaudar,
    ingresosTemporada,
    egresosTemporada,
    saldo: ingresosTemporada - egresosTemporada,
    ingresosMes: delMes('ingreso'),
    egresosMes: delMes('egreso'),
    movimientos: p.movimientos,
    aporte: { comprometido, entregado, pendiente: Math.max(0, comprometido - entregado), entregas: p.entregasAlClub },
  };
}

export function calcularEntrenamiento(e) {
  const ingresos = sumar(e.ingresosTemporada, (x) => x.monto);
  const egresos = sumar(e.egresosTemporada, (x) => x.monto);
  return { ...e, ingresos, egresos, saldo: ingresos - egresos };
}

export function calcularConsolidado(planteles) {
  return {
    saldo: sumar(planteles, (p) => p.saldo),
    porRecaudar: sumar(planteles, (p) => p.porRecaudar),
    aporte: {
      comprometido: sumar(planteles, (p) => p.aporte.comprometido),
      entregado: sumar(planteles, (p) => p.aporte.entregado),
      pendiente: sumar(planteles, (p) => p.aporte.pendiente),
    },
  };
}

// ---------------------------------------------------------------------------
// Quién puede verlo
// ---------------------------------------------------------------------------

const slug = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/\s+/g, '-');

// Hacienda = quien aprueba compras (ministro de Hacienda o administrador).
// Tesorero de plantel = quien tiene rol de tesorero en su equipo.
// Los planteles se reconocen por el nombre del equipo.
export function accesoTablero(persona) {
  const hacienda = !!persona?.apruebaCompras;
  const propios = (persona?.equipos ?? []).filter((e) => e.tesorero).map((e) => slug(e.nombre));
  return { hacienda, plantelesPropios: propios, puedeVer: hacienda || propios.length > 0 };
}

// ---------------------------------------------------------------------------
// Datos
// ---------------------------------------------------------------------------

// Hoy siempre devuelve los datos de ejemplo. En la Fase 5 esta función pasa a
// pedirlos a la base con `llamar()` y devuelve la misma forma: las pantallas y
// los componentes no cambian.
export function useTablero() {
  const datos = TABLERO_DEMO;
  const mes = datos.temporada.mesActual;
  const planteles = datos.planteles.map((p) => calcularPlantel(p, mes));
  return {
    cargando: false,
    error: null,
    esEjemplo: true,
    temporada: datos.temporada,
    planteles,
    consolidado: calcularConsolidado(planteles),
    entrenamiento: calcularEntrenamiento(datos.entrenamiento),
  };
}
