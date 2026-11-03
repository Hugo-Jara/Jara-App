import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { esDemo, llamar, supabase } from './supabase.js';
import { subir } from './pedido.js';

// Fondo Concursable Las Condes 2026 (Compras 2).
// Con la base conectada se lleva de verdad: lo ven solo los administradores,
// Hacienda y quien tiene el permiso 'equipo_fondo' (ver la migración 0021).
// Sin base (modo demostración) es la vista previa de siempre, en memoria.
// Solo categorías y montos del presupuesto: nada de datos personales.

export const FONDO = {
  nombre: 'Fondo Las Condes 2026',
  proyecto: 'Entrenamientos Funcionales Hugo Jara',
  municipio: 3087500,
  aportePropio: 450000,
  desde: '2026-10-01',
  hasta: '2026-12-28',
};

// En la base viven en fondo_items; esto es solo para el modo demostración.
const ITEMS_DEMO = [
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

// Respaldos que pide el reglamento (Decreto Alcaldicio N°749, 2024). Las mismas
// listas están en fondo_respaldos_de() de la migración 0021.
// enPapel: se marca sin subir archivo (la nómina trae cédula y domicilio).
const RESPALDOS_COMPRA = [
  { id: 'cotizacion', nombre: 'Cotización', nota: 'La que se subió al pedir la compra' },
  { id: 'boleta', nombre: 'Boleta o factura electrónica', nota: 'A nombre del club, con detalle (art. 8)' },
  { id: 'comprobante', nombre: 'Comprobante de pago', nota: 'Con N° de documento y monto (art. 8)' },
  { id: 'certificacion', nombre: 'Certificación de la compra', nota: 'Basta una hoja firmada por el representante legal (art. 8)' },
];
const NOMINA = { id: 'nomina', nombre: 'Nómina de entrega firmada', nota: 'Nombre, cédula, domicilio y firma (art. 10). Queda solo en papel', enPapel: true };
const ORIGINAL = { id: 'original', nombre: 'Original archivado, firmado y timbrado', nota: 'Lo guarda el tesorero (arts. 12–16)', enPapel: true };
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

// Por qué un gasto no se puede rendir, o null si se puede.
export function motivoNoRendible(c) {
  if (c.pago === 'particular') return 'Pagó un particular: el reglamento solo acepta pagos con la cuenta o el débito del club (art. 9).';
  if (c.fecha && c.fecha < FONDO.desde) return 'La boleta es anterior a la fecha desde la que se puede gastar el fondo (art. 5).';
  return null;
}

// Igual que fondo_estado() de la base; en la app real el estado viene de ahí.
function estadoDe(c) {
  if (motivoNoRendible(c)) return 'no_rendible';
  if (c.rendicion) return 'rendida';
  const completa = c.pago && respaldosDe(c).every((r) => c.respaldos[r.id]);
  return completa ? 'lista' : 'pendiente';
}

// Los honorarios de meses que no han pasado no cuentan como gastados todavía.
export const cuentaComoGasto = (c) => c.item !== 'personal' || !!c.pago;

// Lo que ven las pantallas, con los totales calculados. Igual en los dos modos.
function resumir({ items, compras, documentos, rendiciones, porClasificar }) {
  const porItem = items.map((it) => {
    const delItem = compras.filter((c) => c.item === it.id && cuentaComoGasto(c) && c.estado !== 'no_rendible');
    const gastado = delItem.reduce((t, c) => t + c.monto, 0);
    const excedido = Math.max(0, gastado - it.aprobado);
    let situacion = 'sin_gastos';
    if (excedido > 0) situacion = 'excedido';
    else if (delItem.some((c) => c.estado === 'pendiente')) situacion = 'faltan';
    else if (delItem.length) situacion = 'al_dia';
    return { ...it, gastado, disponible: Math.max(0, it.aprobado - gastado), excedido, situacion };
  });
  const gastado = porItem.reduce((t, i) => t + Math.min(i.gastado, i.aprobado), 0);
  return {
    items, compras, documentos, porClasificar, porItem, gastado,
    disponible: FONDO.municipio - gastado,
    rendiciones: rendiciones.map((r) => ({ ...r, compras: compras.filter((c) => c.rendicion === r.id).map((c) => c.id) })),
    // Lo que entraría en la rendición que está abierta: lo listo que no se ha rendido.
    paraRendir: compras.filter((c) => c.estado === 'lista'),
  };
}

// ---------------------------------------------------------------------------
// Con la base conectada
// ---------------------------------------------------------------------------
const BUCKET_FONDO = 'fondo';

// Un respaldo marcado es true, o el archivo si se subió uno. Los que ya están
// en Compras (cotización, boleta, comprobante) llegan marcados y no se tocan acá.
const gastoDesdeFila = (g) => {
  const respaldos = Object.fromEntries(g.marcados.map((t) => [t, true]));
  for (const [t, a] of Object.entries(g.respaldos)) if (a.ruta) respaldos[t] = { ruta: a.ruta, nombre: a.nombre };
  const enCompras = g.compra
    ? ['cotizacion', 'boleta', 'comprobante'].filter((t) => (t === 'comprobante' ? g.compra.con_comprobante : g.compra[`${t}_ruta`]) && !g.respaldos[t])
    : [];
  return {
    id: g.id, item: g.item, que: g.que, monto: g.monto, proveedor: g.proveedor ?? '', documento: g.documento ?? '',
    fecha: g.fecha, pago: g.pago, entrega: g.entrega, mes: g.mes, rendicion: g.rendicion, estado: g.estado,
    respaldos, enCompras, compra: g.compra ? { quien: g.compra.quien, estado: g.compra.estado } : null,
  };
};

// Dirección para abrir un respaldo del fondo, válida por 10 minutos.
export async function enlaceFondo(ruta) {
  const { data, error } = await supabase.storage.from(BUCKET_FONDO).createSignedUrl(ruta, 600);
  if (error) throw new Error('No pudimos abrir el archivo. Entra con una cuenta del equipo del fondo.');
  return data.signedUrl;
}

const paramsGasto = (id, d) => ({
  p_gasto: id, p_item: d.item, p_que: d.que, p_monto: d.monto,
  p_proveedor: d.proveedor || null, p_documento: d.documento || null, p_fecha: d.fecha || null,
  p_pago: d.pago || null, p_entrega: !!d.entrega,
});

function useFondoReal() {
  const [estado, setEstado] = useState({ cargando: true, error: '', datos: null });

  const cargar = useCallback(async () => {
    try {
      const f = await llamar('fondo_ver');
      setEstado({
        cargando: false, error: '',
        datos: { items: f.items, compras: f.gastos.map(gastoDesdeFila), documentos: f.documentos,
                 rendiciones: f.rendiciones, porClasificar: f.por_clasificar },
      });
    } catch (e) {
      setEstado((s) => ({ ...s, cargando: false, error: e.message }));
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const y = (f) => async (...a) => { await f(...a); await cargar(); };
  return {
    cargando: estado.cargando, error: estado.error, esEjemplo: false,
    ...(estado.datos ? resumir(estado.datos) : {}),
    marcarRespaldo: y(async (id, tipo, valor, file) => {
      const a = valor && file ? await subir(id, file, BUCKET_FONDO) : null;
      await llamar('fondo_respaldo', { p_gasto: id, p_tipo: tipo, p_marcado: valor, p_ruta: a?.ruta ?? null, p_nombre: a?.nombre ?? null });
    }),
    guardar: y((id, d) => llamar('fondo_gasto_guardar', paramsGasto(id, d))),
    agregar: y((d) => llamar('fondo_gasto_guardar', paramsGasto(null, d))),
    clasificar: y((compra, item, entrega) => llamar('fondo_clasificar', { p_compra: compra, p_item: item, p_entrega: !!entrega })),
    quitar: y((id) => llamar('fondo_gasto_quitar', { p_gasto: id })),
    marcarDocumento: y(async (id, listo, file) => {
      const a = listo && file ? await subir('documentos', file, BUCKET_FONDO) : null;
      await llamar('fondo_documento', { p_slug: id, p_listo: listo, p_ruta: a?.ruta ?? null, p_nombre: a?.nombre ?? null });
    }),
    presentar: y((id) => llamar('fondo_presentar', { p_rendicion: id })),
    marcarSubida: y((id, subida) => llamar('fondo_subida', { p_rendicion: id, p_subida: subida })),
  };
}

// ¿Muestro el fondo en "Más"? Pregunta a la base; en demo, sí.
export function useAccesoFondo() {
  const [acceso, setAcceso] = useState(esDemo);
  useEffect(() => {
    if (esDemo) return;
    llamar('fondo_acceso').then((a) => setAcceso(!!a), () => setAcceso(false));
  }, []);
  return acceso;
}

// ---------------------------------------------------------------------------
// Modo demostración: mismo comportamiento, en memoria
// ---------------------------------------------------------------------------
const marcados = (...ids) => Object.fromEntries(ids.map((i) => [i, true]));
const inicial = () => ({
  compras: [
    { id: 'c1', item: 'bienes', que: 'Poleras de entrenamiento (63)', monto: 1124550, proveedor: 'Proveedor de ejemplo', documento: '4821', fecha: '2026-10-12', pago: 'transferencia', entrega: true,
      respaldos: marcados('cotizacion', 'boleta', 'comprobante'), enCompras: ['cotizacion'], compra: { quien: 'Socio de ejemplo', estado: 'respaldado' } },
    { id: 'c2', item: 'otros', que: 'Bebidas isotónicas', monto: 96000, proveedor: 'Distribuidora de ejemplo', documento: '10233', fecha: '2026-10-20', pago: 'debito', entrega: false,
      respaldos: marcados('cotizacion', 'boleta', 'comprobante', 'certificacion', 'original'), enCompras: [] },
    { id: 'c3', item: 'otros', que: 'Insumos para el botiquín', monto: 38000, proveedor: 'Farmacia de ejemplo', documento: '5521', fecha: '2026-10-15', pago: 'particular', entrega: false,
      respaldos: marcados('cotizacion', 'boleta'), enCompras: [] },
    { id: 'h10', item: 'personal', mes: 10, que: 'Honorarios entrenador · octubre', monto: 212500, proveedor: 'Entrenador', documento: '31', fecha: '2026-10-31', pago: 'transferencia', entrega: false,
      respaldos: marcados('boleta', 'comprobante', 'f29', 'certificacion', 'original'), enCompras: [] },
    { id: 'h11', item: 'personal', mes: 11, que: 'Honorarios entrenador · noviembre', monto: 212500, proveedor: 'Entrenador', documento: '', fecha: null, pago: null, entrega: false, respaldos: {}, enCompras: [] },
    { id: 'h12', item: 'personal', mes: 12, que: 'Honorarios entrenador · diciembre', monto: 212500, proveedor: 'Entrenador', documento: '', fecha: null, pago: null, entrega: false, respaldos: {}, enCompras: [] },
  ],
  porClasificar: [{ id: 'p1', quien: 'Socio de ejemplo', que: 'Balones n° 5 (22)', monto: 550000, estado: 'pendiente' }],
  documentos: [
    { id: 'cartola', nombre: 'Cartola con el depósito del fondo', nota: 'Art. 23', listo: true },
    { id: 'ingreso', nombre: 'Comprobante de ingreso firmado', nota: 'Firmado por el representante legal (art. 2)', listo: false },
  ],
  rendiciones: [
    { id: 1, nombre: 'Rendición 1', plazo: 'Dos meses desde que llega la plata', presentada: false, subida: false },
    { id: 2, nombre: 'Rendición 2 (final)', plazo: 'Antes del 30 de diciembre', presentada: false, subida: false },
  ],
});

let demo = inicial();
const oyentes = new Set();
const cambiar = (f) => { demo = f(demo); oyentes.forEach((o) => o()); };
const suscribir = (o) => { oyentes.add(o); return () => oyentes.delete(o); };
const enGasto = (id, f) => cambiar((s) => ({ ...s, compras: s.compras.map((c) => (c.id === id ? f(c) : c)) }));
const local = (file) => (file ? { nombre: file.name, url: URL.createObjectURL(file) } : true);

function useFondoDemo() {
  const e = useSyncExternalStore(suscribir, () => demo);
  const compras = e.compras.map((c) => ({ ...c, estado: estadoDe(c) }));
  return {
    cargando: false, error: '', esEjemplo: true,
    ...resumir({ ...e, items: ITEMS_DEMO, compras }),
    marcarRespaldo: async (id, r, valor, file) =>
      enGasto(id, (c) => ({ ...c, respaldos: { ...c.respaldos, [r]: valor ? local(file) : undefined } })),
    guardar: async (id, d) => enGasto(id, (c) => ({ ...c, ...d })),
    agregar: async (d) => cambiar((s) => ({ ...s, compras: [...s.compras, { ...d, id: `n${Date.now()}`, respaldos: {}, enCompras: [] }] })),
    clasificar: async (compraId, item, entrega) => cambiar((s) => {
      const p = s.porClasificar.find((x) => x.id === compraId);
      return {
        ...s,
        porClasificar: s.porClasificar.filter((x) => x.id !== compraId),
        compras: [...s.compras, { id: `n${Date.now()}`, item, que: p.que, monto: p.monto, proveedor: '', documento: '', fecha: null,
                                  pago: null, entrega: !!entrega, respaldos: marcados('cotizacion'), enCompras: ['cotizacion'],
                                  compra: { quien: p.quien, estado: p.estado } }],
      };
    }),
    quitar: async (id) => cambiar((s) => ({ ...s, compras: s.compras.filter((c) => c.id !== id) })),
    marcarDocumento: async (id, listo) =>
      cambiar((s) => ({ ...s, documentos: s.documentos.map((d) => (d.id === id ? { ...d, listo } : d)) })),
    presentar: async (id) => cambiar((s) => {
      const listas = new Set(s.compras.filter((c) => estadoDe(c) === 'lista').map((c) => c.id));
      return {
        ...s,
        compras: s.compras.map((c) => (listas.has(c.id) ? { ...c, rendicion: id } : c)),
        rendiciones: s.rendiciones.map((r) => (r.id === id ? { ...r, presentada: true } : r)),
      };
    }),
    marcarSubida: async (id, subida) =>
      cambiar((s) => ({ ...s, rendiciones: s.rendiciones.map((r) => (r.id === id ? { ...r, subida } : r)) })),
    reiniciar: () => cambiar(inicial),
  };
}

export const useFondo = esDemo ? useFondoDemo : useFondoReal;
