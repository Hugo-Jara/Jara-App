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
  5: [['pts', 'pj', 'pg', 'pe', 'pp'], ['pj', 'pg', 'pe', 'pp', 'pts']],
  6: [['pts', 'pj', 'pg', 'pe', 'pp'], ['pj', 'pg', 'pe', 'pp', 'pts']],
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
    // Corta, un número (el puesto) o siglas leídas del escudo ("TEN", "SAG") antes del nombre.
    const corta = x.length <= 2 || /^\d+[.)º°]?$/.test(x) || (/^\p{Lu}{3}$/u.test(x) && /^\p{Lu}\p{Ll}/u.test(siguiente));
    if (!corta) break;
    if (CORTAS.has(x) && /^\p{Lu}\p{L}{2,}/u.test(siguiente)) break;
    t.shift();
  }
  let nombre = t.join(' ').trim();
  if (!nombre) return '';
  nombre = nombre[0].toUpperCase() + nombre.slice(1);
  nombre = nombre.replace(/(\p{Ll})(\p{Lu})/gu, '$1 $2'); // "CupoLibre" → "Cupo Libre"

  const cerca = conocidos
    .map((k) => ({ k, d: distancia(normal(k), normal(nombre)) }))
    .filter(({ k, d }) => d <= Math.max(1, Math.floor(normal(k).length / 5)))
    .sort((a, b) => a.d - b.d)[0];
  return (cerca?.k ?? nombre).slice(0, 60);
}

// Los números al final de una línea ("Monarcas 13 6 4 1 1 22 11 11 72"), en
// el orden de columnas que mejor cuadre. null si no parece una fila.
function numerosDeLinea(limpia) {
  const palabras = limpia.split(/\s+/);
  const nums = [];
  while (palabras.length) {
    const x = palabras.at(-1).replace(/%$/, '');
    if (/^[-+]?\d{1,3}$/.test(x)) nums.unshift(Number(x));
    else if (/^[oO]$/.test(x)) nums.unshift(0);
    else break;
    palabras.pop();
  }
  if (nums.length < 5 || !palabras.some((x) => /\p{L}{2,}/u.test(x))) return null;
  const v = nums.slice(-9);
  const candidatos = (FORMATOS[v.length] ?? FORMATOS[9]).map((cols) => {
    const f = {};
    cols.forEach((k, i) => { f[k] = v[v.length - cols.length + i]; });
    return f;
  });
  return { palabras, f: candidatos.sort((a, b) => cuadra(b) - cuadra(a))[0] };
}

// Del texto leído a las filas. Si la imagen trae varios grupos ("GRUPO A",
// "GRUPO B"), se queda con el del Jara y devuelve su nombre; si no dice grupo,
// es la tabla general. Avisa de filas que no cuadran, para que se revisen.
// En el celular copafacil muestra solo PTS J G E P: los goles quedan en 0 y
// conGoles en false (la app no muestra esas columnas).
export function tablaDesdeTexto(texto, conocidos = []) {
  const secciones = [{ grupo: '', filas: [], avisos: [] }];
  for (const linea of texto.split('\n')) {
    const limpia = linea.replace(/[—–]/g, '-').replace(/[|“”"]/g, ' ').trim();
    if (!limpia) continue;
    const g = limpia.match(/\bgrupo\s+([a-z0-9]{1,2})\s*$/i);
    if (g) { secciones.push({ grupo: `Grupo ${g[1].toUpperCase()}`, filas: [], avisos: [] }); continue; }
    const actual = secciones.at(-1);

    const leida = numerosDeLinea(limpia);
    if (!leida) continue;
    const { palabras, f } = leida;
    const equipo = limpiarNombre(palabras, conocidos);
    if (!equipo) continue;
    if (f.pj !== f.pg + f.pe + f.pp || f.pts !== f.pg * 3 + f.pe) {
      actual.avisos.push(`Revisa ${equipo}: los números no cuadran (puede ser un error de lectura o un descuento de puntos).`);
    }
    actual.filas.push({ equipo, pj: f.pj, pg: f.pg, pe: f.pe, pp: f.pp, gf: f.gf ?? 0, gc: f.gc ?? 0, pts: f.pts });
  }
  const conFilas = secciones.filter((x) => x.filas.length);
  const elegida = conFilas.find((x) => x.filas.some((f) => /jara/i.test(f.equipo))) ?? conFilas[0] ?? secciones[0];
  const conGoles = elegida.filas.some((f) => f.gf || f.gc);
  return { filas: elegida.filas, grupo: elegida.grupo, avisos: elegida.avisos, conGoles };
}

// --- Lectura por columnas ---------------------------------------------------
// Leer la línea entera confunde números chicos ("11" sale "1", "9" sale "e)").
// Por eso, si se encuentra la fila de títulos (PTS J G E P GF GC DIF %), cada
// columna se lee por separado y solo con dígitos, y cada número se asigna a la
// fila del equipo que está a su altura. Si algo falla, queda la lectura de la
// línea entera.
//   leer(img, soloNumeros) → { lines: [{ text, bbox, words: [{ text, bbox }] }] }
//   recortar(x, y, ancho, alto) → img
const TITULOS = {
  pts: /^(pts|pt|ps)$/i, pj: /^(j|jj|pj)$/i, pg: /^(g|pg|6)$/i, pe: /^(e|pe)$/i, pp: /^(p|pp)$/i,
  gf: /^(gf|6f)$/i, gc: /^(gc|ec|6c|cc)$/i, dg: /^(dif|dg|df|oif)$/i, pct: /^%$/,
};
const ORDEN = { 9: ['pts', 'pj', 'pg', 'pe', 'pp', 'gf', 'gc', 'dg', 'pct'], 5: ['pts', 'pj', 'pg', 'pe', 'pp'] };
const centro = (b) => ({ x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 });

function columnasDe(linea) {
  const i = linea.words.findIndex((w) => /equip/i.test(w.text));
  const resto = (i >= 0 ? linea.words.slice(i + 1) : linea.words).filter((w) => w.text.trim());
  if (resto.length < 5) return null;
  // Tiene que parecer la fila de títulos: varias palabras conocidas.
  if (resto.filter((w) => Object.values(TITULOS).some((r) => r.test(w.text.trim()))).length < 4) return null;
  const orden = ORDEN[resto.length];
  const cols = resto.map((w, j) => ({
    clave: Object.keys(TITULOS).find((k) => TITULOS[k].test(w.text.trim())) ?? orden?.[j] ?? null,
    x: centro(w.bbox).x,
  }));
  if (orden) cols.forEach((c, j) => { c.clave = orden[j]; });
  if (!['pts', 'pj', 'pg', 'pe', 'pp'].every((k) => cols.some((c) => c.clave === k))) return null;
  return cols;
}

// Si falta un solo número de PJ G E P Pts, sale de las cuentas (PJ = G + E + P,
// Pts = 3G + E). Igual con GF/GC si está la diferencia.
function completar(x) {
  const n = { ...x };
  const falta = ['pts', 'pj', 'pg', 'pe', 'pp'].filter((k) => n[k] == null);
  if (falta.length === 1) {
    const [k] = falta;
    if (k === 'pts') n.pts = n.pg * 3 + n.pe;
    if (k === 'pj') n.pj = n.pg + n.pe + n.pp;
    if (k === 'pp') n.pp = n.pj - n.pg - n.pe;
    if (k === 'pe') n.pe = n.pts - n.pg * 3;
    if (k === 'pg') n.pg = (n.pts - n.pe) / 3;
  }
  if (n.gf == null && n.gc != null && n.dg != null) n.gf = n.gc + n.dg;
  if (n.gc == null && n.gf != null && n.dg != null) n.gc = n.gf - n.dg;
  const valido = ['pts', 'pj', 'pg', 'pe', 'pp'].every((k) => Number.isInteger(n[k]) && (k === 'pts' || n[k] >= 0));
  return valido ? n : x;
}

export async function leerPorColumnas({ leer, recortar, alto }, conocidos = []) {
  const { lines } = await leer(null, false);
  const iTitulo = lines.findIndex((l) => columnasDe(l));
  if (iTitulo < 0) return null;
  const cols = columnasDe(lines[iTitulo]);
  const izquierda = cols[0].x - (cols[1].x - cols[0].x) / 2;

  // Filas: líneas con letras a la izquierda de las columnas. "GRUPO B" abre otra sección.
  const filas = [];
  // El "GRUPO A" del primer grupo está antes de la fila de títulos.
  const esGrupo = (l) => l.text.trim().match(/\bgrupo\s+([a-z0-9]{1,2})\s*$/i);
  const previo = lines.slice(0, iTitulo).map(esGrupo).filter(Boolean).at(-1);
  let grupo = previo ? `Grupo ${previo[1].toUpperCase()}` : '';
  const tope = lines[iTitulo].bbox.y0;
  for (const l of lines.slice(iTitulo + 1)) {
    const g = esGrupo(l);
    if (g) { grupo = `Grupo ${g[1].toUpperCase()}`; continue; }
    const nombre = l.words.filter((w) => w.bbox.x1 < izquierda);
    if (!nombre.some((w) => /\p{L}{2,}/u.test(w.text)) || nombre.some((w) => /equip/i.test(w.text))) continue;
    const y0 = Math.min(...nombre.map((w) => w.bbox.y0));
    const y1 = Math.max(...nombre.map((w) => w.bbox.y1));
    filas.push({ grupo, palabras: nombre.map((w) => w.text), y: (y0 + y1) / 2, alto: y1 - y0, linea: l.text, nums: {} });
  }
  if (!filas.length) return null;
  const altoFila = filas.length > 1 ? Math.min(...filas.slice(1).map((f, i) => f.y - filas[i].y).filter((d) => d > 0)) : filas[0].alto * 3;

  // Cada columna, sola y con dígitos.
  for (const [j, c] of cols.entries()) {
    if (!c.clave || c.clave === 'pct') continue;
    const antes = j > 0 ? cols[j - 1].x : c.x - (cols[1].x - cols[0].x);
    const despues = j < cols.length - 1 ? cols[j + 1].x : c.x + (c.x - cols[j - 1].x);
    const x0 = Math.round((antes + c.x) / 2);
    const x1 = Math.round((c.x + despues) / 2);
    const { lines: ls } = await leer(recortar(x0, tope, x1 - x0, alto - tope), true);
    for (const w of ls.flatMap((l) => l.words)) {
      const t = w.text.replace(/[^0-9-]/g, '');
      if (!/^-?\d{1,3}$/.test(t)) continue;
      const y = centro(w.bbox).y + tope;
      const f = filas.reduce((m, x) => (Math.abs(x.y - y) < Math.abs(m.y - y) ? x : m));
      if (Math.abs(f.y - y) < altoFila * 0.45 && f.nums[c.clave] == null) f.nums[c.clave] = Number(t);
    }
  }

  const secciones = [];
  for (const f of filas) {
    let s = secciones.find((x) => x.grupo === f.grupo);
    if (!s) secciones.push(s = { grupo: f.grupo, filas: [], avisos: [] });
    const equipo = limpiarNombre(f.palabras, conocidos);
    // Lo que falte en las columnas se completa con la lectura de la línea, y
    // si así no cuadra pero la línea sola sí, vale la línea.
    const linea = numerosDeLinea(f.linea.replace(/[—–]/g, '-').replace(/[|“”"]/g, ' ').trim())?.f ?? {};
    const mezcla = { ...linea, ...Object.fromEntries(Object.entries(f.nums).filter(([, v]) => v != null)) };
    const completa = (x) => ['pts', 'pj', 'pg', 'pe', 'pp'].every((k) => x[k] != null);
    let n = completa(mezcla) && (cuadra(mezcla) >= cuadra(linea) || !completa(linea)) ? mezcla : linea;
    n = completa(n) ? completar(n) : completar(mezcla);
    if (!equipo || ['pts', 'pj', 'pg', 'pe', 'pp'].some((k) => n[k] == null)) {
      s.avisos.push(`No se pudo leer bien la fila de ${equipo || f.linea.trim()}. Agrégala o corrígela a mano.`);
      continue;
    }
    const conGoles = n.gf != null && n.gc != null;
    if (n.pj !== n.pg + n.pe + n.pp || n.pts !== n.pg * 3 + n.pe || (conGoles && n.dg != null && Math.abs(n.dg) !== Math.abs(n.gf - n.gc))) {
      s.avisos.push(`Revisa ${equipo}: los números no cuadran (puede ser un error de lectura o un descuento de puntos).`);
    }
    s.filas.push({ equipo, pj: n.pj, pg: n.pg, pe: n.pe, pp: n.pp, gf: conGoles ? n.gf : 0, gc: conGoles ? n.gc : 0, pts: n.pts });
  }
  const conFilas = secciones.filter((x) => x.filas.length);
  const elegida = conFilas.find((x) => x.filas.some((f) => /jara/i.test(f.equipo))) ?? conFilas[0];
  if (!elegida) return null;
  return { filas: elegida.filas, grupo: elegida.grupo, avisos: elegida.avisos, conGoles: elegida.filas.some((f) => f.gf || f.gc) };
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

const lineasDe = (data) => (data.blocks ?? []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines.map((l) => ({
  text: l.text, bbox: l.bbox, words: l.words.map((w) => ({ text: w.text, bbox: w.bbox })),
}))));

// Leer el pantallazo. `avance` recibe un número de 0 a 1.
export async function leerCaptura(archivo, conocidos = [], avance = () => {}) {
  const { createWorker } = await import('tesseract.js');
  const imagen = await prepararImagen(archivo);
  const worker = await createWorker('spa', 1);
  let texto = '';
  let pasos = 0;
  try {
    const leer = async (recorte, soloNumeros) => {
      await worker.setParameters({
        tessedit_pageseg_mode: '6', preserve_interword_spaces: '1',
        tessedit_char_whitelist: soloNumeros ? '0123456789-' : '',
      });
      const { data } = await worker.recognize(recorte ?? imagen, {}, { text: true, blocks: true });
      if (!recorte) texto = data.text;
      pasos += 1;
      avance(Math.min(0.95, pasos / 10));
      return { lines: lineasDe(data) };
    };
    const recortar = (x, y, ancho, alto) => {
      const c = document.createElement('canvas');
      const x0 = Math.max(0, x);
      c.width = Math.max(1, Math.min(ancho, imagen.width - x0));
      c.height = Math.max(1, alto);
      c.getContext('2d').drawImage(imagen, x0, y, c.width, c.height, 0, 0, c.width, c.height);
      return c;
    };
    let porColumnas = null;
    try { porColumnas = await leerPorColumnas({ leer, recortar, alto: imagen.height }, conocidos); }
    catch { /* queda la lectura por líneas */ }
    if (!texto) await leer(null, false);
    return { ...(porColumnas ?? tablaDesdeTexto(texto, conocidos)), texto };
  } finally {
    await worker.terminate();
  }
}
