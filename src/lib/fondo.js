import { useSyncExternalStore } from 'react';

// Fondo Concursable Las Condes 2026 · VISTA PREVIA con datos de ejemplo.
// Todavía no hay base de datos: todo vive en memoria y vuelve al ejemplo al
// recargar. Sirve para mostrar el flujo al equipo del fondo y resolver dudas
// antes de programarlo de verdad (ver la propuesta enviada a Santiago).
// Solo categorías y montos del presupuesto: nada de datos personales.

export const FONDO = {
  nombre: 'Fondo Las Condes 2026',
  proyecto: 'Entrenamientos Funcionales Hugo Jara',
  municipio: 3087500,
  aportePropio: 450000,
  desde: '2026-10-01',
  hasta: '2026-12-28',
};

export const TOPICOS = [
  { id: 'fondo', nombre: 'Fondo Las Condes 2026', desc: 'Entrenamientos Funcionales. Controla presupuesto y respaldos.' },
  { id: 'aniversario', nombre: '20 años · fiesta 21 nov', desc: 'Gastos de la celebración.' },
  { id: 'general', nombre: 'Gastos generales del club', desc: 'Lo que no es de un proyecto.' },
];

export const ITEMS = [
  { id: 'personal', nombre: 'Personal (honorarios)', aprobado: 637500, detalle: 'Entrenador, 3 cuotas de $212.500 (oct–dic)' },
  { id: 'bienes', nombre: 'Bienes e infraestructura', aprobado: 1848000, detalle: 'Balones, cintas de goma, conos y vallas, poleras de entrenamiento' },
  { id: 'materiales', nombre: 'Materiales de trabajo', aprobado: 0, detalle: 'Sin monto aprobado' },
  { id: 'otros', nombre: 'Otros gastos', aprobado: 602000, detalle: 'Bebidas isotónicas, botiquín e insumos médicos' },
];

export const PAGOS = {
  transferencia: 'Transferencia del club',
  debito: 'Débito del club',
  particular: 'Pagó un particular',
};

// Respaldos que pide el reglamento (Decreto Alcaldicio N°749, 2024).
const RESPALDOS_COMPRA = [
  { id: 'cotizacion', nombre: 'Cotización', nota: 'La que se subió al pedir la compra' },
  { id: 'boleta', nombre: 'Boleta o factura electrónica', nota: 'A nombre del club, con detalle (art. 8)' },
  { id: 'comprobante', nombre: 'Comprobante de pago', nota: 'Con N° de documento y monto (art. 8)' },
  { id: 'certificacion', nombre: 'Certificación de la compra', nota: 'Hoja firmada por el representante legal (art. 8)' },
];
const NOMINA = { id: 'nomina', nombre: 'Nómina de entrega firmada', nota: 'Nombre, cédula, domicilio y firma (art. 10). Se guarda en privado' };
const ORIGINAL = { id: 'original', nombre: 'Original archivado, firmado y timbrado', nota: 'Lo guarda el tesorero (arts. 12–16)' };
const RESPALDOS_HONORARIOS = [
  { id: 'boleta', nombre: 'Boleta de honorarios electrónica', nota: 'Del mes (art. 18)' },
  { id: 'comprobante', nombre: 'Comprobante de transferencia', nota: 'Con nombre del entrenador, monto y fecha (art. 19)' },
  { id: 'f29', nombre: 'Formulario 29 del mes', nota: 'Pago de la retención (art. 20)' },
  { id: 'certificacion', nombre: 'Certificación de la contratación', nota: 'Art. 8' },
  ORIGINAL,
];

export const respaldosDe = (c) =>
  c.item === 'personal' ? RESPALDOS_HONORARIOS : [...RESPALDOS_COMPRA, ...(c.entrega ? [NOMINA] : []), ORIGINAL];

export const ESTADOS = {
  pendiente: 'Faltan respaldos',
  lista: 'Lista para rendir',
  no_rendible: 'No rendible',
  rendida: 'Rendida',
};

// Por qué una compra no se puede rendir, o null si se puede.
export function motivoNoRendible(c) {
  if (c.pago === 'particular') return 'Pagó un particular: el reglamento solo acepta pagos con la cuenta o el débito del club (art. 9).';
  if (c.fecha && c.fecha < FONDO.desde) return 'La boleta es anterior a la fecha desde la que se puede gastar el fondo (art. 5).';
  return null;
}

export function estadoDe(c, rendiciones) {
  if (motivoNoRendible(c)) return 'no_rendible';
  if (rendiciones.some((r) => r.presentada && r.compras.includes(c.id))) return 'rendida';
  const completa = c.pago && respaldosDe(c).every((r) => c.respaldos[r.id]);
  return completa ? 'lista' : 'pendiente';
}

// --- Datos de ejemplo --------------------------------------------------------
const marcados = (...ids) => Object.fromEntries(ids.map((i) => [i, true]));
const inicial = () => ({
  compras: [
    { id: 'c1', item: 'bienes', que: 'Poleras de entrenamiento (63)', monto: 1124550, proveedor: 'Proveedor de ejemplo', documento: '4821', fecha: '2026-10-12', pago: 'transferencia', entrega: true,
      respaldos: marcados('cotizacion', 'boleta', 'comprobante') },
    { id: 'c2', item: 'otros', que: 'Bebidas isotónicas', monto: 96000, proveedor: 'Distribuidora de ejemplo', documento: '10233', fecha: '2026-10-20', pago: 'debito', entrega: false,
      respaldos: marcados('cotizacion', 'boleta', 'comprobante', 'certificacion', 'original') },
    { id: 'c3', item: 'otros', que: 'Insumos para el botiquín', monto: 38000, proveedor: 'Farmacia de ejemplo', documento: '5521', fecha: '2026-10-15', pago: 'particular', entrega: false,
      respaldos: marcados('cotizacion', 'boleta') },
    { id: 'h10', item: 'personal', que: 'Honorarios entrenador · octubre', monto: 212500, proveedor: 'Entrenador', documento: '31', fecha: '2026-10-31', pago: 'transferencia', entrega: false,
      respaldos: marcados('boleta', 'comprobante', 'f29', 'certificacion', 'original') },
    { id: 'h11', item: 'personal', que: 'Honorarios entrenador · noviembre', monto: 212500, proveedor: 'Entrenador', documento: '', fecha: '2026-11-30', pago: null, entrega: false, respaldos: {} },
    { id: 'h12', item: 'personal', que: 'Honorarios entrenador · diciembre', monto: 212500, proveedor: 'Entrenador', documento: '', fecha: '2026-12-28', pago: null, entrega: false, respaldos: {} },
  ],
  documentos: [
    { id: 'cartola', nombre: 'Cartola con el depósito del fondo', nota: 'Art. 23', listo: true },
    { id: 'ingreso', nombre: 'Comprobante de ingreso firmado', nota: 'Firmado por el representante legal (art. 2)', listo: false },
  ],
  rendiciones: [
    { id: 1, nombre: 'Rendición 1', plazo: 'Dos meses desde que llega la plata', presentada: false, subida: false, compras: [] },
    { id: 2, nombre: 'Rendición 2 (final)', plazo: 'Antes del 30 de diciembre', presentada: false, subida: false, compras: [] },
  ],
});

// Los honorarios de meses que no han pasado no cuentan como gastados todavía.
export const cuentaComoGasto = (c) => c.item !== 'personal' || !!c.pago;

let estado = inicial();
const oyentes = new Set();
const cambiar = (f) => { estado = f(estado); oyentes.forEach((o) => o()); };
const suscribir = (o) => { oyentes.add(o); return () => oyentes.delete(o); };

export function useFondo() {
  const e = useSyncExternalStore(suscribir, () => estado);
  const conEstado = e.compras.map((c) => ({ ...c, estado: estadoDe(c, e.rendiciones) }));
  const porItem = ITEMS.map((it) => {
    const compras = conEstado.filter((c) => c.item === it.id && cuentaComoGasto(c) && c.estado !== 'no_rendible');
    const gastado = compras.reduce((t, c) => t + c.monto, 0);
    const excedido = Math.max(0, gastado - it.aprobado);
    let situacion = 'sin_gastos';
    if (excedido > 0) situacion = 'excedido';
    else if (compras.some((c) => c.estado === 'pendiente')) situacion = 'faltan';
    else if (compras.length) situacion = 'al_dia';
    return { ...it, gastado, disponible: Math.max(0, it.aprobado - gastado), excedido, situacion };
  });
  const gastado = porItem.reduce((t, i) => t + Math.min(i.gastado, i.aprobado), 0);
  return {
    ...e,
    compras: conEstado,
    porItem,
    gastado,
    disponible: FONDO.municipio - gastado,
    // Lo que entraría en la rendición que está abierta: lo listo que no se ha rendido.
    paraRendir: conEstado.filter((c) => c.estado === 'lista'),
    marcarRespaldo: (id, r, valor) =>
      cambiar((s) => ({ ...s, compras: s.compras.map((c) => (c.id === id ? { ...c, respaldos: { ...c.respaldos, [r]: valor } } : c)) })),
    cambiarPago: (id, pago) =>
      cambiar((s) => ({ ...s, compras: s.compras.map((c) => (c.id === id ? { ...c, pago: pago || null } : c)) })),
    agregar: (c) =>
      cambiar((s) => ({ ...s, compras: [...s.compras, { ...c, id: `n${Date.now()}`, respaldos: { cotizacion: true } }] })),
    marcarDocumento: (id, listo) =>
      cambiar((s) => ({ ...s, documentos: s.documentos.map((d) => (d.id === id ? { ...d, listo } : d)) })),
    presentar: (id, compras) =>
      cambiar((s) => ({ ...s, rendiciones: s.rendiciones.map((r) => (r.id === id ? { ...r, presentada: true, compras } : r)) })),
    marcarSubida: (id, subida) =>
      cambiar((s) => ({ ...s, rendiciones: s.rendiciones.map((r) => (r.id === id ? { ...r, subida } : r)) })),
    reiniciar: () => cambiar(inicial),
  };
}

// Preguntas abiertas de la propuesta, para resolver en la reunión.
export const DUDAS = [
  { tema: 'Reglamento', texto: 'La «certificación de la compra o contratación» (art. 8): ¿tiene formato oficial o basta una hoja firmada por el representante legal?' },
  { tema: 'Fechas', texto: '¿Desde qué fecha se pueden emitir boletas (decreto o acuerdo del Concejo)? ¿Cuándo llega la plata, para calcular la primera rendición?' },
  { tema: 'Cuotas', texto: '¿El fondo llega en una o varias cuotas? Si son varias, para pedir la siguiente hay que rendir al menos 75%.' },
  { tema: 'Montos', texto: '¿Bienes y Otros gastos se aprobaron con IVA? ¿Qué pasa con el subtotal impreso de $2.494.600, si la suma da $2.450.000?' },
  { tema: 'Entregas', texto: 'Las poleras y otros bienes que se entregan a los participantes, ¿exigen siempre la nómina del art. 10 con cédula, domicilio y firma?' },
  { tema: 'Respaldos', texto: '¿Basta el comprobante de transferencia o piden además la cartola del mes? ¿El comprobante de ingreso del art. 2 tiene formato propio?' },
  { tema: 'Reintegros', texto: 'Si un ítem queda con saldo, ¿cómo se informa el reintegro y cuándo?' },
  { tema: 'Originales', texto: '¿Basta con copias digitales en la app y los originales en papel con el tesorero, o conviene firma electrónica avanzada?' },
  { tema: 'Reembolsos', texto: 'Si alguien paga con su tarjeta y el club le devuelve, el reglamento no lo acepta (art. 9). ¿Hay alguna excepción?' },
  { tema: 'Actividades', texto: '¿Falta algo en los respaldos? Por ejemplo, fotos o listas de asistencia de las sesiones.' },
];
