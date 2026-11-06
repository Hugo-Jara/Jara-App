// Leer la tabla de posiciones desde un pantallazo (Senior Jueves, copafacil).
//
// Todo pasa en el teléfono: la imagen se agranda y se pasa a blanco y negro, y
// Tesseract (reconocimiento de texto, se descarga la primera vez) la lee. Del
// texto se sacan las filas de la tabla y quedan en el cuadro de texto de
// siempre para que el encargado las revise antes de guardar. No hay llaves ni
// servicios pagados, y la imagen no sale del teléfono.

// Las columnas que pueden venir después del nombre, según la página. Se elige
// la que cuadra (PJ = G + E + P y Pts = 3G + E).
const FORMATOS = {
  9: [['pts', 'pj', 'pg', 'pe', 'pp', 'gf', 'gc', 'dg', 'pct']],
  8: [['pts', 'pj', 'pg', 'pe', 'pp', 'gf', 'gc', 'dg'], ['pj', 'pg', 'pe', 'pp', 'gf', 'gc', 'dg', 'pts']],
  7: [['pts', 'pj', 'pg', 'pe', 'pp', 'gf', 'gc'], ['pj', 'pg', 'pe', 'pp', 'gf', 'gc', 'pts']],
};

const cuadra = (f) =>
  (f.pj === f.pg + f.pe + f.pp ? 1 : 0) + (f.pts === f.pg * 3 + f.pe ? 1 : 0) +
  (f.dg === undefined || Math.abs(f.dg) === Math.abs(f.gf - f.gc) ? 1 : 0);

const normal = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function distancia(a, b) {
  const d = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let previo = d[0];
    d[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const t = d[j];
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, previo + (a[i - 1] === b[j - 1] ? 0 : 1));
      previo = t;
    }
  }
  return d[b.length];
}

// Palabras cortas que sí pueden partir un nombre de equipo.
const CORTAS = new Set(['La', 'El', 'Los', 'Las', 'Lo', 'De', 'Del', 'U', 'FC', 'CD', 'CF', 'SC', 'AC', 'CA', 'DC', 'UC']);

// Antes del nombre la lectura suele traer basura: el puesto, el escudo leído
// como letras ("E", "TN", "€)"). Se limpia y, si el equipo ya estaba en la
// tabla anterior, se usa ese nombre.
export function limpiarNombre(palabras, conocidos = []) {
  const crudo = ` ${normal(palabras.join(' '))} `;
  const contenido = conocidos.filter((k) => normal(k) && crudo.includes(` ${normal(k)} `)).sort((a, b) => b.length - a.length)[0];
  if (contenido) return contenido;

  let t = [...palabras];
  let corte = -1;
  t.forEach((x, i) => { if (/[^\p{L}\p{N}.'&-]/u.test(x) || /^[-.]+$/.test(x)) corte = i; });
  t = t.slice(corte + 1);
  while (t.length > 1) {
    const [x, siguiente] = t;
    const corta = x.length <= 2 || /^\d+[.)º°]?$/.test(x);
    if (!corta) break;
    if (CORTAS.has(x) && /^\p{Lu}\p{L}{2,}/u.test(siguiente)) break;
    t.shift();
  }
  let nombre = t.join(' ').trim();
  if (!nombre) return '';
  nombre = nombre[0].toUpperCase() + nombre.slice(1);

  const cerca = conocidos
    .map((k) => ({ k, d: distancia(normal(k), normal(nombre)) }))
    .filter(({ k, d }) => d <= Math.max(1, Math.floor(normal(k).length / 5)))
    .sort((a, b) => a.d - b.d)[0];
  return (cerca?.k ?? nombre).slice(0, 60);
}

// Del texto leído a las filas. Devuelve también el grupo si la imagen lo dice
// ("GRUPO A") y avisos de filas que no cuadran, para que se revisen.
export function tablaDesdeTexto(texto, conocidos = []) {
  const filas = [];
  const avisos = [];
  let grupo = '';
  for (const linea of texto.split('\n')) {
    const limpia = linea.replace(/[—–]/g, '-').replace(/[|“”"]/g, ' ').trim();
    if (!limpia) continue;
    const g = limpia.match(/\bgrupo\s+([a-z0-9]{1,2})\s*$/i);
    if (g) { grupo = `Grupo ${g[1].toUpperCase()}`; continue; }

    const palabras = limpia.split(/\s+/);
    const nums = [];
    while (palabras.length) {
      const x = palabras.at(-1).replace(/%$/, '');
      if (/^[-+]?\d{1,3}$/.test(x)) nums.unshift(Number(x));
      else if (/^[oO]$/.test(x)) nums.unshift(0);
      else break;
      palabras.pop();
    }
    if (nums.length < 7) {
      if (nums.length >= 4 && palabras.some((x) => /\p{L}{3,}/u.test(x))) avisos.push(`No se pudo leer bien: "${linea.trim()}". Agrégala a mano.`);
      continue;
    }
    const v = nums.slice(-9);
    const candidatos = (FORMATOS[v.length] ?? FORMATOS[9]).map((cols) => {
      const f = {};
      cols.forEach((k, i) => { f[k] = v[v.length - cols.length + i]; });
      return f;
    });
    const f = candidatos.sort((a, b) => cuadra(b) - cuadra(a))[0];
    const equipo = limpiarNombre(palabras, conocidos);
    if (!equipo) { avisos.push(`Falta el nombre en: "${linea.trim()}".`); continue; }
    if (f.pj !== f.pg + f.pe + f.pp || f.pts !== f.pg * 3 + f.pe) {
      avisos.push(`Revisa ${equipo}: los números no cuadran (puede ser un error de lectura o un descuento de puntos).`);
    }
    filas.push({ equipo, pj: f.pj, pg: f.pg, pe: f.pe, pp: f.pp, gf: f.gf, gc: f.gc, pts: f.pts });
  }
  return { filas, grupo, avisos };
}

// La imagen, agrandada y en blanco y negro (así se lee mucho mejor).
async function prepararImagen(archivo) {
  const img = await createImageBitmap(archivo);
  const escala = Math.max(1, Math.min(3, 3000 / img.width));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * escala);
  canvas.height = Math.round(img.height * escala);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const datos = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const p = datos.data;
  let suma = 0;
  for (let i = 0; i < p.length; i += 4) suma += 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2];
  const oscura = suma / (p.length / 4) < 110; // pantallazo en modo oscuro: se invierte
  for (let i = 0; i < p.length; i += 4) {
    let l = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2];
    if (oscura) l = 255 - l;
    const b = l >= 170 ? 255 : 0;
    p[i] = p[i + 1] = p[i + 2] = b;
  }
  ctx.putImageData(datos, 0, 0);
  return canvas;
}

// Leer el pantallazo. `avance` recibe un número de 0 a 1.
export async function leerCaptura(archivo, conocidos = [], avance = () => {}) {
  const { createWorker } = await import('tesseract.js');
  const imagen = await prepararImagen(archivo);
  const worker = await createWorker('spa', 1, {
    logger: (m) => { if (m.status === 'recognizing text') avance(m.progress); },
  });
  try {
    await worker.setParameters({ tessedit_pageseg_mode: '6', preserve_interword_spaces: '1' });
    const { data } = await worker.recognize(imagen);
    return tablaDesdeTexto(data.text, conocidos);
  } finally {
    await worker.terminate();
  }
}
