import { useCallback, useEffect, useState } from 'react';
import { esDemo, llamar } from './supabase.js';
import { hoyIso } from './fechas.js';

// Tesorería de cada plantel (Fase 5, migración 0023).
// La base guarda el plan de cuotas, la condición de cada jugador, los extras,
// los pagos y la caja. Lo que cada uno debe NO se guarda: se calcula acá, con
// las mismas funciones para el tesorero y para "Mi cuota", así siempre cuadra.
// Sin base (modo demostración) usa datos inventados en memoria.

export const TEMPORADA = new Date().getFullYear();

export const TIPOS = {
  normal: 'Normal',
  beca: 'Beca',
  exento: 'Exento (no paga)',
  especial: 'Monto especial',
};
export const MEDIOS = {
  transferencia: 'Transferencia',
  efectivo: 'Efectivo',
  app: 'Pago en la app',
  planilla: 'Venía de la planilla',
  otro: 'Otro',
};
export const CATEGORIAS = {
  liga: 'Cuota de la liga',
  club: 'Aporte al club',
  entrenamiento: 'Entrenamientos',
  evento: 'Evento o asado',
  uniformes: 'Uniformes',
  otro: 'Otro',
};
export const ESTADO_CARGO = { pagado: 'Pagado', parcial: 'Pagado en parte', vencido: 'Vencido', pendiente: 'Por vencer' };

// ---------------------------------------------------------------------------
// Cálculos (puros)
// ---------------------------------------------------------------------------
const sumar = (xs, f = (x) => x) => xs.reduce((t, x) => t + f(x), 0);

// Cuánto le toca pagar a un jugador por una cuota del plan.
// Especial: su monto en cada cuota mensual, y no paga inscripción (cuota 0).
export function montoPara(cuota, j) {
  if (!j.activo || j.tipo === 'exento') return 0;
  if (j.tipo === 'especial') return cuota.numero === 0 ? 0 : Number(j.monto_especial) || 0;
  return Math.round((cuota.monto * (100 - (Number(j.descuento_pct) || 0))) / 100);
}

// Cargos del jugador (deuda anterior, cuotas del plan y extras) con lo pagado
// repartido del más antiguo al más nuevo.
export function estadoJugador(j, cuotas, extras, pagos, temporada, hoy = hoyIso()) {
  const cargos = [];
  if (j.deuda_anterior > 0) {
    cargos.push({ id: 'deuda', nombre: `Deuda ${temporada - 1}`, vence: `${temporada}-01-01`, monto: j.deuda_anterior });
  }
  for (const c of cuotas) {
    const monto = montoPara(c, j);
    if (monto > 0) cargos.push({ id: `c${c.numero}`, nombre: c.nombre, vence: c.vence, monto });
  }
  for (const x of extras) {
    if (x.persona === j.id) cargos.push({ id: `x${x.id}`, extra: x.id, nombre: x.concepto, vence: x.vence, monto: x.monto });
  }
  cargos.sort((a, b) => (a.vence < b.vence ? -1 : a.vence > b.vence ? 1 : 0));

  const misPagos = pagos.filter((p) => p.persona === j.id);
  const pagado = sumar(misPagos.filter((p) => !p.anulado), (p) => p.monto);
  let queda = pagado;
  for (const c of cargos) {
    c.pagado = Math.min(queda, c.monto);
    queda -= c.pagado;
    c.estado = c.pagado >= c.monto ? 'pagado' : c.vence < hoy ? 'vencido' : c.pagado > 0 ? 'parcial' : 'pendiente';
  }
  const total = sumar(cargos, (c) => c.monto);
  const vencidos = cargos.filter((c) => c.estado === 'vencido' || (c.estado === 'parcial' && c.vence < hoy));
  const deudaVencida = sumar(vencidos, (c) => c.monto - c.pagado);
  return {
    ...j,
    cargos,
    pagos: misPagos,
    total,
    pagado,
    deudaVencida,
    cuotasVencidas: vencidos.length,
    porPagar: Math.max(0, total - pagado),
    aFavor: Math.max(0, pagado - total),
    proximo: cargos.find((c) => c.estado !== 'pagado' && c.vence >= hoy) ?? null,
    alDia: deudaVencida === 0,
  };
}

export function calcularPlantel(d, temporada, hoy = hoyIso()) {
  const jugadores = d.jugadores
    .map((j) => estadoJugador(j, d.cuotas, d.extras, d.pagos, temporada, hoy))
    .sort((a, b) => Number(b.activo) - Number(a.activo) || a.nombre.localeCompare(b.nombre, 'es'));
  const activos = jugadores.filter((j) => j.activo);
  const recaudado = sumar(d.pagos.filter((p) => !p.anulado), (p) => p.monto);
  const hechos = d.movimientos.filter((m) => !m.programado);
  const otrosIngresos = sumar(hechos.filter((m) => m.tipo === 'ingreso'), (m) => m.monto);
  const egresos = sumar(hechos.filter((m) => m.tipo === 'egreso'), (m) => m.monto);
  const programados = d.movimientos.filter((m) => m.programado);
  return {
    ...d,
    jugadores,
    activos: activos.length,
    alDia: activos.filter((j) => j.alDia).length,
    deudores: activos.filter((j) => !j.alDia),
    recaudado,
    deudaVencida: sumar(activos, (j) => j.deudaVencida),
    porCobrarTemporada: sumar(activos, (j) => j.porPagar),
    otrosIngresos,
    egresos,
    saldo: recaudado + otrosIngresos - egresos,
    programados,
    porPagarProgramado: sumar(programados.filter((m) => m.tipo === 'egreso'), (m) => m.monto),
    aporte: Math.round((recaudado * (Number(d.aporte_pct) || 0)) / 100),
  };
}

// Arma un plan de N cuotas iguales: inscripción opcional y un vencimiento por mes.
export function armarPlan({ temporada, inscripcion, cuota, desde, cantidad, dia }) {
  const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const plan = [];
  const d = String(Math.min(28, Math.max(1, dia))).padStart(2, '0');
  if (inscripcion > 0) plan.push({ numero: 0, nombre: 'Inscripción', vence: `${temporada}-${String(desde).padStart(2, '0')}-${d}`, monto: inscripcion });
  for (let i = 0; i < cantidad && desde + i <= 12; i++) {
    const mes = desde + i;
    plan.push({ numero: i + 1, nombre: MESES[mes - 1], vence: `${temporada}-${String(mes).padStart(2, '0')}-${d}`, monto: cuota });
  }
  return plan;
}

// ---------------------------------------------------------------------------
// Cobros: mensajes listos para mandar
// ---------------------------------------------------------------------------
const pesosTexto = (n) => `$${Math.round(n).toLocaleString('es-CL')}`;
const appUrl = () => `${window.location.origin}${import.meta.env.BASE_URL || '/'}cuota`.replace(/([^:]\/)\/+/g, '$1');

export function mensajeCobro(j, plantel) {
  const nombre = j.nombre.split(' ')[0];
  if (j.deudaVencida > 0) {
    return `Hola ${nombre}, te escribe la tesorería de ${plantel}. Tienes ${pesosTexto(j.deudaVencida)} pendientes `
      + `(${j.cargos.filter((c) => c.estado === 'vencido').map((c) => c.nombre).join(', ')}). `
      + `Puedes ver tu detalle en la app: ${appUrl()} ¡Gracias!`;
  }
  if (j.proximo) {
    return `Hola ${nombre}, te recuerda la tesorería de ${plantel}: la cuota ${j.proximo.nombre} `
      + `(${pesosTexto(j.proximo.monto - j.proximo.pagado)}) vence el ${j.proximo.vence.split('-').reverse().join('-')}. `
      + `Detalle en la app: ${appUrl()}`;
  }
  return `Hola ${nombre}, estás al día con la tesorería de ${plantel}. ¡Gracias!`;
}

// Teléfono chileno a formato de WhatsApp (569XXXXXXXX), o null.
export function telefonoWhatsApp(t) {
  const n = String(t ?? '').replace(/\D/g, '');
  if (n.length === 9 && n.startsWith('9')) return `56${n}`;
  if (n.length === 11 && n.startsWith('569')) return n;
  if (n.length === 8) return `569${n}`;
  return null;
}

export const enlaceWhatsApp = (j, plantel) => {
  const tel = telefonoWhatsApp(j.telefono);
  return tel ? `https://wa.me/${tel}?text=${encodeURIComponent(mensajeCobro(j, plantel))}` : null;
};

// Un solo correo a todos los elegidos, con copia oculta.
export function enlaceCorreoMasivo(jugadores, plantel) {
  const correos = jugadores.map((j) => j.correo).filter(Boolean);
  const asunto = `Tesorería ${plantel}: cuotas pendientes`;
  const cuerpo = `Hola,\n\nTe escribimos de la tesorería de ${plantel}. Según nuestros registros tienes cuotas pendientes. `
    + `Puedes ver tu detalle (y lo que ya pagaste) en la app, en Más > Mi cuota:\n${appUrl()}\n\n`
    + `Si ya pagaste, respóndenos este correo con el comprobante.\n\n¡Gracias!\nTesorería ${plantel}`;
  return `mailto:?bcc=${encodeURIComponent(correos.join(','))}&subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`;
}

// Lista para la liga: nombre, RUT, fecha de nacimiento, edad y contacto de quienes
// juegan esta temporada, en un CSV que Excel abre bien (punto y coma y BOM).
export function rutConPuntos(rut) {
  const m = /^(\d{7,8})-([\dK])$/.exec(rut ?? '');
  return m ? `${m[1].replace(/\B(?=(\d{3})+(?!\d))/g, '.')}-${m[2]}` : (rut ?? '');
}

export function edad(nacimiento, hoy = new Date()) {
  if (!nacimiento) return '';
  const [a, m, d] = nacimiento.split('-').map(Number);
  return hoy.getFullYear() - a - ((hoy.getMonth() + 1 < m || (hoy.getMonth() + 1 === m && hoy.getDate() < d)) ? 1 : 0);
}

export function csvLiga(jugadores) {
  const celda = (v) => {
    const t = String(v ?? '');
    return /[";\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const filas = jugadores.filter((j) => j.activo).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')).map((j) => [
    j.nombre, rutConPuntos(j.rut), j.nacimiento ? j.nacimiento.split('-').reverse().join('-') : '', edad(j.nacimiento),
    j.telefono ?? '', j.correo_perfil ?? j.correo ?? '',
  ]);
  return '﻿' + [['Nombre', 'RUT', 'Fecha de nacimiento', 'Edad', 'Celular', 'Correo'], ...filas]
    .map((f) => f.map(celda).join(';')).join('\r\n');
}

export function bajarListaLiga(jugadores, plantel) {
  const url = URL.createObjectURL(new Blob([csvLiga(jugadores)], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  // Sin tildes en el nombre del archivo: algunos navegadores lo cambian por "download".
  const limpio = plantel.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w ()-]/g, '').trim();
  a.download = `Lista liga ${limpio} ${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 1000);
}

// ---------------------------------------------------------------------------
// Datos de demostración (inventados)
// ---------------------------------------------------------------------------
const NOMBRES_DEMO = ['Aldo Inventado', 'Benito Ficticio', 'Carlos de Prueba', 'Dante Ejemplo', 'Elías Demo', 'Fabio Imaginario', 'Gael Simulado'];
const demo = {
  planteles: [{ id: 'e-junior', nombre: 'Junior Sábado (demo)', editar: true }],
  datos: {
    'e-junior': {
      aporte_pct: 10,
      cuotas: armarPlan({ temporada: TEMPORADA, inscripcion: 30000, cuota: 40000, desde: 3, cantidad: 9, dia: 10 }),
      jugadores: NOMBRES_DEMO.map((nombre, i) => ({
        id: `j${i}`, nombre, apodo: i === 1 ? 'el Beni' : null, correo_perfil: i < 4 ? `jugador${i + 1}@ejemplo.cl` : null, en_plantel: true, activo: true,
        tipo: i === 2 ? 'beca' : i === 5 ? 'exento' : 'normal', descuento_pct: i === 2 ? 50 : 0, monto_especial: null,
        deuda_anterior: i === 3 ? 15000 : 0, telefono: i % 3 === 0 ? null : `9${String(10000000 + i * 1111111).slice(0, 8)}`,
        correo: `jugador${i + 1}@ejemplo.cl`, comentario: null, con_cuenta: i < 4,
        rut: i < 3 ? ['11111111-1', '22222222-2', '33333333-3'][i] : null, nacimiento: i < 5 ? `199${i}-0${i + 1}-1${i}` : null,
      })),
      extras: [{ id: 1, persona: 'j0', concepto: 'Polera', monto: 18000, vence: `${TEMPORADA}-05-01` }],
      pagos: [
        ...[0, 1, 4, 6].flatMap((i) => [
          { id: 100 + i, persona: `j${i}`, monto: 150000, fecha: `${TEMPORADA}-04-05`, medio: 'transferencia', nota: null, anulado: false, registro: 'Demo' },
          { id: 200 + i, persona: `j${i}`, monto: i === 1 ? 80000 : 180000, fecha: `${TEMPORADA}-08-05`, medio: 'transferencia', nota: null, anulado: false, registro: 'Demo' },
        ]),
        { id: 300, persona: 'j2', monto: 60000, fecha: `${TEMPORADA}-05-02`, medio: 'efectivo', nota: null, anulado: false, registro: 'Demo' },
        { id: 301, persona: 'j3', monto: 70000, fecha: `${TEMPORADA}-04-10`, medio: 'planilla', nota: null, anulado: false, registro: 'Demo' },
      ],
      movimientos: [
        { id: 1, fecha: `${TEMPORADA}-03-20`, tipo: 'egreso', categoria: 'liga', motivo: 'Cuota liga marzo', monto: 450000, programado: false },
        { id: 2, fecha: `${TEMPORADA}-04-10`, tipo: 'egreso', categoria: 'entrenamiento', motivo: 'Entrenamientos abril', monto: 56000, programado: false },
        { id: 3, fecha: `${TEMPORADA}-06-15`, tipo: 'ingreso', categoria: 'evento', motivo: 'Rifa', monto: 120000, programado: false },
        { id: 4, fecha: `${TEMPORADA}-12-10`, tipo: 'egreso', categoria: 'liga', motivo: 'Cuota liga diciembre', monto: 450000, programado: true },
      ],
    },
  },
  sec: 1000,
};
const NOMINA_DEMO = ['Hugo Inventado', 'Ismael Ficticio', 'Joaquín de Prueba'].map((nombre, i) => ({ id: `n${i}`, nombre }));
const esperar = () => new Promise((r) => setTimeout(r, 150));

// Importar en modo demostración: calza por nombre exacto; sin RUT, no entra.
function importarDemo(d, { filas, plan, aporte, bajas, archivo, confirmar }) {
  const sin = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const pagadoDe = (id) => d.pagos.filter((g) => g.persona === id && g.medio === 'planilla' && !g.anulado).reduce((t, g) => t + g.monto, 0);
  const res = filas.map((f) => {
    const j = d.jugadores.find((x) => sin(x.nombre) === sin(f.nombre));
    const estado = j ? 'calza' : f.rut ? 'nuevo' : 'sin_rut';
    const cambios = [];
    if (estado === 'nuevo') cambios.push('Se suma a la nómina y al plantel');
    if (j && (j.tipo !== f.tipo || Number(j.descuento_pct) !== Number(f.descuento_pct))) cambios.push('Condición');
    const antes = j ? pagadoDe(j.id) : 0;
    if (estado !== 'sin_rut' && antes !== f.pagado) cambios.push(`Pagado: $${antes.toLocaleString('es-CL')} → $${f.pagado.toLocaleString('es-CL')}`);
    return { f, j, estado, cambios, avisos: estado === 'sin_rut' ? ['Sin RUT y no calza con nadie de la app: no se importa'] : [] };
  });
  const fuera = d.jugadores.filter((j) => j.activo && !res.some((r) => r.j?.id === j.id)).map((j) => ({ id: j.id, nombre: j.nombre }));
  const planCambia = !!plan && JSON.stringify(plan) !== JSON.stringify(d.cuotas);
  const resumen = {
    filas: res.length, calzan: res.filter((r) => r.estado === 'calza').length, nuevos: res.filter((r) => r.estado === 'nuevo').length,
    con_cambios: res.filter((r) => r.estado !== 'sin_rut' && r.cambios.length).length,
    no_se_importan: res.filter((r) => r.estado === 'sin_rut').length, fuera: fuera.length,
    plan_cambia: planCambia, aporte_cambia: aporte != null && aporte !== Number(d.aporte_pct),
  };
  if (confirmar) {
    for (const { f, j: existe, estado } of res) {
      if (estado === 'sin_rut') continue;
      let j = existe;
      if (!j) {
        j = { id: `n${++demo.sec}`, nombre: f.nombre, en_plantel: true, con_cuenta: false, apodo: null, rut: null, nacimiento: null };
        d.jugadores.push(j);
      }
      Object.assign(j, {
        activo: true, tipo: f.tipo, descuento_pct: f.descuento_pct, monto_especial: f.monto_especial, deuda_anterior: f.deuda_anterior,
        telefono: f.telefono, correo: f.correo, comentario: f.comentario,
        apodo: j.apodo ?? f.apodo, rut: j.rut ?? f.rut, nacimiento: j.nacimiento ?? f.nacimiento,
      });
      if (pagadoDe(j.id) !== f.pagado) {
        d.pagos.forEach((g) => { if (g.persona === j.id && g.medio === 'planilla') g.anulado = true; });
        if (f.pagado > 0) {
          d.pagos.unshift({ id: ++demo.sec, persona: j.id, monto: f.pagado, fecha: hoyIso(), medio: 'planilla',
                            nota: 'Pagado según la planilla común', anulado: false, registro: 'Tú' });
        }
      }
    }
    if (planCambia) d.cuotas = plan;
    if (aporte != null) d.aporte_pct = aporte;
    const deBaja = d.jugadores.filter((j) => (bajas ?? []).includes(j.id) && fuera.some((x) => x.id === j.id));
    deBaja.forEach((j) => { j.activo = false; });
    resumen.bajas = deBaja.length;
    d.importacion = { hecha_en: new Date().toISOString(), archivo, por: 'Tú', resumen };
  }
  return {
    confirmado: !!confirmar, errores: [], resumen, fuera,
    filas: res.map((r) => ({ fila: r.f.fila, nombre: r.f.nombre, estado: r.estado, como: r.j ? 'nombre' : null,
                             en_app: r.j?.nombre ?? null, cambios: r.cambios, avisos: r.avisos })),
  };
}

const accionesDemo = (equipo) => {
  const d = () => demo.datos[equipo];
  return {
    importarPlanilla: async (datos) => { await esperar(); return importarDemo(d(), datos); },
    guardarPlan: async (cuotas, aporte) => { await esperar(); Object.assign(d(), { cuotas, aporte_pct: aporte }); },
    guardarJugador: async (persona, todo) => {
      await esperar();
      const datos = Object.fromEntries(Object.entries(todo).filter(([, v]) => v !== undefined));
      if (datos.rut && !/^\d{1,2}\.?\d{3}\.?\d{3}-?[\dkK]$/.test(datos.rut.trim())) throw new Error(`El RUT ${datos.rut} no parece válido`);
      const j = d().jugadores.find((x) => x.id === persona);
      if (j) Object.assign(j, datos);
      else {
        const n = NOMINA_DEMO.find((x) => x.id === persona);
        d().jugadores.push({ id: persona, nombre: n?.nombre ?? 'Persona', en_plantel: false, activo: true, tipo: 'normal', descuento_pct: 0,
                             monto_especial: null, deuda_anterior: 0, telefono: null, correo: null, comentario: null, con_cuenta: false, ...datos });
      }
    },
    registrarPago: async (persona, monto, fecha, medio, nota) => {
      await esperar();
      if (fecha > hoyIso()) throw new Error('La fecha del pago no puede ser futura');
      d().pagos.unshift({ id: ++demo.sec, persona, monto, fecha, medio, nota, anulado: false, registro: 'Tú' });
    },
    anularPago: async (id) => { await esperar(); d().pagos.find((p) => p.id === id).anulado = true; },
    cargarExtra: async (personas, concepto, monto, vence) => {
      await esperar();
      for (const persona of personas) d().extras.push({ id: ++demo.sec, persona, concepto, monto, vence });
    },
    quitarExtra: async (id) => { await esperar(); d().extras = d().extras.filter((x) => x.id !== id); },
    guardarMovimiento: async (id, m) => {
      await esperar();
      if (id) Object.assign(d().movimientos.find((x) => x.id === id), m);
      else d().movimientos.unshift({ id: ++demo.sec, ...m });
    },
    quitarMovimiento: async (id) => { await esperar(); d().movimientos = d().movimientos.filter((x) => x.id !== id); },
    buscarPersonas: async (texto) => {
      await esperar();
      const t = texto.toLowerCase();
      return NOMINA_DEMO.filter((n) => n.nombre.toLowerCase().includes(t) && !d().jugadores.some((j) => j.id === n.id));
    },
  };
};

const accionesReales = (equipo, temporada) => ({
  // Vista previa (confirmar = false) o importación (true) de la planilla común (0052).
  importarPlanilla: ({ filas, plan, aporte, bajas, archivo, confirmar }) => llamar('tes_importar_planilla', {
    p_equipo: equipo, p_temporada: temporada, p_filas: filas, p_plan: plan ?? null, p_aporte_pct: aporte ?? null,
    p_bajas: bajas?.length ? bajas : null, p_archivo: archivo ?? null, p_confirmar: !!confirmar }),
  guardarPlan: (cuotas, aporte) => llamar('tes_guardar_plan', { p_equipo: equipo, p_temporada: temporada, p_cuotas: cuotas, p_aporte_pct: aporte }),
  // RUT y fecha de nacimiento van aparte (0029): al perfil, no a la temporada.
  guardarJugador: async (persona, { rut, nacimiento, ...datos }) => {
    await llamar('tes_guardar_jugador', { p_equipo: equipo, p_temporada: temporada, p_persona: persona, p_datos: datos });
    const identidad = {};
    if (rut !== undefined) identidad.rut = rut;
    if (nacimiento !== undefined) identidad.nacimiento = nacimiento;
    if (Object.keys(identidad).length) {
      await llamar('tes_guardar_identidad', { p_equipo: equipo, p_persona: persona, p_datos: identidad });
    }
  },
  registrarPago: (persona, monto, fecha, medio, nota) => llamar('tes_registrar_pago', {
    p_equipo: equipo, p_temporada: temporada, p_persona: persona, p_monto: monto, p_fecha: fecha, p_medio: medio, p_nota: nota || null }),
  anularPago: (id) => llamar('tes_anular_pago', { p_pago: id }),
  cargarExtra: (personas, concepto, monto, vence) => llamar('tes_cargar_extra', {
    p_equipo: equipo, p_temporada: temporada, p_personas: personas, p_concepto: concepto, p_monto: monto, p_vence: vence }),
  quitarExtra: (id) => llamar('tes_quitar_extra', { p_extra: id }),
  guardarMovimiento: (id, m) => llamar('tes_guardar_movimiento', {
    p_equipo: equipo, p_temporada: temporada, p_id: id ?? null, p_fecha: m.fecha, p_tipo: m.tipo, p_categoria: m.categoria,
    p_motivo: m.motivo, p_monto: m.monto, p_programado: !!m.programado }),
  quitarMovimiento: (id) => llamar('tes_quitar_movimiento', { p_id: id }),
  buscarPersonas: (texto) => llamar('tes_buscar_personas', { p_equipo: equipo, p_texto: texto }),
});

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------
// Planteles cuya tesorería puedo ver. null = cargando.
export function usePlantelesTesoreria() {
  const [planteles, setPlanteles] = useState(esDemo ? demo.planteles : null);
  useEffect(() => {
    if (esDemo) return;
    let vivo = true;
    llamar('tes_planteles').then((p) => vivo && setPlanteles(p ?? [])).catch(() => vivo && setPlanteles([]));
    return () => { vivo = false; };
  }, []);
  return planteles;
}

export function useTesoreria(equipo, temporada = TEMPORADA) {
  const [estado, setEstado] = useState({ cargando: true, error: '', datos: null });

  const cargar = useCallback(async () => {
    if (!equipo) return;
    try {
      const datos = esDemo
        ? structuredClone({ editar: true, importacion: null, ...demo.datos[equipo] })
        : await Promise.all([
          llamar('tes_ver', { p_equipo: equipo, p_temporada: temporada }),
          // Si la 0052 todavía no está corrida, se sigue como antes.
          llamar('tes_ultima_importacion', { p_equipo: equipo, p_temporada: temporada }).catch(() => null),
        ]).then(([v, importacion]) => ({ ...v, importacion }));
      setEstado({ cargando: false, error: '', datos });
    } catch (e) {
      setEstado({ cargando: false, error: e.message, datos: null });
    }
  }, [equipo, temporada]);

  useEffect(() => { setEstado({ cargando: true, error: '', datos: null }); cargar(); }, [cargar]);

  const base = esDemo ? accionesDemo(equipo) : accionesReales(equipo, temporada);
  // Cada acción recarga al terminar, para que todos los números salgan de la base.
  // Buscar y la vista previa de la planilla no cambian nada: no recargan.
  const acciones = Object.fromEntries(Object.entries(base).map(([k, f]) => [k, k === 'buscarPersonas' ? f : async (...a) => {
    if (k === 'importarPlanilla' && !a[0]?.confirmar) return f(...a);
    const r = await f(...a);
    await cargar();
    return r;
  }]));

  return {
    ...estado,
    plantel: estado.datos ? calcularPlantel(estado.datos, temporada) : null,
    acciones,
  };
}

// "Mi cuota": lo mío en cada plantel con plan.
export function useMiCuota(temporada = TEMPORADA) {
  const [estado, setEstado] = useState({ cargando: true, error: '', planteles: [] });
  useEffect(() => {
    let vivo = true;
    const traer = esDemo
      ? Promise.resolve([{ equipo: 'e-junior', nombre: demo.planteles[0].nombre, cuotas: demo.datos['e-junior'].cuotas,
          jugador: demo.datos['e-junior'].jugadores[1], extras: demo.datos['e-junior'].extras, pagos: demo.datos['e-junior'].pagos }])
      : llamar('mi_tesoreria', { p_temporada: temporada });
    traer.then((ps) => vivo && setEstado({
      cargando: false, error: '',
      planteles: (ps ?? []).map((p) => ({ ...p, estado: estadoJugador(p.jugador, p.cuotas, p.extras, p.pagos, temporada) })),
    })).catch((e) => vivo && setEstado({ cargando: false, error: e.message, planteles: [] }));
    return () => { vivo = false; };
  }, [temporada]);
  return estado;
}
