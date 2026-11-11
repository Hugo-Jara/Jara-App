// Recuerda, en este aparato, si la persona ya entra con contraseña, para
// mostrarle ese camino primero. Quien llega por primera vez ve Google y el
// link al correo. Si el navegador no deja guardar (modo privado), no pasa nada.
const CLAVE = 'jara-entra-con-clave';

export const entraConClave = () => {
  try { return localStorage.getItem(CLAVE) === '1'; } catch { return false; }
};

export const recordarClave = () => {
  try { localStorage.setItem(CLAVE, '1'); } catch { /* sin almacenamiento: no se recuerda */ }
};
