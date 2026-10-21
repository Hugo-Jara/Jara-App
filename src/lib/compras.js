import { useCallback, useEffect, useState } from 'react';
import { esDemo, llamar } from './supabase.js';
import { desdeFila, subir, BUCKET_COMPROBANTES } from './pedido.js';

// Compras dentro de la app, con cuenta. Son las mismas listas y compras del
// link de pedido: lo que se pide acá aparece en el link y al revés.
// Cada socio ve sus compras; Hacienda, los administradores y quien tiene el
// permiso 've_compras' ven todas.

export const TOPICOS = { fondo: 'Fondo', veinte_anos: '20 años', general: 'General' };

const lista = (l) => ({ id: l.id, nombre: l.nombre, topico: l.topico, abierto: l.abierto, carpeta: l.carpeta, token: l.token });

// Los datos de una compra, con sus archivos ya subidos a la carpeta de la lista.
async function datos(carpeta, d, anterior) {
  const cot = (await subir(carpeta, d.cotizacionArchivo)) || anterior?.cotizacion;
  const ref = (await subir(carpeta, d.referenciaArchivo)) || anterior?.referenciaArchivo;
  return {
    p_que: d.que, p_monto: d.monto,
    p_cotizacion_ruta: cot?.ruta ?? null, p_cotizacion_nombre: cot?.nombre ?? null,
    p_referencia: d.referencia || null,
    p_referencia_ruta: ref?.ruta ?? null, p_referencia_nombre: ref?.nombre ?? null,
  };
}

function useComprasReal() {
  const [estado, setEstado] = useState({ cargando: true, error: '', datos: null });

  const cargar = useCallback(async () => {
    try {
      const c = await llamar('compras_ver');
      setEstado({
        cargando: false, error: '',
        datos: { veTodas: c.ve_todas, esHacienda: c.es_hacienda, puedoVerComprobantes: c.puedo_ver_comprobantes,
                 listas: c.listas.map(lista), items: c.items.map(desdeFila) },
      });
    } catch (e) {
      setEstado((s) => ({ ...s, cargando: false, error: e.message }));
    }
  }, []);

  useEffect(() => {
    cargar();
    const alVolver = () => document.visibilityState === 'visible' && cargar();
    document.addEventListener('visibilitychange', alVolver);
    return () => document.removeEventListener('visibilitychange', alVolver);
  }, [cargar]);

  const y = (f) => async (...a) => { await f(...a); await cargar(); };
  return {
    ...estado,
    recargar: cargar,
    agregar: y(async (l, d) => llamar('compra_agregar', { p_pedido: l.id, ...(await datos(l.carpeta, d)) })),
    corregir: y(async (item, d) => llamar('compra_corregir', { p_item: item.id, ...(await datos(item.carpeta, d, item)) })),
    revisar: y((id, accion, comentario) => llamar('compra_revisar', { p_item: id, p_accion: accion, p_comentario: comentario ?? null })),
    subirBoleta: y(async (id, file) => {
      const item = estado.datos.items.find((i) => i.id === id);
      const b = await subir(item.carpeta, file);
      await llamar('compra_boleta', { p_item: id, p_ruta: b.ruta, p_nombre: b.nombre });
    }),
    editar: y((id, d) => llamar('compra_editar', { p_item: id, p_quien: d.quien, p_que: d.que, p_monto: d.monto })),
    eliminar: y((id) => llamar('compra_eliminar', { p_item: id })),
    subirComprobante: y(async (id, file) => {
      const item = estado.datos.items.find((i) => i.id === id);
      const c = await subir(item.carpeta, file, BUCKET_COMPROBANTES);
      await llamar('compra_comprobante', { p_item: id, p_ruta: c.ruta, p_nombre: c.nombre });
    }),
    cambiarLista: y((id, topico, abierto) => llamar('lista_compras_cambiar', { p_pedido: id, p_topico: topico, p_abierto: abierto })),
  };
}

// --- Modo demostración: mismo comportamiento, en memoria --------------------
const local = (file) => (file ? { nombre: file.name, url: URL.createObjectURL(file) } : null);
const compraDemo = (id, pedidoId, quien, que, monto, estado, esMia = false, extra = {}) => ({
  id, pedidoId, quien, que, monto, estado, esMia, referencia: 'https://ejemplo.cl',
  cotizacion: { nombre: 'cotizacion.pdf' }, referenciaArchivo: null, boleta: null, comprobante: null, conComprobante: false, ...extra,
});
let demo = {
  veTodas: true, esHacienda: true, puedoVerComprobantes: true,
  listas: [
    { id: 'l1', nombre: 'Fiesta 20 años', topico: 'veinte_anos', abierto: true, token: 'demo-20' },
    { id: 'l2', nombre: 'Compras generales', topico: 'general', abierto: true, token: 'demo-general' },
    { id: 'l3', nombre: 'Fondo Las Condes', topico: 'fondo', abierto: true, token: 'demo-fondo' },
  ],
  items: [
    compraDemo(1, 'l1', 'Pancho', 'Carne para el asado (25 kg)', 187500, 'aprobado'),
    compraDemo(2, 'l2', 'Jugador de ejemplo', 'Conos y petos', 45000, 'pendiente', true),
    compraDemo(3, 'l3', 'Lalo', 'Balones de entrenamiento', 120000, 'devuelto', false, { comentario: 'Falta una segunda cotización.' }),
  ],
};

function useComprasDemo() {
  const [d, setD] = useState(demo);
  const guardar = (cambio) => { demo = { ...demo, ...cambio }; setD(demo); };
  const cambiar = (id, c) => guardar({ items: demo.items.map((i) => (i.id === id ? { ...i, ...c } : i)) });
  const desde = (x, anterior) => ({
    que: x.que, monto: x.monto, referencia: x.referencia,
    cotizacion: local(x.cotizacionArchivo) || anterior?.cotizacion,
    referenciaArchivo: local(x.referenciaArchivo) || anterior?.referenciaArchivo || null,
  });
  return {
    cargando: false, error: '', datos: d, recargar: async () => {},
    agregar: async (l, x) => guardar({ items: [{ ...compraDemo(Date.now(), l.id, 'Jugador de ejemplo', '', 0, 'pendiente', true), ...desde(x) }, ...demo.items] }),
    corregir: async (item, x) => cambiar(item.id, { ...desde(x, item), estado: 'pendiente', comentario: undefined }),
    revisar: async (id, accion, comentario) =>
      cambiar(id, { estado: { aprobar: 'aprobado', devolver: 'devuelto', entregar: 'entregado' }[accion], comentario }),
    subirBoleta: async (id, file) => cambiar(id, { estado: 'respaldado', boleta: local(file) }),
    editar: async (id, x) => cambiar(id, { quien: x.quien, que: x.que, monto: x.monto }),
    eliminar: async (id) => guardar({ items: demo.items.filter((i) => i.id !== id) }),
    subirComprobante: async (id, file) => {
      const actual = demo.items.find((i) => i.id === id).estado;
      cambiar(id, { estado: actual === 'aprobado' ? 'entregado' : actual, comprobante: local(file), conComprobante: true });
    },
    cambiarLista: async (id, topico, abierto) => guardar({ listas: demo.listas.map((l) => (l.id === id ? { ...l, topico, abierto } : l)) }),
  };
}

export const useCompras = esDemo ? useComprasDemo : useComprasReal;
