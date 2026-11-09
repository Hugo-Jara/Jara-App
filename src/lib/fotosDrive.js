// Fotos de los partidos desde el Drive del fotógrafo de la liga.
//
// El Drive viene ordenado así: "Junior Clausura / Fecha 7 / Rival vs Hugo Jara Jr".
// La base (migración 0041) recorre el Drive, lee rival y categoría del nombre y
// el día de las fotos, y enlaza sola las carpetas seguras. Para las demás, acá
// se propone el partido más parecido y el capitán confirma.
//
// Este archivo no depende de React ni de Supabase: se prueba con
// `npm run test:fotos-drive`. Las fotos nunca se copian: se muestran desde el Drive.

// Carpeta "Junior y Senior" del Drive de la liga (link público de su Instagram).
export const RAIZ_FOTOS_LIGA = '1J_7BA3viY3khWTOBo16Isn8_Zi8r9Kbs';

export const linkCarpeta = (id) => `https://drive.google.com/drive/folders/${id}`;
// Miniatura de una foto pública del Drive, sin llave. Si una falla, se prueba la otra dirección.
export const miniatura = (id, ancho = 600) => `https://drive.google.com/thumbnail?id=${id}&sz=w${ancho}`;
export const miniaturaOtra = (id, ancho = 600) => `https://lh3.googleusercontent.com/d/${id}=w${ancho}`;
export const fotoEnDrive = (id) => `https://drive.google.com/file/d/${id}/view`;

// Saca el id de un link del Drive. Sirve el link normal, el del celular
// (/drive/mobile/folders/A/B/C: el último es la carpeta) y el id solo.
export function idDeCarpeta(texto) {
  const t = String(texto ?? '').trim();
  if (/^[A-Za-z0-9_-]{10,100}$/.test(t)) return t;
  const id = t.match(/[?&]id=([A-Za-z0-9_-]{10,100})/);
  if (id) return id[1];
  const ruta = t.match(/\/folders\/([A-Za-z0-9_\-/]+)/);
  if (ruta) {
    const partes = ruta[1].split('/').filter((p) => /^[A-Za-z0-9_-]{10,100}$/.test(p));
    if (partes.length) return partes.at(-1);
  }
  return null;
}

// Minúsculas, sin tildes ni signos: "Acharán Jr." → "acharan jr".
export const normalizar = (s) => String(s ?? '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9ñ ]+/g, ' ').replace(/\s+/g, ' ').trim();

const dias = (a, b) => Math.round((Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 86400000);

const RELLENO = new Set(['jr', 'sr', 'junior', 'senior', 'fc', 'cd', 'club', 'de', 'la', 'el', 'los', 'las', 'y']);
const palabras = (s) => normalizar(s).split(' ').filter((p) => p && !RELLENO.has(p));

// Qué tanto se parecen dos nombres de rival, de 0 a 1. "C. Memo Jr" y "Club
// Memo" se parecen; "Old Boys" y "Old Brads", a medias.
export function parecido(a, b) {
  const x = palabras(a), y = palabras(b);
  if (!x.length || !y.length) return 0;
  if (x.join(' ') === y.join(' ')) return 1;
  const calza = (p, q) => p === q || (p.length >= 3 && q.length >= 3 && (p.startsWith(q) || q.startsWith(p)));
  const usados = new Set();
  let iguales = 0;
  for (const p of x) {
    const i = y.findIndex((q, j) => !usados.has(j) && calza(p, q));
    if (i >= 0) { usados.add(i); iguales++; }
  }
  return iguales / Math.max(x.length, y.length);
}

const esDeCategoria = (equipo, categoria) => {
  const n = normalizar(equipo);
  if (categoria === 'jr') return n.includes('junior');
  if (categoria === 'sr') return n.includes('senior');
  return true;
};

// Puntaje de una carpeta para un partido (0 = no es).
export function puntaje(carpeta, partido) {
  if (!esDeCategoria(partido.equipo, carpeta.categoria)) return 0;
  const rival = parecido(carpeta.rival, partido.rival);
  let p = rival * 60;
  if (carpeta.dia) {
    const d = Math.abs(dias(partido.fecha, carpeta.dia));
    if (d === 0) p += 60;
    else if (d === 1) p += 40;
    else if (d <= 3) p += 15;
    // Mismo rival en otra fecha (Apertura y Clausura): no es este partido.
    else return 0;
  } else if (carpeta.creada) {
    // Sin fotos con fecha: la carpeta aparece unos días después del partido.
    const d = dias(carpeta.creada.slice(0, 10), partido.fecha);
    if (d >= 0 && d <= 14) p += 20;
    else return 0;
  } else return 0; // Sin ninguna fecha no se adivina: el capitán elige.
  return Math.round(p);
}

export const PUNTAJE_MINIMO = 60;

// Propone una carpeta por partido y un partido por carpeta, de la más segura a
// la menos. Se salta lo que ya está enlazado.
export function proponer(carpetas, partidos, enlaces = []) {
  const carpetasEnlazadas = new Set(enlaces.map((e) => e.carpetaId));
  const partidosEnlazados = new Set(enlaces.map((e) => e.partidoId));
  const libres = carpetas.filter((c) => !carpetasEnlazadas.has(c.id));
  const candidatos = partidos.filter((p) => !partidosEnlazados.has(p.id));
  const pares = [];
  for (const c of libres) for (const p of candidatos) {
    const s = puntaje(c, p);
    if (s >= PUNTAJE_MINIMO) pares.push({ carpeta: c, partido: p, puntaje: s });
  }
  pares.sort((a, b) => b.puntaje - a.puntaje);
  const usadasC = new Set(), usadosP = new Set(), propuestas = [];
  for (const par of pares) {
    if (usadasC.has(par.carpeta.id) || usadosP.has(par.partido.id)) continue;
    usadasC.add(par.carpeta.id); usadosP.add(par.partido.id);
    propuestas.push(par);
  }
  const sinPartido = libres.filter((c) => !usadasC.has(c.id));
  return { propuestas, sinPartido };
}
