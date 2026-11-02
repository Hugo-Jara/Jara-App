import { validarEdicion } from './boletinDatos.js';
let conexion;
function abrir() {
  if (!conexion) conexion = new Promise((resolve, reject) => {
    const r = indexedDB.open('jara-informa-demo', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('ediciones', { keyPath: 'id' });
    r.onsuccess = () => { const db = r.result; db.onversionchange = () => { db.close(); conexion = null; }; resolve(db); };
    r.onerror = () => { conexion = null; reject(r.error); };
    r.onblocked = () => { conexion = null; reject(new Error('Cierra las otras pestañas de Jara App y vuelve a intentar.')); };
  });
  return conexion;
}
async function operar(modo, accion) {
  const db = await abrir();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('ediciones', modo);
    const r = accion(tx.objectStore('ediciones'));
    tx.oncomplete = () => resolve(r.result);
    tx.onerror = tx.onabort = () => reject(tx.error || new Error('No se pudo guardar. Revisa el espacio disponible.'));
  });
}
export const listarBorradores = () => operar('readonly', s => s.getAll());
export const guardarBorrador = e => { validarEdicion(e); return operar('readwrite', s => s.put(e)); };
export const eliminarBorrador = id => operar('readwrite', s => s.delete(id));
export function descargar(blob, nombre) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = nombre; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
export function respaldar(e) { descargar(new Blob([JSON.stringify(e)], { type: 'application/json' }), `Jara-Informa-borrador-${e.numero}.json`); }
export async function leerFoto(archivo) {
  if (!/^image\/(png|jpeg|webp|gif)$/.test(archivo.type)) throw new Error('Usa fotografías JPG, PNG, WebP o GIF.');
  if (archivo.size > 20 * 1024 * 1024) throw new Error('Cada fotografía puede pesar hasta 20 MB.');
  const src = await new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => reject(new Error('No pudimos leer la fotografía.')); r.readAsDataURL(archivo); });
  const img = new Image(); img.src = src;
  try { await img.decode(); } catch { throw new Error('La fotografía está dañada o su formato no es compatible.'); }
  if (img.width * img.height > 40000000) throw new Error('La fotografía supera 40 megapíxeles. Reduce su resolución antes de cargarla.');
  return { id: crypto.randomUUID(), src, original: archivo.name, x: 50, y: 50, zoom: 1, pie: '' };
}
