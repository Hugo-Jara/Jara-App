import { esDemo, llamar, supabase } from './supabase.js';
import { guardarMiApodo } from './apodos.js';

// Perfil del jugador (migración 0028). Las fotos viven en el bucket privado
// 'fotos-perfil' y se ven con direcciones que duran una hora.

export const POSICIONES = [
  ['arquero', 'Arquero'], ['defensa', 'Defensa'], ['lateral', 'Lateral'],
  ['volante', 'Volante'], ['delantero', 'Delantero'],
];
export const PIES = [['derecho', 'Derecho'], ['izquierdo', 'Izquierdo'], ['ambos', 'Ambos']];
export const nombrePosicion = (v) => POSICIONES.find(([k]) => k === v)?.[1] ?? '';
export const nombrePie = (v) => PIES.find(([k]) => k === v)?.[1] ?? '';

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
// '03-14' → '14 de marzo'
export const textoCumple = (mmdd) => (mmdd ? `${Number(mmdd.slice(3))} de ${MESES[Number(mmdd.slice(0, 2)) - 1]}` : '');

// --- Modo demostración: datos inventados en memoria -------------------------
const DEMO = {
  demo: { id: 'demo', nombre: 'Seba', apodo: null, estado: 'activo', propio: true, puedo_cargar: true,
          foto_ruta: null, posicion: 'volante', pie: 'derecho', cumple: '03-14', nacimiento: '1990-03-14',
          muestra_fisico: false, estatura_cm: 178, peso_kg: null, telefono: '+56 9 0000 0000', correo: 'demo@correo.cl',
          planteles: [{ id: 'e-sabado', nombre: 'Senior Sábado', dorsal: 8 }] },
};
const PLANTELES_DEMO = [
  { id: 'e-sabado', nombre: 'Senior Sábado', jugadores: [
    { id: 'demo', nombre: 'Seba', posicion: 'volante', dorsal: 8 },
    { id: 'd2', nombre: 'Jugador Inventado', apodo: 'el Muro', posicion: 'defensa', dorsal: 4 },
    { id: 'd3', nombre: 'Arquero Inventado', posicion: 'arquero', dorsal: 1 },
  ] },
  { id: 'e-jueves', nombre: 'Senior Jueves', jugadores: [{ id: 'd4', nombre: 'Delantero Inventado', posicion: 'delantero', dorsal: 9 }] },
];

export async function leerPerfil(id = null) {
  if (esDemo) {
    const p = DEMO[id ?? 'demo'];
    if (p) return structuredClone(p);
    const j = PLANTELES_DEMO.flatMap((e) => e.jugadores.map((x) => ({ ...x, equipo: e }))).find((x) => x.id === id);
    if (!j) throw new Error('No encontramos a esa persona en el club');
    return { ...j, propio: false, puedo_cargar: true, planteles: [{ id: j.equipo.id, nombre: j.equipo.nombre, dorsal: j.dorsal }] };
  }
  return llamar('perfil_ver', { p_persona: id });
}

// Solo manda lo que cambió. El apodo va por su función (0024), para que se
// actualice al tiro al lado del nombre en toda la app.
export async function guardarPerfil(perfil, cambios) {
  const { apodo, ...resto } = cambios;
  if (apodo !== undefined) await guardarMiApodo(perfil.id, apodo ?? '');
  if (!Object.keys(resto).length) return;
  if (esDemo) { Object.assign(DEMO[perfil.id] ?? {}, resto); return; }
  await llamar('perfil_guardar', { p_persona: perfil.id, p_datos: resto });
}

export async function leerPlanteles() {
  return esDemo ? structuredClone(PLANTELES_DEMO) : llamar('planteles_fichas');
}

// --- Fotos ------------------------------------------------------------------
const urls = new Map(); // ruta → { url, vence }
const UNA_HORA = 60 * 60;

// Direcciones firmadas para varias fotos a la vez. Las que fallan quedan sin foto.
export async function urlsDeFotos(rutas) {
  const faltan = [...new Set(rutas.filter(Boolean))].filter((r) => !(urls.get(r)?.vence > Date.now()));
  if (faltan.length && !esDemo) {
    const { data } = await supabase.storage.from('fotos-perfil').createSignedUrls(faltan, UNA_HORA);
    (data ?? []).forEach((d) => { if (d.signedUrl) urls.set(d.path, { url: d.signedUrl, vence: Date.now() + (UNA_HORA - 120) * 1000 }); });
  }
  return Object.fromEntries(rutas.filter(Boolean).map((r) => [r, urls.get(r)?.url]));
}

// Achica la foto a un cuadrado de 600 px en JPEG (unos 60-120 KB).
async function achicar(archivo) {
  const LADO = 600;
  const bmp = await createImageBitmap(archivo).catch(() => {
    throw new Error('No pudimos abrir esa foto. Prueba con otra (JPG o PNG).');
  });
  const lado = Math.min(bmp.width, bmp.height);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = Math.min(LADO, lado);
  canvas.getContext('2d').drawImage(bmp, (bmp.width - lado) / 2, (bmp.height - lado) / 2, lado, lado, 0, 0, canvas.width, canvas.height);
  bmp.close?.();
  return new Promise((ok, mal) => canvas.toBlob((b) => (b ? ok(b) : mal(new Error('No pudimos preparar la foto'))), 'image/jpeg', 0.85));
}

// Sube mi foto nueva y borra la anterior. Devuelve { ruta, url }.
export async function subirMiFoto(personaId, archivo) {
  const blob = await achicar(archivo);
  if (esDemo) {
    const url = URL.createObjectURL(blob);
    DEMO.demo.foto_ruta = url; urls.set(url, { url, vence: Infinity });
    return { ruta: url, url };
  }
  const ruta = `${personaId}/${Date.now().toString(36)}.jpg`;
  const { error } = await supabase.storage.from('fotos-perfil').upload(ruta, blob, { contentType: 'image/jpeg' });
  if (error) throw new Error('No pudimos subir la foto. Revisa tu señal e intenta de nuevo.');
  const antes = await llamar('perfil_foto_guardar', { p_ruta: ruta });
  if (antes) supabase.storage.from('fotos-perfil').remove([antes]).catch(() => {});
  return { ruta, url: (await urlsDeFotos([ruta]))[ruta] };
}

export async function quitarMiFoto() {
  if (esDemo) { DEMO.demo.foto_ruta = null; return; }
  const antes = await llamar('perfil_foto_guardar', { p_ruta: null });
  if (antes) supabase.storage.from('fotos-perfil').remove([antes]).catch(() => {});
}
