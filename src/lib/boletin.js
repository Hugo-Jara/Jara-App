import { llamar, supabase } from './supabase.js';
import { componerEdicion } from './boletinComposicion.js';
const fotosSubidas = new Map();
const bucket = () => supabase.storage.from('boletin');
const resultado = r => { if (r.error) throw new Error(r.error.message); return r.data; };
export const paginaRuta = (carpeta, n) => `${carpeta}/pagina-${String(n).padStart(2, '0')}.png`;
export const catalogo = () => llamar('boletin_catalogo');
export const ultimaEdicion = () => llamar('boletin_ultima');
export const obtenerEdicion = id => llamar('boletin_edicion', { p_id: id });
export const retirarEdicion = id => llamar('boletin_retirar', { p_id: id });
export async function urlArchivo(ruta) { return resultado(await bucket().createSignedUrl(ruta, 3600)).signedUrl; }
export async function contenidoEditable(ficha) {
  const e = structuredClone(ficha.contenido);
  for (const b of e.bloques) for (const n of b.notas) for (const f of n.fotos) {
    if (f.ruta) {
      const blob = resultado(await bucket().download(f.ruta));
      f.src = await new Promise((resolve, reject) => { const lector = new FileReader(); lector.onload = () => resolve(lector.result); lector.onerror = () => reject(new Error('No pudimos leer la fotografía.')); lector.readAsDataURL(blob); });
    }
  }
  return e;
}
const parametros = e => ({ p_id: e.id, p_numero: e.numero, p_titulo: e.nombre, p_resumen: e.resumen, p_fecha: e.periodo });
export async function guardarEdicion(edicion) {
  const e = structuredClone(edicion);
  // La fila debe existir antes de subir: Storage revisa su pertenencia al club.
  const guardar = contenido => llamar('boletin_guardar', { ...parametros(e), p_contenido: contenido });
  const pendiente = structuredClone(e);
  for (const b of pendiente.bloques) for (const n of b.notas) n.fotos = n.fotos.filter(f => f.ruta).map(({ src, ...f }) => f);
  const existente = await catalogo();
  if (!existente.some(f => f.id === e.id)) await guardar(pendiente);
  for (const b of e.bloques) for (const n of b.notas) for (const f of n.fotos) {
    if (!f.ruta && fotosSubidas.has(`${e.id}/${f.id}/${f.src}`)) f.ruta = fotosSubidas.get(`${e.id}/${f.id}/${f.src}`);
    if (!f.ruta && f.src) {
      const img = new Image(); img.src = f.src; await img.decode();
      const canvas = document.createElement('canvas'); canvas.width = img.width; canvas.height = img.height;
      canvas.getContext('2d').drawImage(img, 0, 0);
      const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', .9));
      if (!blob || blob.size > 10485760) throw new Error('Reduce la fotografía: el máximo para guardar es 10 MB.');
      f.ruta = `${e.id}/fotos/${crypto.randomUUID()}.jpg`;
      resultado(await bucket().upload(f.ruta, blob, { contentType: 'image/jpeg' }));
      fotosSubidas.set(`${e.id}/${f.id}/${f.src}`, f.ruta);
    }
    delete f.src;
  }
  await guardar(e);
  // Conserva las rutas para los guardados posteriores, sin guardar URLs firmadas.
  return e;
}
async function borrarCarpeta(carpeta) {
  while (true) {
    const archivos = resultado(await bucket().list(carpeta, { limit: 100 }));
    if (!archivos.length) return;
    for (const a of archivos) {
      if (a.id) resultado(await bucket().remove([`${carpeta}/${a.name}`]));
      else await borrarCarpeta(`${carpeta}/${a.name}`);
    }
  }
}
export async function eliminarEdicion(e, numero) {
  if (String(e.numero) !== numero.trim()) throw new Error('El número no coincide.');
  if (e.estado === 'publicada') throw new Error('Primero retira la edición.');
  await borrarCarpeta(e.id);
  await llamar('boletin_eliminar', { p_id: e.id, p_numero_confirmado: e.numero });
}
export async function publicarPaginas(ficha, blobs) {
  if (!blobs.length || blobs.length > 40) throw new Error('La edición debe tener entre 1 y 40 páginas.');
  const version = ficha.version + 1;
  for (let i = 0; i < blobs.length; i++) {
    if (!blobs[i] || blobs[i].size > 10485760) throw new Error(`La página ${i + 1} supera 10 MB o no se pudo generar.`);
    resultado(await bucket().upload(paginaRuta(`${ficha.id}/v${version}`, i + 1), blobs[i], { contentType: 'image/png', upsert: true }));
  }
  const publicada = await llamar('boletin_publicar', { p_id: ficha.id, p_version: version, p_paginas: blobs.length });
  // La publicación ya está confirmada: una limpieza fallida no debe indicar que falló.
  if (publicada.version_anterior) await borrarCarpeta(`${ficha.id}/v${publicada.version_anterior}`).catch(() => {});
  return publicada;
}
export async function publicarEdicion(e) {
  await guardarEdicion(e);
  const paginas = await componerEdicion(e, { demostrativa: false });
  const blobs = await Promise.all(paginas.map(p => new Promise(r => p.toBlob(r, 'image/png'))));
  return publicarPaginas(await obtenerEdicion(e.id), blobs);
}
export const crearHistorica = e => llamar('boletin_crear_historica', parametros(e));
export async function republicarHistorica(e) {
  const blobs = [];
  for (let i = 1; i <= e.paginas; i++) blobs.push(resultado(await bucket().download(paginaRuta(e.carpeta, i))));
  return publicarPaginas(e, blobs);
}
