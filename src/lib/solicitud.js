import { useCallback, useEffect, useState } from 'react';
import { esDemo, llamar } from './supabase.js';
import { subir } from './pedido.js';

// Link público de un tópico: se envía una solicitud de compra sin cuenta. Solo
// sirve para enviar; quien la manda no ve ni corrige nada después.

function useTopicoReal(token) {
  const [estado, setEstado] = useState({ cargando: true, error: '', topico: null });
  const cargar = useCallback(async () => {
    try {
      const t = await llamar('topico_publico', { p_token: token });
      setEstado({ cargando: false, error: '', topico: { nombre: t.nombre, carpeta: t.carpeta } });
    } catch (e) {
      setEstado({ cargando: false, error: e.message, topico: null });
    }
  }, [token]);
  useEffect(() => { cargar(); }, [cargar]);

  return {
    ...estado, recargar: cargar,
    enviar: async (d) => {
      const carpeta = estado.topico.carpeta;
      const cot = await subir(carpeta, d.cotizacionArchivo);
      const ref = await subir(carpeta, d.referenciaArchivo);
      await llamar('topico_enviar', {
        p_token: token, p_quien: d.quien, p_que: d.que, p_monto: d.monto,
        p_cotizacion_ruta: cot?.ruta ?? null, p_cotizacion_nombre: cot?.nombre ?? null,
        p_referencia: d.referencia || null,
        p_referencia_ruta: ref?.ruta ?? null, p_referencia_nombre: ref?.nombre ?? null,
      });
    },
  };
}

// Modo demostración: se ve el formulario, pero no se envía nada.
const useTopicoDemo = () => ({
  cargando: false, error: '', topico: { nombre: 'Fiesta 20 años', carpeta: 'demo' },
  recargar: async () => {}, enviar: async () => {},
});

export const useTopico = esDemo ? useTopicoDemo : useTopicoReal;
