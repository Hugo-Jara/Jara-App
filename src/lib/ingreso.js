import { esDemo, llamar } from './supabase.js';
import { crearAlmacen } from './almacen.js';

// El ingreso de cada jugador: busca su nombre en la nómina, pide entrar y un
// encargado de su plantel (o un administrador) lo aprueba.

export const buscarEnNomina = (texto) => llamar('nomina_buscar', { p_texto: texto });
export const miSolicitud = () => llamar('ingreso_mi_estado');
export const cancelarSolicitud = () => llamar('ingreso_cancelar');
export const pedirIngreso = ({ personaId, nombre, equipos }) =>
  llamar('ingreso_solicitar', { p_persona: personaId ?? null, p_nombre: nombre ?? null, p_equipos: equipos ?? [] });

// --- Para quien aprueba -----------------------------------------------------
let demo = [
  { id: 's1', nombre: 'Jugador de ejemplo', email: 'ejemplo@correo.cl', equipos: ['Senior Sábado'], en_nomina: true },
  { id: 's2', nombre: 'Refuerzo nuevo', email: 'refuerzo@correo.cl', equipos: ['Senior Jueves', 'Junior Sábado'], en_nomina: false },
];
const cargar = async () =>
  (esDemo ? demo : await llamar('ingreso_pendientes')).map((s) => ({
    id: s.id, nombre: s.nombre, email: s.email, equipos: s.equipos, enNomina: s.en_nomina,
  }));
const almacen = crearAlmacen(cargar);
export const vaciarSolicitudes = almacen.vaciar;

export function useSolicitudes() {
  const { cargando, error, datos } = almacen.usar();
  return {
    cargando, error, solicitudes: datos ?? [],
    resolver: async (id, aprobar) => {
      if (esDemo) demo = demo.filter((s) => s.id !== id);
      else await llamar('ingreso_resolver', { p_solicitud: id, p_aprobar: aprobar });
      await almacen.recargar();
    },
  };
}
