// Leer la planilla común de tesorería (.xlsx) en el navegador, sin librerías:
// un .xlsx es un zip con XML adentro. Sirve para el archivo de Excel y para el
// que baja Google Sheets (Archivo > Descargar > Microsoft Excel).
// Nada sale del aparato hasta que el tesorero confirma: la app manda a la base
// solo las filas de su plantel (migración 0052).

// ---------------------------------------------------------------------------
// Zip
// ---------------------------------------------------------------------------
async function inflar(bytes) {
  const ds = new DecompressionStream('deflate-raw');
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function abrirZip(buffer) {
  const b = new Uint8Array(buffer);
  const v = new DataView(buffer);
  let fin = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) {
    if (v.getUint32(i, true) === 0x06054b50) { fin = i; break; }
  }
  if (fin < 0) throw new Error('El archivo no es un .xlsx. Descárgalo como Microsoft Excel (.xlsx) y vuelve a probar.');
  const total = v.getUint16(fin + 10, true);
  let p = v.getUint32(fin + 16, true);
  const archivos = {};
  const dec = new TextDecoder();
  for (let n = 0; n < total; n++) {
    if (v.getUint32(p, true) !== 0x02014b50) break;
    const metodo = v.getUint16(p + 10, true);
    const tam = v.getUint32(p + 20, true);
    const largoNombre = v.getUint16(p + 28, true);
    const largoExtra = v.getUint16(p + 30, true);
    const largoComent = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    const nombre = dec.decode(b.subarray(p + 46, p + 46 + largoNombre));
    archivos[nombre] = { metodo, tam, local };
    p += 46 + largoNombre + largoExtra + largoComent;
  }
  return async (nombre) => {
    const a = archivos[nombre];
    if (!a) return null;
    const ini = a.local + 30 + v.getUint16(a.local + 26, true) + v.getUint16(a.local + 28, true);
    const datos = b.subarray(ini, ini + a.tam);
    if (a.metodo === 0) return dec.decode(datos);
    if (a.metodo === 8) return dec.decode(await inflar(datos));
    throw new Error('El .xlsx viene comprimido de una forma que la app no conoce');
  };
}

// ---------------------------------------------------------------------------
// XML (lo justo para un .xlsx)
// ---------------------------------------------------------------------------
const entidades = (t) => t
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&amp;/g, '&');
const atributo = (tag, nombre) => {
  const m = new RegExp(`\\s${nombre}="([^"]*)"`).exec(tag);
  return m ? entidades(m[1]) : null;
};
const textos = (xml) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t(?:\s[^>]*)?\/>/g)].map((m) => entidades(m[1] ?? '')).join('');

const columna = (ref) => {
  const letras = /^[A-Z]+/.exec(ref)[0];
  let n = 0;
  for (const c of letras) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
};

function leerHoja(xml, compartidos) {
  const filas = [];
  for (const fila of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const r = Number(atributo(fila[1], 'r')) || filas.length + 1;
    const celdas = [];
    for (const c of fila[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = atributo(c[1], 'r');
      const tipo = atributo(c[1], 't');
      const dentro = c[2] ?? '';
      const vm = /<v>([\s\S]*?)<\/v>/.exec(dentro);
      let valor = null;
      if (tipo === 's') valor = vm ? compartidos[Number(vm[1])] ?? '' : '';
      else if (tipo === 'inlineStr') valor = textos(dentro);
      else if (tipo === 'str' || tipo === 'e') valor = vm ? entidades(vm[1]) : '';
      else if (tipo === 'b') valor = vm ? vm[1] === '1' : null;
      else if (vm) valor = Number(vm[1]);
      const i = ref ? columna(ref) : celdas.length;
      celdas[i] = valor;
    }
    filas[r - 1] = Array.from(celdas, (x) => (x === undefined ? null : x));
  }
  return Array.from(filas, (x) => x ?? []);
}

// { hojas: ['Cómo llenarla', 'Cuotas', …], hoja(nombre) -> filas[][] }
export async function leerXlsx(buffer) {
  const leer = await abrirZip(buffer);
  const libro = await leer('xl/workbook.xml');
  if (!libro) throw new Error('El archivo no es una planilla de Excel (.xlsx)');
  const rels = (await leer('xl/_rels/workbook.xml.rels')) ?? '';
  const destino = {};
  for (const m of rels.matchAll(/<Relationship\b([^>]*)\/?>/g)) destino[atributo(m[1], 'Id')] = atributo(m[1], 'Target');
  const compartidosXml = (await leer('xl/sharedStrings.xml')) ?? '';
  const compartidos = [...compartidosXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textos(m[1]));
  const hojas = [];
  for (const m of libro.matchAll(/<sheet\b([^>]*)\/?>/g)) {
    const t = destino[atributo(m[1], 'r:id')] ?? '';
    const ruta = t.startsWith('/') ? t.slice(1) : `xl/${t.replace(/^\.\//, '')}`;
    hojas.push({ nombre: atributo(m[1], 'name'), ruta });
  }
  const cache = {};
  return {
    hojas: hojas.map((h) => h.nombre),
    hoja: async (nombre) => {
      const h = hojas.find((x) => x.nombre === nombre);
      if (!h) return [];
      cache[nombre] ??= leerHoja((await leer(h.ruta)) ?? '', compartidos);
      return cache[nombre];
    },
  };
}

// ---------------------------------------------------------------------------
// La planilla común: pestaña del plantel y hoja "Cuotas"
// ---------------------------------------------------------------------------
export const normal = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/\(demo\)/g, '').replace(/\s+/g, ' ').trim();

// La pestaña que corresponde al plantel, o null.
export function pestanaDe(hojas, plantel) {
  const p = normal(plantel);
  return hojas.find((h) => normal(h) === p) ?? hojas.find((h) => normal(h).includes(p) || (normal(h) && p.includes(normal(h)))) ?? null;
}

const COLUMNAS = {
  nombre: 'nombre', apodo: 'apodo', rut: 'rut', nacimiento: 'fecha', telefono: 'celular', correo: 'correo',
  tipo: 'condici', descuento_pct: 'descuento', monto_especial: 'monto especial', deuda_anterior: 'deuda',
  pagado: 'pagado', comentario: 'comentario',
};
const TIPOS = { normal: 'normal', beca: 'beca', exento: 'exento', galleta: 'exento', 'no paga': 'exento', especial: 'especial', 'monto especial': 'especial' };

// '$25.000' -> 25000; 25000 -> 25000; '' -> null
export function numero(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v) : null;
  const t = String(v).replace(/[$\s]/g, '').replace(/\./g, '').replace(',', '.');
  if (t === '' || t === '-') return null;
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n) : null;
}

const iso = (a, m, d) => `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
// Fecha de Excel (número de días desde 1899-12-30) o texto dd-mm-aaaa / aaaa-mm-dd.
export function fecha(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000);
    return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  const t = String(v).trim();
  let m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(t);
  if (m) return iso(m[3], m[2], m[1]);
  m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  if (m) return iso(m[1], m[2], m[3]);
  return t; // la base avisa que no la entiende
}

const texto = (v) => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(v);
  return String(v).trim();
};

// Filas de la pestaña del plantel, listas para la base.
export function filasDePestana(filas) {
  const enc = (filas[0] ?? []).map((c) => normal(c));
  const col = {};
  for (const [k, prefijo] of Object.entries(COLUMNAS)) {
    const i = enc.findIndex((e) => e.startsWith(prefijo));
    if (i >= 0) col[k] = i;
  }
  if (col.nombre === undefined) throw new Error('La pestaña no tiene la columna "Nombre completo" en la primera fila');
  const faltan = ['rut', 'tipo', 'pagado'].filter((k) => col[k] === undefined);
  if (faltan.length) {
    const nombres = { rut: 'RUT', tipo: 'Condición', pagado: 'Pagado' };
    throw new Error(`A la pestaña le falta la columna ${faltan.map((k) => `"${nombres[k]}"`).join(', ')}`);
  }
  const salida = [];
  filas.slice(1).forEach((r, i) => {
    const g = (k) => (col[k] === undefined ? null : r[col[k]] ?? null);
    const nombre = texto(g('nombre'));
    if (!nombre || /^ej(emplo)?[.:\s]/i.test(nombre)) return;
    const tipoTxt = normal(g('tipo')) || 'normal';
    salida.push({
      fila: i + 2,
      nombre,
      apodo: texto(g('apodo')) || null,
      rut: texto(g('rut')) || null,
      nacimiento: fecha(g('nacimiento')),
      telefono: texto(g('telefono')) || null,
      correo: texto(g('correo')).toLowerCase() || null,
      tipo: TIPOS[tipoTxt] ?? tipoTxt,
      descuento_pct: numero(g('descuento_pct')) ?? 0,
      monto_especial: numero(g('monto_especial')),
      deuda_anterior: numero(g('deuda_anterior')) ?? 0,
      pagado: numero(g('pagado')) ?? 0,
      comentario: texto(g('comentario')) || null,
    });
  });
  return salida;
}

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

// Plan de cuotas del plantel desde la hoja "Cuotas". null si la hoja no trae
// ese plantel (entonces el plan de la app no se toca).
export function planDeCuotas(filas, plantel, temporada) {
  if (!filas?.length) return null;
  const enc = (filas[0] ?? []).map((c) => normal(c));
  const p = normal(plantel);
  const fila = filas.slice(1).find((r) => {
    const n = normal(r[0]);
    return n && (n === p || n.includes(p) || p.includes(n));
  });
  if (!fila) return null;
  const valor = (prefijo) => {
    const i = enc.findIndex((e) => e.startsWith(prefijo));
    return i >= 0 ? fila[i] : null;
  };
  const dia = Math.min(28, Math.max(1, numero(valor('vence')) || 10));
  const cuotas = [];
  let primerMes = null;
  MESES.forEach((mes, i) => {
    const monto = numero(valor(normal(mes)));
    if (monto > 0) {
      primerMes ??= i + 1;
      cuotas.push({ numero: cuotas.length + 1, nombre: mes, vence: iso(temporada, i + 1, dia), monto });
    }
  });
  const inscripcion = numero(valor('inscrip'));
  if (inscripcion > 0) cuotas.unshift({ numero: 0, nombre: 'Inscripción', vence: iso(temporada, primerMes ?? 3, dia), monto: inscripcion });
  // Si la celda tiene formato de %, Excel guarda 0,15 en vez de 15.
  const crudo = valor('aporte');
  const aporte = typeof crudo === 'number' && crudo > 0 && crudo < 1 ? Math.round(crudo * 1000) / 10 : numero(crudo);
  return { cuotas: cuotas.length ? cuotas : null, aporte: aporte === null ? null : Math.min(100, Math.max(0, aporte)) };
}
