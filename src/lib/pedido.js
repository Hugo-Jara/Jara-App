import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { supabase, esDemo } from './supabase.js';

// Pedido de compras: una lista por evento donde cada persona agrega lo que
// quiere comprar con su cotización y su referencia. La suma es lo que se le
// pide a Hacienda. Se entra con un link, sin cuenta.

export const ESTADOS = {
  pendiente: 'Por revisar',
  aprobado: 'Aprobado',
  devuelto: 'Devuelto',
  entregado: 'Plata entregada',
  respaldado: 'Con boleta',
};

// Lo devuelto no suma: todavía no es un pedido válido.
export function totales(items) {
  const suma = (filtro) => items.filter(filtro).reduce((t, i) => t + i.monto, 0);
  return {
    pedido: suma((i) => i.estado !== 'devuelto'),
    aprobado: suma((i) => ['aprobado', 'entregado', 'respaldado'].includes(i.estado)),
    entregado: suma((i) => ['entregado', 'respaldado'].includes(i.estado)),
    respaldado: suma((i) => i.estado === 'respaldado'),
  };
}

export const pesos = (n) => `$${Math.round(n).toLocaleString('es-CL')}`;

// ---------------------------------------------------------------------------
// Con la base conectada
// ---------------------------------------------------------------------------
const BUCKET = 'pedidos';
const archivo = (ruta, nombre) =>
  ruta ? { nombre, url: supabase.storage.from(BUCKET).getPublicUrl(ruta).data.publicUrl, ruta } : null;

const desdeFila = (f) => ({
  id: f.id, quien: f.quien, que: f.que, monto: f.monto,
  referencia: f.referencia || '',
  cotizacion: archivo(f.cotizacion_ruta, f.cotizacion_nombre),
  referenciaArchivo: archivo(f.referencia_ruta, f.referencia_nombre),
  boleta: archivo(f.boleta_ruta, f.boleta_nombre),
  // El archivo del comprobante solo llega con el link de Hacienda; el resto
  // solo sabe si existe.
  comprobante: archivo(f.comprobante_ruta, f.comprobante_nombre),
  conComprobante: !!f.con_comprobante,
  estado: f.estado, comentario: f.comentario,
});

async function subir(carpeta, file) {
  if (!file) return null;
  const limpio = file.name.normalize('NFD').replace(/[^\w.-]+/g, '_').slice(-60);
  const ruta = `${carpeta}/${crypto.randomUUID()}-${limpio}`;
  const { error } = await supabase.storage.from(BUCKET).upload(ruta, file, { contentType: file.type });
  if (error) throw new Error('No se pudo subir el archivo. Revisa que sea una foto o un PDF de menos de 10 MB.');
  return { ruta, nombre: file.name };
}

async function llamar(funcion, parametros) {
  const { data, error } = await supabase.rpc(funcion, parametros);
  if (error) throw new Error(error.message);
  return data;
}

function usePedidoReal(token) {
  const [estado, setEstado] = useState({ cargando: true, error: '', pedido: null });

  const cargar = useCallback(async () => {
    try {
      const p = await llamar('pedido_ver', { p_token: token });
      setEstado({
        cargando: false, error: '',
        pedido: { nombre: p.nombre, abierto: p.abierto, esHacienda: p.es_hacienda, carpeta: p.carpeta, items: p.items.map(desdeFila) },
      });
    } catch (e) {
      setEstado((s) => ({ ...s, cargando: false, error: e.message }));
    }
  }, [token]);

  useEffect(() => {
    cargar();
    // Al volver a la página (por ejemplo desde WhatsApp) se trae lo nuevo.
    const alVolver = () => document.visibilityState === 'visible' && cargar();
    document.addEventListener('visibilitychange', alVolver);
    return () => document.removeEventListener('visibilitychange', alVolver);
  }, [cargar]);

  const carpeta = estado.pedido?.carpeta;
  const datos = async (d, anterior) => {
    const cot = (await subir(carpeta, d.cotizacionArchivo)) || anterior?.cotizacion;
    const ref = (await subir(carpeta, d.referenciaArchivo)) || anterior?.referenciaArchivo;
    return {
      p_token: token, p_quien: d.quien, p_que: d.que, p_monto: d.monto,
      p_cotizacion_ruta: cot?.ruta ?? null, p_cotizacion_nombre: cot?.nombre ?? null,
      p_referencia: d.referencia || null,
      p_referencia_ruta: ref?.ruta ?? null, p_referencia_nombre: ref?.nombre ?? null,
    };
  };

  return {
    ...estado,
    agregar: async (d) => { await llamar('pedido_agregar', await datos(d)); await cargar(); },
    corregir: async (item, d) => { await llamar('pedido_corregir', { ...(await datos(d, item)), p_item: item.id }); await cargar(); },
    revisar: async (id, accion, comentario) => {
      await llamar('pedido_revisar', { p_token: token, p_item: id, p_accion: accion, p_comentario: comentario ?? null });
      await cargar();
    },
    subirBoleta: async (id, file) => {
      const b = await subir(carpeta, file);
      await llamar('pedido_boleta', { p_token: token, p_item: id, p_ruta: b.ruta, p_nombre: b.nombre });
      await cargar();
    },
    // Hacienda corrige nombre, glosa o monto; el valor anterior queda en el historial.
    editar: async (id, d) => {
      await llamar('pedido_editar', { p_token: token, p_item: id, p_quien: d.quien, p_que: d.que, p_monto: d.monto });
      await cargar();
    },
    // Deja de verse y de sumar, pero no se borra de la base.
    eliminar: async (id) => { await llamar('pedido_eliminar', { p_token: token, p_item: id }); await cargar(); },
    // Hacienda: en una compra aprobada además la deja como plata entregada.
    subirComprobante: async (id, file) => {
      const c = await subir(carpeta, file);
      await llamar('pedido_comprobante', { p_token: token, p_item: id, p_ruta: c.ruta, p_nombre: c.nombre });
      await cargar();
    },
  };
}

// ---------------------------------------------------------------------------
// Modo demostración: mismo comportamiento, en memoria
// ---------------------------------------------------------------------------
let demo = {
  nombre: 'Fiesta 20 años', abierto: true,
  items: [
    { id: 1, quien: 'Pancho', que: 'Carne para el asado (25 kg)', monto: 187500, referencia: 'https://ejemplo.cl/carniceria', cotizacion: { nombre: 'cotizacion-carne.pdf' }, referenciaArchivo: null, boleta: null, estado: 'aprobado' },
    { id: 2, quien: 'Lalo', que: 'Arriendo de parlantes y luces', monto: 90000, referencia: '', cotizacion: { nombre: 'cotizacion-audio.jpg' }, referenciaArchivo: { nombre: 'pantallazo-proveedor.png' }, boleta: null, estado: 'pendiente' },
    { id: 3, quien: 'Tito', que: 'Barra: bebidas y hielo', monto: 264000, referencia: 'https://ejemplo.cl/distribuidora', cotizacion: { nombre: 'pantallazo.png' }, referenciaArchivo: null, boleta: null, estado: 'devuelto', comentario: 'Falta el detalle por producto.' },
  ],
};
const oyentes = new Set();
const suscribir = (f) => { oyentes.add(f); return () => oyentes.delete(f); };
const guardar = (items) => { demo = { ...demo, items }; oyentes.forEach((f) => f()); };
const local = (file) => (file ? { nombre: file.name, url: URL.createObjectURL(file) } : null);

function usePedidoDemo(esHacienda) {
  const p = useSyncExternalStore(suscribir, () => demo);
  const cambiar = (id, cambios) => guardar(p.items.map((i) => (i.id === id ? { ...i, ...cambios } : i)));
  const desde = (d, anterior) => ({
    quien: d.quien, que: d.que, monto: d.monto, referencia: d.referencia,
    cotizacion: local(d.cotizacionArchivo) || anterior?.cotizacion,
    referenciaArchivo: local(d.referenciaArchivo) || anterior?.referenciaArchivo || null,
  });
  return {
    cargando: false, error: '',
    pedido: { ...p, esHacienda },
    agregar: async (d) => guardar([...p.items, { ...desde(d), id: Date.now(), boleta: null, estado: 'pendiente' }]),
    corregir: async (item, d) => cambiar(item.id, { ...desde(d, item), estado: 'pendiente', comentario: undefined }),
    revisar: async (id, accion, comentario) =>
      cambiar(id, { estado: { aprobar: 'aprobado', devolver: 'devuelto', entregar: 'entregado' }[accion], comentario }),
    subirBoleta: async (id, file) => cambiar(id, { estado: 'respaldado', boleta: local(file) }),
    editar: async (id, d) => cambiar(id, { quien: d.quien, que: d.que, monto: d.monto }),
    eliminar: async (id) => guardar(p.items.filter((i) => i.id !== id)),
    subirComprobante: async (id, file) => {
      const actual = p.items.find((i) => i.id === id).estado;
      cambiar(id, { estado: actual === 'aprobado' ? 'entregado' : actual, comprobante: local(file), conComprobante: true });
    },
  };
}

// `haciendaDemo` solo se usa en la demostración: con la base conectada, ser
// Hacienda o no depende del link con que se entró.
export const usePedido = esDemo
  ? (_token, haciendaDemo) => usePedidoDemo(haciendaDemo)
  : (token) => usePedidoReal(token);
