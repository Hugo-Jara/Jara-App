// Cuentas de prueba: el selector "Ver como" (migración 0022).
// La lista de roles de cada cuenta se pone solo por SQL; desde aquí solo se
// elige uno de esa lista y la base hace el cambio.
import { llamar } from './supabase.js';

export const ROLES_PRUEBA = {
  socio: { nombre: 'Socio', desc: 'Sin permisos, como cualquier socio' },
  equipo_fondo: { nombre: 'Equipo del fondo', desc: 'Ve y trabaja el Fondo Las Condes (no presenta rendiciones)' },
  hacienda: { nombre: 'Hacienda', desc: 'Solo mirar: no aprueba, no paga y no abre comprobantes' },
  anota_partidos: { nombre: 'Anota partidos', desc: 'Resultados y estadísticas de cualquier plantel' },
  entrenamientos: { nombre: 'Entrenamientos', desc: 'Abre listas y marca pagos de entrenamiento' },
  tesorero: { nombre: 'Tesorero', desc: 'Tesorero de un plantel, para ver el tablero' },
  comunicaciones: { nombre: 'Comunicaciones', desc: 'Módulo de noticias y boletín' },
};

export const nombreRol = (rol) => ROLES_PRUEBA[rol]?.nombre ?? 'Socio';

// Cambia de rol y recarga la app entera, para que ninguna pantalla quede con
// los permisos del rol anterior.
export async function verComo(rol, equipo = null) {
  await llamar('prueba_ver_como', { p_rol: rol, p_equipo: equipo });
  window.location.reload();
}
