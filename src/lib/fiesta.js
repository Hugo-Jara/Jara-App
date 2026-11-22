// Fotos y videos del carrete de los 20 años (0061). Algo temporal: la gente
// sube desde Inicio y todos miran en /fiesta-20.
//
// Para apagarlo antes de tiempo: MOSTRAR_FIESTA = false (se esconde la
// tarjeta de Inicio y la página). Igual se esconde sola desde HASTA.
import { useCallback, useEffect, useState } from 'react';
import { supabase, esDemo, llamar } from './supabase.js';

export const MOSTRAR_FIESTA = true;
// Igual que fiesta_abierta() en la base: fin del domingo 30 de noviembre (Chile).
// La galería se puede seguir mirando una semana más.
export const SUBIR_HASTA = new Date('2026-12-01T00:00:00-03:00');
export const MIRAR_HASTA = new Date('2026-12-08T00:00:00-03:00');
export const fiestaVisible = () => MOSTRAR_FIESTA && Date.now() < MIRAR_HASTA.getTime();
export const fiestaAbierta = () => MOSTRAR_FIESTA && Date.now() < SUBIR_HASTA.getTime();

const BUCKET = 'fiesta-20';
export const MAX_BYTES = 50 * 1024 * 1024; // máximo por archivo del plan gratis de Supabase
const LADO_FOTO = 2048; // la foto grande queda en unos 300-600 KB
const LADO_MINI = 480;
const UNA_HORA = 60 * 60;

export const megas = (b) => `${(b / 1024 / 1024).toFixed(b < 10 * 1024 * 1024 ? 1 : 0).replace('.', ',')} MB`;

export const esVideo = (archivo) => archivo.type.startsWith('video/') || /\.(mov|mp4|m4v|webm|3gp)$/i.test(archivo.name);
const esFoto = (archivo) => archivo.type.startsWith('image/') || /\.(jpe?g|png|heic|heif|webp|gif)$/i.test(archivo.name);

// Achica una imagen (o un cuadro) a JPEG, sin recortar.
function aJpeg(fuente, ancho, alto, lado, calidad) {
  const k = Math.min(1, lado / Math.max(ancho, alto));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(ancho * k));
  canvas.height = Math.max(1, Math.round(alto * k));
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(fuente, 0, 0, canvas.width, canvas.height);
  return new Promise((ok, mal) => canvas.toBlob((b) => (b ? ok(b) : mal(new Error('No pudimos preparar la foto'))), 'image/jpeg', calidad));
}

async function prepararFoto(archivo) {
  const bmp = await createImageBitmap(archivo, { imageOrientation: 'from-image' }).catch(() => null)
    ?? await createImageBitmap(archivo).catch(() => { throw new Error('No pudimos abrir esa foto. Prueba con otra (JPG o PNG).'); });
  try {
    const grande = await aJpeg(bmp, bmp.width, bmp.height, LADO_FOTO, 0.82);
    const mini = await aJpeg(bmp, bmp.width, bmp.height, LADO_MINI, 0.72);
    return { grande, mini };
  } finally { bmp.close?.(); }
}

// El primer cuadro del video como miniatura. Si el teléfono no deja, sin miniatura.
function cuadroDeVideo(archivo) {
  return new Promise((ok) => {
    const url = URL.createObjectURL(archivo);
    const v = document.createElement('video');
    let listo = false;
    const fin = (blob) => { if (listo) return; listo = true; URL.revokeObjectURL(url); v.removeAttribute('src'); v.load(); ok(blob); };
    const t = setTimeout(() => fin(null), 8000);
    v.muted = true; v.playsInline = true; v.preload = 'auto';
    v.onloadeddata = () => { v.currentTime = Math.min(0.5, (v.duration || 1) / 2); };
    v.onseeked = async () => {
      clearTimeout(t);
      try { fin(v.videoWidth ? await aJpeg(v, v.videoWidth, v.videoHeight, LADO_MINI, 0.72) : null); }
      catch { fin(null); }
    };
    v.onerror = () => { clearTimeout(t); fin(null); };
    v.src = url;
  });
}

const extension = (archivo) => {
  const ext = archivo.name.split('.').pop()?.toLowerCase();
  if (archivo.type === 'video/quicktime' || ext === 'mov') return 'mov';
  if (archivo.type === 'video/webm' || ext === 'webm') return 'webm';
  if (archivo.type === 'video/3gpp' || ext === '3gp') return '3gp';
  return 'mp4';
};
const tipoVideo = (archivo) => {
  const ext = extension(archivo);
  return { mov: 'video/quicktime', webm: 'video/webm', '3gp': 'video/3gpp' }[ext] ?? 'video/mp4';
};

// Revisa la lista antes de subir: qué se puede y qué no (y por qué).
export function revisar(archivos) {
  const ok = [], fuera = [];
  for (const a of archivos) {
    if (esVideo(a)) {
      if (a.size > MAX_BYTES) fuera.push({ nombre: a.name, motivo: `pesa ${megas(a.size)} y el máximo es 50 MB (recórtalo, o mándatelo por WhatsApp y sube ese, que pesa menos)` });
      else ok.push(a);
    } else if (esFoto(a)) ok.push(a);
    else fuera.push({ nombre: a.name, motivo: 'no es foto ni video' });
  }
  return { ok, fuera };
}

// --- Demostración (sin base): todo en memoria. --------------------------------
const DEMO = { archivos: [] };

// --- Galería ------------------------------------------------------------------
const urls = new Map(); // ruta → { url, vence }
async function firmar(rutas) {
  const faltan = [...new Set(rutas.filter(Boolean))].filter((r) => !(urls.get(r)?.vence > Date.now()));
  for (let i = 0; i < faltan.length; i += 100) {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrls(faltan.slice(i, i + 100), UNA_HORA);
    (data ?? []).forEach((d) => { if (d.signedUrl) urls.set(d.path, { url: d.signedUrl, vence: Date.now() + (UNA_HORA - 120) * 1000 }); });
  }
}

export async function leerFiesta() {
  if (esDemo) {
    return { abierta: fiestaAbierta(), usado: DEMO.archivos.reduce((t, a) => t + a.bytes, 0), tope: 600 * 1024 * 1024,
             archivos: DEMO.archivos.map((a) => ({ ...a })) };
  }
  const r = await llamar('fiesta_listar');
  // Solo las miniaturas (y las fotos sin miniatura). Lo grande se firma al abrirlo.
  await firmar(r.archivos.map((a) => a.miniatura ?? (a.tipo === 'foto' ? a.ruta : null)));
  r.archivos.forEach((a) => { a.urlMini = urls.get(a.miniatura ?? (a.tipo === 'foto' ? a.ruta : ''))?.url ?? null; });
  return r;
}

// La dirección del archivo grande (para el visor).
export async function urlGrande(a) {
  if (esDemo) return a.urlGrande;
  await firmar([a.ruta]);
  return urls.get(a.ruta)?.url ?? null;
}

// Para guardar en el teléfono.
export async function urlDescarga(a) {
  if (esDemo) return a.urlGrande;
  const nombre = `jara-20-anos-${a.id.slice(0, 8)}.${a.ruta.split('.').pop()}`;
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(a.ruta, 600, { download: nombre });
  return data?.signedUrl ?? null;
}

// Sube uno: la foto (achicada) o el video tal cual, más su miniatura.
async function subirUno(personaId, archivo, nombrePersona) {
  const sello = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  let grande, mini, tipo, contentType, ext;
  if (esVideo(archivo)) {
    tipo = 'video'; grande = archivo; contentType = tipoVideo(archivo); ext = extension(archivo);
    mini = await cuadroDeVideo(archivo);
  } else {
    tipo = 'foto'; contentType = 'image/jpeg'; ext = 'jpg';
    ({ grande, mini } = await prepararFoto(archivo));
  }
  if (grande.size > MAX_BYTES) throw new Error(`pesa ${megas(grande.size)} y el máximo es 50 MB`);

  if (esDemo) {
    const urlGrande = URL.createObjectURL(grande);
    DEMO.archivos.unshift({ id: sello, ruta: `${personaId}/${sello}.${ext}`, tipo, bytes: grande.size + (mini?.size ?? 0),
      creado_en: new Date().toISOString(), persona_id: personaId, nombre: nombrePersona, puedo_borrar: true,
      urlGrande, urlMini: mini ? URL.createObjectURL(mini) : (tipo === 'foto' ? urlGrande : null) });
    return;
  }
  const ruta = `${personaId}/${sello}.${ext}`;
  const rutaMini = mini ? `${personaId}/${sello}.min.jpg` : null;
  const almacen = supabase.storage.from(BUCKET);
  const { error } = await almacen.upload(ruta, grande, { contentType, cacheControl: '86400' });
  if (error) {
    if (/exceeded|too large|payload/i.test(error.message)) throw new Error('pesa más de lo permitido (50 MB)');
    throw new Error('no se pudo subir. Revisa tu señal e intenta de nuevo');
  }
  if (rutaMini) {
    const r = await almacen.upload(rutaMini, mini, { contentType: 'image/jpeg', cacheControl: '86400' });
    if (r.error) { /* sin miniatura igual sirve */ }
  }
  try {
    await llamar('fiesta_guardar', { p_ruta: ruta, p_miniatura: rutaMini, p_tipo: tipo, p_bytes: grande.size + (mini?.size ?? 0) });
  } catch (x) {
    almacen.remove([ruta, rutaMini].filter(Boolean)).catch(() => {});
    throw x;
  }
}

// Sube varios, de a uno, y va avisando. Devuelve los que fallaron.
export async function subirVarios(persona, archivos, avance) {
  const fallados = [];
  for (let i = 0; i < archivos.length; i++) {
    avance?.(i, archivos.length, archivos[i]);
    try { await subirUno(persona.id, archivos[i], persona.nombre); }
    catch (x) {
      fallados.push({ nombre: archivos[i].name, motivo: x.message });
      // Si se llenó o se cerró, no tiene sentido seguir con el resto.
      if (/se llenó|se cerró/i.test(x.message)) {
        archivos.slice(i + 1).forEach((a) => fallados.push({ nombre: a.name, motivo: x.message }));
        break;
      }
    }
  }
  avance?.(archivos.length, archivos.length, null);
  return fallados;
}

export async function borrar(a) {
  if (esDemo) { DEMO.archivos = DEMO.archivos.filter((x) => x.id !== a.id); return; }
  const rutas = await llamar('fiesta_borrar', { p_id: a.id });
  if (rutas?.length) await supabase.storage.from(BUCKET).remove(rutas).catch(() => {});
}

export function useFiesta() {
  const [estado, setEstado] = useState({ cargando: true, error: '', datos: null });
  const recargar = useCallback(async () => {
    try { setEstado({ cargando: false, error: '', datos: await leerFiesta() }); }
    catch (x) { setEstado((e) => ({ ...e, cargando: false, error: x.message })); }
  }, []);
  useEffect(() => { if (fiestaVisible()) recargar(); }, [recargar]);
  return { ...estado, recargar };
}
