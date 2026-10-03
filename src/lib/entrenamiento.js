import { esDemo, llamar } from './supabase.js';
import { crearAlmacen } from './almacen.js';
import { diaSemana, proximoDia, correrDias } from './fechas.js';

// La lista de entrenamiento: cupos, precio según categoría, quién pagó y quién
// quedó debiendo. Es de todo el club; la abre un encargado.

const inscrito = (i) => ({
  id: i.id, personaId: i.persona_id, nombre: i.nombre, invitado: !!i.invitado,
  invitadoPor: i.invitado_por, esMio: !!i.es_mio, monto: i.monto, pagado: i.pagado,
});
const desdeFila = (f) => f && ({
  id: f.id, fecha: f.fecha, horaInicio: f.hora_inicio, horaFin: f.hora_fin, lugar: f.lugar, cupo: f.cupo,
  precioJunior: f.precio_junior, precioSenior: f.precio_senior, precioInvitado: f.precio_invitado,
  multa: f.multa, miPrecio: f.mi_precio,
  inscritos: f.inscritos.map(inscrito), bajasTarde: f.bajas_tarde.map(inscrito),
});

const base = {
  cargar: async () => {
    const r = await llamar('entrenamiento_actual');
    return {
      entrenamiento: desdeFila(r.entrenamiento), puedoAdministrar: r.puedo_administrar, puedoCobrar: r.puedo_cobrar,
      deben: r.deben.map((d) => ({ id: d.id, nombre: d.nombre, fecha: d.fecha, monto: d.monto, multa: d.multa })),
    };
  },
  inscribirme: (id) => llamar('entrenamiento_inscribirme', { p_id: id }),
  invitar: (id, _yo, nombre) => llamar('entrenamiento_invitar', { p_id: id, p_nombre: nombre }),
  bajar: (inscritoId) => llamar('entrenamiento_bajar', { p_inscrito: inscritoId }),
  pago: (inscritoId, pagado) => llamar('entrenamiento_pago', { p_inscrito: inscritoId, p_pagado: pagado }),
  guardar: (d) => llamar('entrenamiento_guardar', {
    p_id: d.id ?? null, p_fecha: d.fecha, p_hora_inicio: d.horaInicio || null, p_hora_fin: d.horaFin || null,
    p_lugar: d.lugar || null, p_cupo: d.cupo, p_precio_junior: d.precioJunior, p_precio_senior: d.precioSenior,
    p_precio_invitado: d.precioInvitado, p_multa: d.multa,
  }),
  eliminar: (id) => llamar('entrenamiento_eliminar', { p_id: id }),
};

// --- Modo demostración ------------------------------------------------------
const fila = (nombre, pagado, extra = {}) => ({
  id: `i-${nombre}`, personaId: `d-${nombre}`, nombre, invitado: false, invitadoPor: null,
  esMio: false, monto: 4000, pagado, ...extra,
});
let demo = {
  puedoAdministrar: true, puedoCobrar: true,
  entrenamiento: {
    id: 'e1', fecha: proximoDia(1), horaInicio: '20:00', horaFin: '22:00', lugar: 'Cancha de ejemplo', cupo: 22,
    precioJunior: 2000, precioSenior: 4000, precioInvitado: 5000, multa: 1000, miPrecio: 4000,
    inscritos: [
      fila('Pancho', true), fila('Lalo', true), fila('Tito', false), fila('Nico', true), fila('Rorro', false),
      fila('Invitado 1', true, { personaId: null, invitado: true, invitadoPor: 'Pancho', monto: 5000 }), fila('Mauro', false),
    ],
    bajasTarde: [],
  },
  deben: [{ id: 'x1', nombre: 'Chino', fecha: correrDias(proximoDia(1), -7), monto: 4000, multa: false }],
};
const conLista = (f) => { demo = { ...demo, entrenamiento: { ...demo.entrenamiento, inscritos: f(demo.entrenamiento.inscritos) } }; };
const enDemo = {
  cargar: async () => demo,
  inscribirme: async (_id, yo) => conLista((l) => [...l, fila(yo.nombre, false, { id: 'i-yo', personaId: yo.id, esMio: true })]),
  invitar: async (_id, yo, nombre) => conLista((l) => [...l, fila(nombre, false, { id: `i-${Date.now()}`, personaId: null, invitado: true, invitadoPor: yo.nombre, esMio: true, monto: 5000 })]),
  bajar: async (inscritoId) => conLista((l) => l.filter((i) => i.id !== inscritoId)),
  pago: async (inscritoId, pagado) => {
    conLista((l) => l.map((i) => (i.id === inscritoId ? { ...i, pagado } : i)));
    if (pagado) demo = { ...demo, deben: demo.deben.filter((d) => d.id !== inscritoId) };
  },
  guardar: async (d) => {
    demo = { ...demo, entrenamiento: { ...(demo.entrenamiento ?? { id: 'e2', inscritos: [], bajasTarde: [], miPrecio: d.precioSenior }), ...d } };
  },
  eliminar: async () => { demo = { ...demo, entrenamiento: null }; },
};

const origen = esDemo ? enDemo : base;
const almacen = crearAlmacen(origen.cargar);
export const vaciarEntrenamiento = almacen.vaciar;

export function useEntrenamiento(yo) {
  const { cargando, error, datos } = almacen.usar();
  const e = datos?.entrenamiento ?? null;
  const mia = e?.inscritos.find((i) => i.personaId === yo.id) ?? null;
  const y = (accion) => async (...a) => { await accion(...a); await almacen.recargar(); };
  return {
    cargando, error, entrenamiento: e,
    deben: datos?.deben ?? [],
    puedoAdministrar: !!datos?.puedoAdministrar, puedoCobrar: !!datos?.puedoCobrar,
    miInscripcion: mia,
    libres: e ? e.cupo - e.inscritos.length : 0,
    inscribirme: y(() => origen.inscribirme(e.id, yo)),
    invitar: y((nombre) => origen.invitar(e.id, yo, nombre)),
    bajar: y(origen.bajar),
    marcarPago: y(origen.pago),
    guardar: y(origen.guardar),
    eliminar: y(() => origen.eliminar(e.id)),
  };
}

export const horario = (e) => [e.horaInicio, e.horaFin].filter(Boolean).join(' a ');

export function recordatorioEntrenamiento(e, url) {
  const libres = e.cupo - e.inscritos.length;
  return (
    `⚽ ¿Entrenas este ${diaSemana(e.fecha)}?\n` +
    [horario(e), e.lugar].filter(Boolean).join(' · ') + `. ` +
    (libres > 0 ? `Quedan ${libres} de ${e.cupo} cupos.` : 'La lista está completa.') +
    `\nInscríbete acá 👉 ${url}`
  );
}
