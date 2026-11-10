import test from 'node:test';
import assert from 'node:assert/strict';
import { componerEdicion } from '../src/lib/boletinComposicion.js';
import { marcoFoto, moverMarco, ampliarMarco, relacionFoto } from '../src/lib/boletinEncuadre.js';
import { dividirFormato, extraerTexto } from '../src/lib/boletinFormato.js';
import { edicionNueva, bloqueNuevo, validarEdicion } from '../src/lib/boletinDatos.js';

// Superficie de dibujo determinista: registra el texto y fotos que se dibujan.
globalThis.Image = class { width = 1200; height = 800; async decode() {} };
globalThis.document = { createElement() {
  const canvas = { operaciones: [] };
  const ctx = { font: '', measureText: s => ({ width: s.length * 12 }),
    fillText: (texto, x, y) => canvas.operaciones.push({ tipo: 'texto', texto, x, y, fuente: ctx.font }),
    drawImage: (img, x, y, w, h) => canvas.operaciones.push({ tipo: 'foto', src: img.src, x, y, w, h }),
    fillRect() {}, strokeRect() {}, save() {}, restore() {}, beginPath() {}, moveTo() {}, quadraticCurveTo() {}, lineTo() {}, closePath() {}, rect() {}, clip() {}, arc() {}, stroke() {} };
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


test('el marco táctil representa la misma zona de recorte que usa el PNG', () => {
  const foto = { x: 30, y: 70, zoom: 1.5 }, relacion = relacionFoto('breve', 'arriba');
  const marco = marcoFoto(1200, 800, relacion, foto);
  const escala = Math.max(1188 / 1200, 350 / 800) * foto.zoom;
  assert.ok(Math.abs(marco.w * 1200 - 1188 / escala) < 1e-8);
  assert.ok(Math.abs(marco.x * 1200 - (1200 - 1188 / escala) * .3) < 1e-8);
  assert.equal(moverMarco(marco, 100, -100).x, 100);
  assert.equal(moverMarco(marco, 100, -100).y, 0);
  const ampliado = ampliarMarco(1200, 800, relacion, foto, 2);
  assert.equal(ampliado.zoom, 2);
  assert.ok(marcoFoto(1200, 800, relacion, ampliado).w < marco.w);
});

test('se conservan marcas superpuestas de negrita y subrayado', () => {
  const texto = 'El Jara informa';
  const tramos = dividirFormato(texto, [{ inicio: 3, fin: 7, negrita: true }, { inicio: 5, fin: 11, subrayado: true }]);
  assert.equal(tramos.map(t => t.texto).join(''), texto);
  assert.ok(tramos.some(t => t.negrita && t.subrayado));
  const elemento = { childNodes: [{ nodeType: 3, nodeValue: 'Hola ' }, { nodeType: 1, tagName: 'STRONG', style: {}, childNodes: [{ nodeType: 3, nodeValue: 'Jara' }] }] };
  assert.deepEqual(extraerTexto(elemento), { texto: 'Hola Jara', formatos: [{ inicio: 5, fin: 9, negrita: true }] });
});

test('el formato y la alineación se dibujan incluso en noticias sin fotos', async () => {
  const e = crear('abajo', 'Texto importante aquí', false);
  e.bloques[0].notas[0].fotos = [];
  e.bloques[0].notas[0].formatos = [{ inicio: 6, fin: 16, negrita: true, subrayado: true }];
  e.bloques[0].notas[0].alineacionTitulo = 'centro';
  e.bloques[0].notas[0].alineacionTexto = 'derecha';
  e.fuente = 'Arial'; validarEdicion(e);
  const pagina = (await componerEdicion(e))[0];
  const titular = pagina.operaciones.find(op => op.texto === 'Noticias del club');
  const resaltado = pagina.operaciones.find(op => op.texto === 'importante');
  assert.ok(titular.x > 46); assert.match(resaltado.fuente, /bold.*Arial/);
  assert.ok(resaltado.x > 46);
  assert.ok(pagina.operaciones.some(op => op.texto === 'BOLETÍN N°4' && op.x === 46));
});

test('frases, cierre y agenda se dibujan y aceptan respaldos anteriores', async () => {
  const e = edicionNueva(4), frase = bloqueNuevo('frase'), cierre = bloqueNuevo('cierre'), agenda = bloqueNuevo('agenda');
  frase.notas[0].texto = 'Frase para destacar'; cierre.notas[0].texto = 'Nos vemos en la cancha';
  agenda.eventos = [{ id: '1', fecha: 'Lunes', titulo: 'Entrenamiento', descripcion: 'A las ocho.' }, { id: '2', fecha: 'Sábado', descripcion: 'Partido.' }];
  e.bloques = [frase, agenda, cierre]; validarEdicion(e);
  const paginas = await componerEdicion(e), lineas = paginas.flatMap(p => p.operaciones.map(o => o.texto));
  for (const esperado of ['Frase para destacar', 'LO QUE VIENE', 'Entrenamiento', 'Nos vemos en la cancha']) assert.ok(lineas.includes(esperado), esperado);
});

test('el texto con énfasis se conserva al dividirse en varias páginas y al respaldar', async () => {
  const texto = Array.from({length: 800}, (_, i) => `dato${i}`).join(' ');
  const e = crear('rodear_izquierda', texto, true), n = e.bloques[0].notas[0];
  const inicio = texto.indexOf('dato510'); n.formatos = [{ inicio, fin: inicio + 7, negrita: true, cursiva: true, subrayado: true }];
  const copia = validarEdicion(JSON.parse(JSON.stringify(e)));
  assert.deepEqual(copia.bloques[0].notas[0].formatos, n.formatos);
  const paginas = await componerEdicion(copia);
  const escritos = paginas.flatMap(p => p.operaciones.filter(o => o.tipo === 'texto'));
  const textoDibujado = escritos.map(o => o.texto).join(' ');
  for (let i = 0; i < 800; i++) assert.match(textoDibujado, new RegExp(`\\bdato${i}\\b`));
  const destacado = escritos.find(o => o.texto === 'dato510');
  assert.match(destacado.fuente, /italic bold/);
});

test('varias noticias se ubican en cada columna sin perder contenido', async () => {
  const e = edicionNueva(5), b = bloqueNuevo('columnas');
  b.notas[0].titulo = 'Izquierda uno'; b.notas[0].texto = 'Uno';
  b.notas[1].titulo = 'Derecha uno'; b.notas[1].texto = 'Dos';
  const { agregarEnColumna } = await import('../src/lib/boletinColumnas.js');
  const ampliado = agregarEnColumna(b, 'izquierda');
  ampliado.notas[2].titulo = 'Izquierda dos'; ampliado.notas[2].texto = 'Tres';
  e.bloques = [ampliado]; validarEdicion(JSON.parse(JSON.stringify(e)));
  const pagina = (await componerEdicion(e))[0];
  const [a, d, c] = ['Izquierda uno', 'Derecha uno', 'Izquierda dos'].map(t => pagina.operaciones.find(op => op.texto === t));
  assert.ok(a && d && c); assert.ok(a.x < 640 && c.x < 640 && d.x > 640); assert.ok(c.y > a.y);
});

test('mover y cambiar formato conserva fotos, encuadre y marcas', async () => {
  const { moverAColumna, cambiarFormato, trasladarNoticia, columnaDe } = await import('../src/lib/boletinColumnas.js');
  const e = crear('abajo', 'Titular con énfasis', false), original = e.bloques[0].notas[0];
  original.formatos = [{ inicio: 0, fin: 7, negrita: true }]; original.fotos[0].x = 17;
  const grupo = bloqueNuevo('columnas'); e.bloques.push(grupo);
  const movida = trasladarNoticia(e, e.bloques[0].id, original.id, grupo.id, 'derecha');
  const grupoNuevo = movida.bloques[0]; assert.equal(grupoNuevo.notas.length, 3);
  const nota = grupoNuevo.notas.find(n => n.id === original.id);
  assert.equal(nota.columna, 'derecha'); assert.deepEqual(nota.fotos, original.fotos); assert.deepEqual(nota.formatos, original.formatos);
  const otra = moverAColumna(grupoNuevo, nota.id, 'izquierda');
  assert.equal(columnaDe(otra.notas.find(n => n.id === nota.id), 2), 'izquierda');
  const individual = cambiarFormato({ ...movida, bloques: [otra] }, otra.id, nota.id, 'principal');
  validarEdicion(JSON.parse(JSON.stringify(individual)));
  assert.equal(individual.bloques.length, 2); assert.equal(individual.bloques[0].notas.length, 2);
  assert.deepEqual(individual.bloques[1].notas[0].fotos, original.fotos);
  assert.deepEqual(individual.bloques[1].notas[0].formatos, original.formatos);
});

test('ajustar la segunda página conserva la primera y permite descartar la propuesta', async () => {
  const { proponerAjuste, firmaPagina } = await import('../src/lib/boletinAjuste.js');
  const e = edicionNueva(5);
  const noticia = (titulo, cantidad) => { const b = bloqueNuevo('breve'); b.notas[0].titulo = titulo; b.notas[0].texto = 'palabra '.repeat(cantidad); b.notas[0].disposicion = 'abajo'; return b; };
  e.bloques = [noticia('Primera página', 340), noticia('Segunda página', 230), noticia('Última noticia', 120)];
  const antes = await componerEdicion(e); assert.ok(antes.length >= 3);
  const propuesta = await proponerAjuste(e, antes, 1, componerEdicion);
  assert.ok(propuesta.edicion, propuesta.error);
  assert.equal(firmaPagina(e, antes.operaciones[0]), firmaPagina(propuesta.edicion, propuesta.paginas.operaciones[0]));
  assert.ok(propuesta.ids.length > 0); assert.equal(e.bloques.some(b => b.compacto), false);
  validarEdicion(JSON.parse(JSON.stringify(propuesta.edicion)));
});

test('se rechaza un ajuste que alteraría una página anterior', async () => {
  const { proponerAjuste } = await import('../src/lib/boletinAjuste.js');
  const e = edicionNueva(1), a = bloqueNuevo('breve'), b = bloqueNuevo('breve'); e.bloques = [a,b];
  const paginas = [0,1,2]; paginas.operaciones = [[{ tipo: 'texto', texto: 'Antes', bloqueId: a.id }], [{ tipo: 'texto', texto: 'Actual', bloqueId: b.id }], [{ tipo: 'texto', texto: 'Más', bloqueId: b.id }]];
  const falso = async () => { const p = [0,1]; p.operaciones = [[{ tipo: 'texto', texto: 'Cambiada', bloqueId: a.id }], [{ tipo: 'texto', texto: 'Actual y más', bloqueId: b.id }]]; return p; };
  const respuesta = await proponerAjuste(e, paginas, 1, falso);
  assert.match(respuesta.error, /página anterior/); assert.equal(respuesta.edicion, undefined);
});


test('la introducción con formato aparece antes de las dos columnas y se valida en el respaldo', async () => {
  const e = edicionNueva(4), b = bloqueNuevo('columnas');
  b.tituloSeccion = 'Nuestra historia'; b.introduccion = 'Once días para celebrar';
  b.formatosIntroduccion = [{ inicio: 0, fin: 4, negrita: true }];
  b.notas[0].titulo = 'Primera columna'; b.notas[1].titulo = 'Segunda columna'; e.bloques = [b];
  assert.doesNotThrow(() => validarEdicion(e));
  const pagina = (await componerEdicion(e))[0];
  const titulo = pagina.operaciones.find(o => o.texto === 'Nuestra historia');
  const palabra = pagina.operaciones.find(o => o.texto === 'Once');
  const nota = pagina.operaciones.find(o => o.texto === 'Primera columna');
  assert.ok(titulo && palabra && nota); assert.ok(titulo.y < palabra.y && palabra.y < nota.y);
  assert.match(palabra.fuente, /bold/);
  b.formatosIntroduccion[0].fin = 999; assert.throws(() => validarEdicion(e));
});
