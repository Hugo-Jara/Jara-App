// Fotos de los partidos desde el Drive del fotógrafo de la liga.
//
// El Drive viene ordenado así: "Junior Clausura / Fecha 7 / Rival vs Hugo Jara Jr".
// El nombre trae la categoría (Jr o Sr) y el rival, pero no el día: el día se
// saca de la fecha en que se tomaron las fotos. Con eso se propone a qué
// partido de la app corresponde cada carpeta, y una persona lo confirma.
//
// Este archivo no depende de React ni de Supabase: se prueba con
// `npm run test:fotos-drive`. Las fotos nunca se copian: se muestran desde el Drive.

// Carpeta "Junior y Senior" del Drive de la liga (link público de su Instagram).
export const RAIZ_FOTOS_LIGA = '1J_7BA3viY3khWTOBo16Isn8_Zi8r9Kbs';
// Cómo aparece el club en los nombres de las carpetas.
export const CLUB_EN_DRIVE = 'hugo jara';

const CARPETA = 'application/vnd.google-apps.folder';
const API = 'https://www.googleapis.com/drive/v3/files';

export const linkCarpeta = (id) => `https://drive.google.com/drive/folders/${id}`;
export const miniatura = (id, ancho = 600) => `https://drive.google.com/thumbnail?id=${id}&sz=w${ancho}`;

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
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9ñ ]+/g, ' ').replace(/\s+/g, ' ').trim();

const CATEGORIA = /\s(jr|junior|sr|senior)$/;
const sinCategoria = (s) => s.replace(CATEGORIA, '').trim();
const categoriaDe = (s) => {
  const m = s.match(CATEGORIA);
  if (!m) return null;
  return m[1].startsWith('j') ? 'jr' : 'sr';
};

// "COBS vs Hugo Jara Jr" → { rival: 'COBS', categoria: 'jr' }. Si la carpeta no
// es de un partido del club, devuelve null. La categoría, si no viene en el
// nombre del partido, se busca en la ruta ("Junior Clausura").
export function leerNombre(nombre, ruta = [], club = CLUB_EN_DRIVE) {
  const lados = String(nombre ?? '').split(/\s+vs\.?\s+/i);
  if (lados.length !== 2) return null;
  const n = lados.map(normalizar);
  const nuestro = n.findIndex((l) => l.includes(club));
  if (nuestro < 0) return null;
  const rivalOriginal = lados[1 - nuestro].trim().replace(/\s+(jr|sr|junior|senior)\.?$/i, '').trim();
  let categoria = categoriaDe(n[nuestro]) ?? categoriaDe(n[1 - nuestro]);
  if (!categoria) {
    const r = normalizar(ruta.join(' '));
    if (/junior/.test(r) && !/senior/.test(r)) categoria = 'jr';
    else if (/senior/.test(r) && !/junior/.test(r)) categoria = 'sr';
  }
  return { rival: rivalOriginal, categoria };
}

// "2026:09:27 10:31:22" (como lo guarda la cámara) → "2026-09-27".
export function diaDeFoto(time) {
  const m = String(time ?? '').match(/^(\d{4})[:-](\d{2})[:-](\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

// El día que más se repite entre las fotos (por si alguna cámara tenía mal la hora).
export function diaMasRepetido(times) {
  const cuenta = new Map();
  for (const t of times) {
    const d = diaDeFoto(t);
    if (d) cuenta.set(d, (cuenta.get(d) ?? 0) + 1);
  }
  let mejor = null;
  for (const [d, n] of cuenta) if (!mejor || n > mejor[1]) mejor = [d, n];
  return mejor?.[0] ?? null;
}

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
    else if (rival < 1) return 0;
  } else if (carpeta.creada) {
    // Sin fotos con fecha: la carpeta aparece unos días después del partido.
    const d = dias(carpeta.creada.slice(0, 10), partido.fecha);
    if (d >= 0 && d <= 14) p += 20;
    else if (rival < 1) return 0;
  }
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

// --- Lectura del Drive (con la llave de Google) ----------------------------

async function listar(carpetaId, llave, { tipo, campos = 'id,name,mimeType,createdTime', max = 1000 } = {}) {
  const filtro = tipo === 'carpetas' ? ` and mimeType = '${CARPETA}'`
    : tipo === 'imagenes' ? " and mimeType contains 'image/'" : '';
  const salida = [];
  let pagina = '';
  do {
    const params = new URLSearchParams({
      q: `'${carpetaId}' in parents and trashed = false${filtro}`,
      fields: `nextPageToken, files(${campos})`,
      pageSize: String(Math.min(max, 1000)), orderBy: 'name', key: llave,
      supportsAllDrives: 'true', includeItemsFromAllDrives: 'true',
    });
    if (pagina) params.set('pageToken', pagina);
    let r;
    try { r = await fetch(`${API}?${params}`); }
    catch { throw new Error('No pudimos conectar con el Drive. Revisa tu señal e intenta de nuevo.'); }
    if (!r.ok) {
      if (r.status === 404) throw new Error('No encontramos esa carpeta del Drive, o no está compartida con "cualquier persona con el link".');
      if (r.status === 400 || r.status === 403) throw new Error('El Drive rechazó la llave de Google. Revisa que la llave tenga activada la Google Drive API y permita esta página.');
      throw new Error(`El Drive respondió con un error (${r.status}). Intenta de nuevo en un rato.`);
    }
    const j = await r.json();
    salida.push(...(j.files ?? []));
    pagina = j.nextPageToken;
  } while (pagina && salida.length < max);
  return salida.slice(0, max);
}

// Corre `f` sobre la lista, de a pocos a la vez para no saturar el Drive.
async function deAPocos(lista, f, aLaVez = 4) {
  const salida = new Array(lista.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(aLaVez, lista.length) }, async () => {
    while (i < lista.length) { const k = i++; salida[k] = await f(lista[k], k); }
  }));
  return salida;
}

// Recorre el Drive desde la raíz y junta las carpetas de partidos del club,
// con su rival, categoría, día (de las fotos) y cuántas fotos tienen.
export async function buscarCarpetasDelClub(raizId, llave, { club = CLUB_EN_DRIVE, alAvanzar } = {}) {
  const encontradas = [];
  let revisadas = 0;
  const recorrer = async (id, ruta, nivel) => {
    const hijas = await listar(id, llave, { tipo: 'carpetas' });
    revisadas++;
    alAvanzar?.({ revisadas, encontradas: encontradas.length });
    const seguir = [];
    for (const h of hijas) {
      if (/\svs\.?\s/i.test(h.name)) {
        const leido = leerNombre(h.name, ruta, club);
        if (leido) encontradas.push({ id: h.id, nombre: h.name.trim(), ruta, creada: h.createdTime, ...leido });
      } else if (nivel < 4) seguir.push(h);
    }
    await deAPocos(seguir, (h) => recorrer(h.id, [...ruta, h.name.trim()], nivel + 1));
  };
  await recorrer(raizId, [], 0);
  await deAPocos(encontradas, async (c) => {
    const fotos = await listar(c.id, llave, { tipo: 'imagenes', campos: 'id,imageMediaMetadata(time)' });
    c.fotos = fotos.length;
    c.dia = diaMasRepetido(fotos.map((f) => f.imageMediaMetadata?.time));
    alAvanzar?.({ revisadas, encontradas: encontradas.length });
  });
  return encontradas;
}

// Las fotos de una carpeta, listas para mostrar (para la galería).
export async function fotosDeCarpeta(carpetaId, llave) {
  const fotos = await listar(carpetaId, llave, { tipo: 'imagenes', campos: 'id,name,imageMediaMetadata(time,width,height)' });
  return fotos.map((f) => ({
    id: f.id, nombre: f.name,
    ancho: f.imageMediaMetadata?.width ?? null, alto: f.imageMediaMetadata?.height ?? null,
    miniatura: miniatura(f.id, 600), grande: miniatura(f.id, 1600),
    enDrive: `https://drive.google.com/file/d/${f.id}/view`,
  }));
}
