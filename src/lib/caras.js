import { esDemo, llamar, supabase } from './supabase.js';
import { achicar } from './perfil.js';

// Buscarme en las fotos (migración 0042). Quien lo activa, deja que una tarea
// compare su foto de perfil (o una selfie solo para esto, 0059) con las fotos de la liga. Se apaga cuando
// quiera y eso borra todo. Las fotos se ven desde el Drive: no se copian.

const fotoDesdeFila = (f) => ({
  id: f.archivo_id, nombre: f.nombre, tomada: f.tomada, ancho: f.ancho, alto: f.alto,
  carpetaId: f.carpeta_id, carpetaNombre: f.carpeta_nombre, dia: f.dia,
  partidoId: f.partido_id, partidoFecha: f.partido_fecha, rival: f.partido_rival, equipo: f.equipo,
});

const base = {
  estado: () => llamar('caras_mi_estado'),
  activar: (mayor) => llamar('caras_activar', { p_mayor: !!mayor }),
  apagar: () => llamar('caras_apagar'),
  misFotos: async () => (await llamar('caras_mis_fotos')).map(fotoDesdeFila),
  noSoyYo: (id) => llamar('caras_no_soy_yo', { p_archivo: id }),
  mostrar: (si) => llamar('caras_mostrar', { p_muestra: !!si }),
  fotosDe: async (persona) => (await llamar('caras_fotos_de', { p_persona: persona })).map(fotoDesdeFila),
  // Selfie solo para buscarse (0059): bucket privado, solo la ve uno mismo.
  subirSelfie: async (personaId, archivo, recorte) => {
    const blob = await achicar(archivo, recorte);
    const ruta = `${personaId}/${Date.now().toString(36)}.jpg`;
    const { error } = await supabase.storage.from('caras-selfie').upload(ruta, blob, { contentType: 'image/jpeg' });
    if (error) throw new Error('No pudimos subir la selfie. Revisa tu señal e intenta de nuevo.');
    let antes;
    try { antes = await llamar('caras_selfie_guardar', { p_ruta: ruta }); }
    catch (x) { supabase.storage.from('caras-selfie').remove([ruta]).catch(() => {}); throw x; }
    if (antes) supabase.storage.from('caras-selfie').remove([antes]).catch(() => {});
  },
  quitarSelfie: async () => {
    const antes = await llamar('caras_selfie_guardar', { p_ruta: null });
    if (antes) await supabase.storage.from('caras-selfie').remove([antes]).catch(() => {});
  },
  urlSelfie: async (ruta) => {
    const { data } = await supabase.storage.from('caras-selfie').createSignedUrl(ruta, 3600);
    return data?.signedUrl ?? null;
  },
};

// --- Modo demostración: se activa y a los segundos "encuentra" fotos.
let demo = { activa: false, aceptada: 0, ocultas: new Set(), muestra: false, selfie: null };
const DEMO_FOTOS = Array.from({ length: 5 }, (_, i) => ({
  id: `demo-${i}`, nombre: `Foto ${i + 1}`, ancho: 1600, alto: 1067,
  partidoId: i < 3 ? 'p4' : null, partidoFecha: null, rival: i < 3 ? 'Otro Rival Jugado' : null, equipo: i < 3 ? 'Senior Sábado' : null,
  carpetaNombre: i < 3 ? 'Otro Rival Jugado Sr vs Club Sr' : 'Rival de Abril vs Club Sr', dia: null,
}));
const demoListo = () => demo.activa && Date.now() - demo.aceptada > 4000;
const enDemo = {
  estado: async () => ({
    activa: demo.activa, tiene_foto: true, muestra: demo.muestra, con_selfie: !!demo.selfie, selfie_ruta: demo.selfie, estado: demo.activa ? (demoListo() ? 'lista' : 'pendiente') : null,
    revisada_en: demoListo() ? new Date().toISOString() : null, foto_cambio: false,
    encontradas: demoListo() ? DEMO_FOTOS.filter((f) => !demo.ocultas.has(f.id)).length : 0,
  }),
  activar: async (mayor) => {
    if (!mayor) throw new Error('Buscarte en las fotos es solo para mayores de 18');
    demo = { activa: true, aceptada: Date.now(), ocultas: new Set(), muestra: false, selfie: null };
  },
  apagar: async () => { demo = { activa: false, aceptada: 0, ocultas: new Set(), muestra: false, selfie: null }; },
  subirSelfie: async (_p, archivo, recorte) => {
    if (!demo.activa) throw new Error('Primero activa "Buscarme en las fotos"');
    demo.selfie = URL.createObjectURL(await achicar(archivo, recorte));
    demo.aceptada = Date.now();
  },
  quitarSelfie: async () => { demo.selfie = null; },
  urlSelfie: async (ruta) => ruta,
  misFotos: async () => (demoListo() ? DEMO_FOTOS.filter((f) => !demo.ocultas.has(f.id)) : []),
  noSoyYo: async (id) => { demo.ocultas.add(id); },
  mostrar: async (si) => { if (!demo.activa) throw new Error('Primero activa "Buscarme en las fotos"'); demo.muestra = !!si; },
  // En demo, solo "Jugador Inventado" (d2) eligió mostrar sus fotos.
  fotosDe: async (persona) => (persona === 'demo' ? (demo.muestra && demoListo() ? DEMO_FOTOS.filter((f) => !demo.ocultas.has(f.id)) : [])
    : persona === 'd2' ? DEMO_FOTOS.slice(0, 2) : []),
};

const origen = esDemo ? enDemo : base;
export const estadoCaras = () => origen.estado();
export const activarCaras = (mayor) => origen.activar(mayor);
// Al apagar se borra también la selfie (el archivo), si había.
export const apagarCaras = async () => {
  if (!esDemo && (await origen.estado())?.con_selfie) await origen.quitarSelfie();
  return origen.apagar();
};
export const subirSelfie = (personaId, archivo, recorte) => origen.subirSelfie(personaId, archivo, recorte);
export const quitarSelfie = () => origen.quitarSelfie();
export const urlSelfie = (ruta) => origen.urlSelfie(ruta);
export const misFotos = () => origen.misFotos();
export const noSoyYo = (id) => origen.noSoyYo(id);
export const mostrarEnPerfil = (si) => origen.mostrar(si);
export const fotosDe = (persona) => origen.fotosDe(persona);
