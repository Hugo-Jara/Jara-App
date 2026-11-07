import test from 'node:test';
import assert from 'node:assert/strict';
import { componerEdicion } from '../src/lib/boletinComposicion.js';
import { edicionNueva, bloqueNuevo, validarEdicion } from '../src/lib/boletinDatos.js';

// Superficie de dibujo determinista: registra el texto y fotos que se dibujan.
globalThis.Image = class { width = 1200; height = 800; async decode() {} };
globalThis.document = { createElement() {
  const canvas = { operaciones: [] };
  const ctx = { font: '', measureText: s => ({ width: s.length * 12 }),
    fillText: (texto, x, y) => canvas.operaciones.push({ tipo: 'texto', texto, x, y }),
    drawImage: (img, x, y, w, h) => canvas.operaciones.push({ tipo: 'foto', src: img.src, x, y, w, h }),
    fillRect() {}, strokeRect() {}, save() {}, restore() {}, beginPath() {}, rect() {}, clip() {}, arc() {}, stroke() {} };
  canvas.getContext = () => ctx;
  return canvas;
} };
const crear = (disposicion, texto, mantenerJunta = false) => {
  const e = edicionNueva(4), b = bloqueNuevo('breve');
  b.notas[0] = { ...b.notas[0], titulo: 'Noticias del club', texto, disposicion, mantenerJunta,
    fotos: [{ id: 'foto', src: 'data:image/png;base64,AAAA', x: 50, y: 50, zoom: 1, pie: 'La cancha' }] };
  e.bloques = [b]; return e;
};
const foto = pagina => pagina.operaciones.find(op => op.tipo === 'foto' && op.src.startsWith('data:'));
const cuerpo = pagina => pagina.operaciones.filter(op => op.tipo === 'texto' && op.texto.startsWith('palabra'));

test('las seis distribuciones colocan la foto y el texto en la zona elegida', async () => {
  for (const modo of ['abajo','arriba','lado_izquierda','lado_derecha','rodear_izquierda','rodear_derecha']) {
    const pagina = (await componerEdicion(crear(modo, 'palabra '.repeat(140))))[0];
    const imagen = foto(pagina), lineas = cuerpo(pagina);
    assert.ok(imagen && lineas.length, modo);
    if (modo === 'arriba') assert.ok(imagen.y < lineas[0].y, modo);
    if (modo === 'abajo') assert.ok(imagen.y > lineas[0].y, modo);
    if (modo.includes('izquierda')) assert.ok(imagen.x < lineas[0].x, modo);
    if (modo.includes('derecha')) assert.ok(imagen.x > lineas[0].x, modo);
    if (modo.startsWith('rodear_')) assert.ok(lineas.some(l => l.y > imagen.y + imagen.h && l.x === 46), modo);
    if (modo.startsWith('lado_')) assert.ok(lineas.every(l => l.x === lineas[0].x), modo);
  }
});

test('mantener junta mueve una noticia que cabe completa a la página siguiente', async () => {
  const e = crear('abajo', 'palabra '.repeat(25), true);
  const anterior = bloqueNuevo('breve'); anterior.notas[0].titulo = 'Nota previa'; anterior.notas[0].texto = 'Texto previo. '.repeat(130);
  e.bloques.unshift(anterior);
  const pags = await componerEdicion(e);
  const paginaFoto = pags.findIndex(p => foto(p));
  assert.ok(paginaFoto > 0);
  assert.ok(pags[paginaFoto].operaciones.some(op => op.texto === 'Noticias del club'));
  assert.equal(pags.avisos.length, 0);
});

test('una noticia demasiado larga conserva todo el texto y avisa si no cabe junta', async () => {
  const e = crear('rodear_derecha', Array.from({length: 700}, (_, i) => `palabra${i}`).join(' '), true);
  const pags = await componerEdicion(e);
  assert.ok(pags.length > 1); assert.equal(pags.avisos.length, 1);
  const contenido = pags.flatMap(p => p.operaciones.filter(op => op.tipo === 'texto').map(op => op.texto)).join(' ');
  for (let i = 0; i < 700; i++) assert.match(contenido, new RegExp(`\\bpalabra${i}\\b`));
});

test('los respaldos antiguos y las nuevas opciones siguen siendo compatibles', () => {
  const e = crear('arriba', 'texto', true);
  assert.equal(validarEdicion(e), e);
  delete e.bloques[0].notas[0].disposicion; delete e.bloques[0].notas[0].mantenerJunta;
  assert.equal(validarEdicion(e), e);
  e.bloques[0].notas[0].disposicion = 'desconocida';
  assert.throws(() => validarEdicion(e), /Distribución/);
});

test('las opciones funcionan en una noticia dentro de dos columnas', async () => {
  const e = crear('rodear_izquierda', 'palabra '.repeat(50), true);
  const original = e.bloques[0].notas[0], columnas = bloqueNuevo('columnas');
  columnas.notas[0] = original; columnas.notas[1].titulo = 'Otra noticia'; columnas.notas[1].texto = 'Contenido de la segunda columna.';
  e.bloques = [columnas];
  const paginas = await componerEdicion(e);
  assert.ok(foto(paginas[0]));
  assert.ok(paginas[0].operaciones.some(op => op.texto === 'Otra noticia' && op.x > 640));
  assert.ok(cuerpo(paginas[0]).every(op => op.x < 640));
});
