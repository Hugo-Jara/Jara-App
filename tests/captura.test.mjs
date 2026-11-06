// Prueba la lectura del pantallazo de la tabla (src/lib/captura.js) con el
// texto que sacó Tesseract de dos pantallazos reales de copafacil.
//   npm run test:captura
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tablaDesdeTexto, limpiarNombre, leerPorColumnas, pestanaDeCaptura } from '../src/lib/captura.js';

const leer = (f) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8');
const linea = (f) => [f.equipo, f.pj, f.pg, f.pe, f.pp, f.gf, f.gc, f.pts].join(' ');

test('La tabla del grupo sale completa y con su nombre', () => {
  const r = tablaDesdeTexto(leer('ocr-copafacil-grupo.txt'));
  assert.equal(r.grupo, 'Grupo A');
  assert.deepEqual(r.avisos, []);
  assert.deepEqual(r.filas.map(linea), [
    'Monarcas 6 4 1 1 22 11 13', 'Peselaco 6 4 1 1 15 9 13', 'Canadiense 6 3 2 1 13 8 11',
    'Warriors 6 3 1 2 16 14 10', 'Mota Classic 6 3 1 2 8 10 10', 'Hugo Jara 6 2 0 4 9 10 6',
    'Sagrados 6 1 2 3 11 14 5', 'Cupo Libre 6 0 0 6 0 18 0',
  ]);
});

test('La general: 16 equipos, sin basura de los escudos', () => {
  const r = tablaDesdeTexto(leer('ocr-copafacil-general.txt'));
  assert.equal(r.grupo, '');
  assert.equal(r.filas.length, 16);
  assert.deepEqual(r.avisos, []);
  assert.equal(r.filas[0].equipo, 'Sub 20 Inmortal');
  assert.equal(r.filas[7].equipo, 'Warriors');
  assert.equal(r.filas[12].equipo, 'La Academia');
  assert.equal(linea(r.filas[14]), 'Defensa y Justicia 6 0 1 5 8 24 1');
});

test('Con los nombres de la tabla anterior, se corrigen los mal leídos', () => {
  const r = tablaDesdeTexto(leer('ocr-copafacil-general.txt'), ['Peselaco', 'Gross x']);
  assert.equal(r.filas[3].equipo, 'Peselaco');
});

test('Pantallazo del celular: solo PTS J G E P, y se queda con el grupo del Jara', () => {
  const r = tablaDesdeTexto(leer('ocr-copafacil-celular.txt'));
  assert.equal(r.grupo, 'Grupo A');
  assert.equal(r.conGoles, false);
  assert.deepEqual(r.avisos, []);
  assert.deepEqual(r.filas.map((f) => `${f.equipo} ${f.pj} ${f.pg} ${f.pe} ${f.pp} ${f.pts}`), [
    'Monarcas 6 4 1 1 13', 'Peselaco 6 4 1 1 13', 'Canadiense 6 3 2 1 11', 'Warriors 6 3 1 2 10',
    'Mota Classic 6 3 1 2 10', 'Hugo Jara 6 2 0 4 6', 'Sagrados 6 1 2 3 5', 'Cupo Libre 6 0 0 6 0',
  ]);
});

test('Si una fila no cuadra, se avisa', () => {
  const r = tablaDesdeTexto('Hugo Jara 9 6 2 0 4 9 10 -1 33');
  assert.equal(r.filas.length, 1);
  assert.match(r.avisos[0], /Revisa Hugo Jara/);
});

test('También sirve con el orden de siempre (PJ G E P GF GC Pts)', () => {
  const r = tablaDesdeTexto('1 Hugo Jara 9 6 2 1 20 8 20');
  assert.equal(linea(r.filas[0]), 'Hugo Jara 9 6 2 1 20 8 20');
});

test('Limpieza de nombres', () => {
  assert.equal(limpiarNombre(['El', '£9', 'sub', '20', 'Inmortal']), 'Sub 20 Inmortal');
  assert.equal(limpiarNombre(['UE', 'La', 'Academia']), 'La Academia');
  assert.equal(limpiarNombre(['El', 'de', 'Gross', 'x']), 'Gross x');
  assert.equal(limpiarNombre(['El', 'E', 'Warriors']), 'Warriors');
  assert.equal(limpiarNombre(['3', 'Los', 'Andes']), 'Los Andes');
  assert.equal(limpiarNombre(['a', 'TEN', 'Hugo', 'Jara']), 'Hugo Jara');
  assert.equal(limpiarNombre(['CD', 'Universidad']), 'CD Universidad');
});

// Una lectura de mentira: palabras con su posición, como las entrega Tesseract.
function lecturaDeMentira(filasTabla) {
  const caja = (x, y, w = 40) => ({ x0: x - w / 2, y0: y - 15, x1: x + w / 2, y1: y + 15 });
  const linea = (palabras) => ({ text: palabras.map((p) => p.text).join(' '), bbox: caja(500, palabras[0].bbox.y0 + 15, 1000), words: palabras });
  const X = { pts: 400, pj: 460, pg: 520, pe: 580, pp: 640 };
  const lines = [
    linea([{ text: 'GRUPO', bbox: caja(40, 50) }, { text: 'A', bbox: caja(90, 50, 10) }]),
    linea([{ text: 'EQUIPOS', bbox: caja(100, 100) }, ...Object.entries(X).map(([k, x]) => ({ text: k === 'pj' ? 'J' : k === 'pg' ? 'G' : k === 'pe' ? 'E' : k === 'pp' ? 'P' : 'PTS', bbox: caja(x, 100) }))]),
    ...filasTabla.map(([nombre, ...n], i) => linea([...nombre.split(' ').map((t, k) => ({ text: t, bbox: caja(60 + k * 90, 160 + i * 60, 80) })), ...n.map((v, j) => ({ text: String(v), bbox: caja(Object.values(X)[j], 160 + i * 60) }))])),
  ];
  return {
    alto: 1000,
    recortar: (x, y, ancho, alto) => ({ x, y, ancho, alto }),
    leer: async (r) => {
      if (!r) return { lines };
      const words = lines.slice(2).flatMap((l) => l.words)
        .filter((w) => /^\d+$/.test(w.text) && (w.bbox.x0 + w.bbox.x1) / 2 > r.x && (w.bbox.x0 + w.bbox.x1) / 2 < r.x + r.ancho)
        .map((w) => ({ text: w.text, bbox: { ...w.bbox, y0: w.bbox.y0 - r.y, y1: w.bbox.y1 - r.y } }));
      return { lines: [{ text: '', bbox: {}, words }] };
    },
  };
}

test('Por columnas: el "GRUPO A" de arriba de los títulos da el nombre de la pestaña', async () => {
  const r = await leerPorColumnas(lecturaDeMentira([['Monarcas', 13, 6, 4, 1, 1], ['Hugo Jara', 6, 6, 2, 0, 4]]));
  assert.equal(r.grupo, 'Grupo A');
  assert.deepEqual(r.filas.map((f) => `${f.equipo} ${f.pts} ${f.pj}`), ['Monarcas 13 6', 'Hugo Jara 6 6']);
});

test('La pestaña se elige sola: grupo, general, o grupo por la cantidad de equipos', () => {
  const filas = (n) => Array.from({ length: n }, (_, i) => ({ equipo: `E${i}` }));
  assert.equal(pestanaDeCaptura({ grupo: 'Grupo A', filas: filas(8) }, []), 'Grupo A');
  assert.equal(pestanaDeCaptura({ grupo: '', filas: filas(16) }, []), 'General');
  const hay = [{ grupo: 'Grupo A', filas: filas(8) }, { grupo: 'General', filas: filas(16) }];
  assert.equal(pestanaDeCaptura({ grupo: '', filas: filas(8) }, hay), 'Grupo A');
  assert.equal(pestanaDeCaptura({ grupo: '', filas: filas(16) }, hay), 'General');
});
