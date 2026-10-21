// Tablero de tesoreros · DATOS DE EJEMPLO (Fase 4).
// Todo es inventado: nombres genéricos, montos redondos y movimientos que no
// corresponden a nadie real. En la Fase 5 este archivo se reemplaza por datos
// reales con la misma forma (ver `useTablero` en tablero.js).

const MESES = ['2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12'];

// Cada fila: [nombre, meses impagos (hasta octubre)]. Noviembre y diciembre
// todavía no se cobran, así que no cuentan como deuda.
const jugadoresDe = (prefijo, filas) =>
  filas.map(([nombre, debe], i) => ({
    id: `${prefijo}-${String(i + 1).padStart(2, '0')}`,
    nombre,
    cuotas: MESES.map((mes) => ({ mes, pagado: !debe.includes(mes) && mes <= '2026-10' })),
  }));

const nombres = (n) => Array.from({ length: n }, (_, i) => `Jugador ${String(i + 1).padStart(2, '0')}`);

// Pagos de octubre: una fila por jugador que pagó la cuota de octubre.
const cuotasDeOctubre = (jugadores, cuotaMensual, dia) =>
  jugadores
    .filter((j) => j.cuotas.find((c) => c.mes === '2026-10').pagado)
    .map((j, i) => ({
      id: `cuota-oct-${j.id}`,
      fecha: `2026-10-${String(dia + (i % 9)).padStart(2, '0')}`,
      tipo: 'ingreso',
      concepto: `Cuota de octubre · ${j.nombre}`,
      monto: cuotaMensual,
    }));

function plantel({ id, nombre, cuotaMensual, aportePorJugador, filas, otrosIngresos, otrosEgresos, entregas, movimientosOtros, diaInicio }) {
  const jugadores = jugadoresDe(id, filas);
  return {
    id,
    nombre,
    cuotaMensual,
    aportePorJugador,
    jugadores,
    // Ingresos y egresos de la temporada que NO son cuotas ni aporte al club
    // (partidos, multas, arbitrajes, canchas, etc.), en total.
    otrosIngresosTemporada: otrosIngresos,
    otrosEgresosTemporada: otrosEgresos,
    // Lo que el plantel ha entregado al club (cuenta como egreso del plantel).
    entregasAlClub: entregas,
    // Movimientos de octubre 2026.
    movimientos: [...cuotasDeOctubre(jugadores, cuotaMensual, diaInicio), ...movimientosOtros, ...entregas.filter((e) => e.fecha.startsWith('2026-10')).map((e) => ({ ...e, tipo: 'egreso', concepto: 'Aporte al club' }))]
      .sort((a, b) => (a.fecha < b.fecha ? 1 : -1)),
  };
}

const SENIOR_SABADO = plantel({
  id: 'senior-sabado',
  nombre: 'Senior Sábado',
  cuotaMensual: 50000,
  aportePorJugador: 4000,
  diaInicio: 1,
  filas: [
    ...nombres(14).map((n, i) => [n, [
      [], [], [], ['2026-10'], [], ['2026-09', '2026-10'], [], [], ['2026-08', '2026-09', '2026-10'],
      [], ['2026-10'], [], [], ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'],
    ][i]]),
  ],
  otrosIngresos: 310000,
  otrosEgresos: 3400000,
  entregas: [
    { id: 'ent-ss-1', fecha: '2026-05-06', monto: 120000 },
    { id: 'ent-ss-2', fecha: '2026-08-12', monto: 160000 },
    { id: 'ent-ss-3', fecha: '2026-10-07', monto: 100000 },
  ],
  movimientosOtros: [
    { id: 'm-ss-1', fecha: '2026-10-03', tipo: 'egreso', concepto: 'Arbitraje fecha 14', monto: 45000 },
    { id: 'm-ss-2', fecha: '2026-10-10', tipo: 'ingreso', concepto: 'Multas del mes', monto: 18000 },
    { id: 'm-ss-3', fecha: '2026-10-17', tipo: 'egreso', concepto: 'Arriendo de cancha', monto: 120000 },
    { id: 'm-ss-4', fecha: '2026-10-18', tipo: 'egreso', concepto: 'Agua y bebidas', monto: 22000 },
  ],
});

const SENIOR_JUEVES = plantel({
  id: 'senior-jueves',
  nombre: 'Senior Jueves',
  cuotaMensual: 35000,
  aportePorJugador: 4000,
  diaInicio: 2,
  filas: nombres(13).map((n, i) => [n, [
    [], ['2026-10'], [], [], ['2026-09', '2026-10'], [], [], [],
    ['2026-07', '2026-08', '2026-09', '2026-10'], [], ['2026-10'], [], [],
  ][i]]),
  otrosIngresos: 150000,
  otrosEgresos: 2300000,
  entregas: [
    { id: 'ent-sj-1', fecha: '2026-06-03', monto: 208000 },
    { id: 'ent-sj-2', fecha: '2026-09-09', monto: 156000 },
  ],
  movimientosOtros: [
    { id: 'm-sj-1', fecha: '2026-10-05', tipo: 'egreso', concepto: 'Arbitraje fecha 12', monto: 40000 },
    { id: 'm-sj-2', fecha: '2026-10-08', tipo: 'ingreso', concepto: 'Multas del mes', monto: 9000 },
    { id: 'm-sj-3', fecha: '2026-10-15', tipo: 'egreso', concepto: 'Arriendo de cancha', monto: 95000 },
  ],
});

const JUNIOR_SABADO = plantel({
  id: 'junior-sabado',
  nombre: 'Junior Sábado',
  cuotaMensual: 35000,
  aportePorJugador: 4000,
  diaInicio: 3,
  filas: nombres(12).map((n, i) => [n, [
    [], [], ['2026-09', '2026-10'], [], [], [], ['2026-10'], [],
    [], ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10'], [], [],
  ][i]]),
  otrosIngresos: 90000,
  otrosEgresos: 2200000,
  entregas: [
    { id: 'ent-js-1', fecha: '2026-07-01', monto: 288000 },
  ],
  movimientosOtros: [
    { id: 'm-js-1', fecha: '2026-10-04', tipo: 'egreso', concepto: 'Arbitraje fecha 11', monto: 38000 },
    { id: 'm-js-2', fecha: '2026-10-11', tipo: 'egreso', concepto: 'Arriendo de cancha', monto: 90000 },
    { id: 'm-js-3', fecha: '2026-10-12', tipo: 'ingreso', concepto: 'Rifa de la fecha', monto: 24000 },
  ],
});

// Entrenamiento lo administra su propio encargado: no entrega aporte por
// jugador y Hacienda solo lo mira.
const ENTRENAMIENTO = {
  nombre: 'Entrenamiento',
  ingresosTemporada: [
    { concepto: 'Cupos pagados', monto: 1260000 },
    { concepto: 'Multas por bajarse tarde', monto: 84000 },
  ],
  egresosTemporada: [
    { concepto: 'Arriendo de canchas', monto: 780000 },
    { concepto: 'Balones y conos', monto: 190000 },
  ],
};

export const TABLERO_DEMO = {
  temporada: { nombre: 'Temporada 2026', meses: MESES, mesActual: '2026-10' },
  planteles: [SENIOR_SABADO, SENIOR_JUEVES, JUNIOR_SABADO],
  entrenamiento: ENTRENAMIENTO,
};
