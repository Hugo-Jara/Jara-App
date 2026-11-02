// Pruebas del modelo de El Jara Informa (sin navegador ni base de datos).
// Se corren con: npm run test:boletin
import test from 'node:test';
import assert from 'node:assert/strict';
import { CATALOGO, agregarFotos, actualizarFoto, edicionNueva, moverFoto, ordenarCatalogo, quitarFoto, validarEdicion } from '../src/lib/boletinDatos.js';

const foto = (id, extra = {}) => ({ id, src: 'data:image/png;base64,AAAA', original: `${id}.png`, x: 50, y: 50, zoom: 1, pie: '', ...extra });

// Simula el estado del editor: cada cambio es una función sobre la lista vigente,
// igual que hace React con setEdicion(prev => ...).
function editor(inicial) {
  let fotos = inicial;
  return { aplicar: fn => { fotos = fn(fotos); }, get fotos() { return fotos; } };
}

test('una carga lenta no pisa el encuadre ni el pie editados mientras tanto', () => {
  const e = editor([foto('a')]);
  // Comienza la carga de «b» (asíncrona). Mientras se lee, se ajusta «a».
  e.aplicar(f => actualizarFoto(f, 'a', { zoom: 2, x: 10 }));
  e.aplicar(f => actualizarFoto(f, 'a', { pie: 'Pie escrito durante la carga' }));
  // Termina la carga de «b».
  e.aplicar(f => agregarFotos(f, [foto('b')]));
  assert.deepEqual(e.fotos.map(f => f.id), ['a', 'b']);
  assert.equal(e.fotos[0].zoom, 2);
  assert.equal(e.fotos[0].x, 10);
  assert.equal(e.fotos[0].pie, 'Pie escrito durante la carga');
});

test('dos cargas simultáneas en la misma noticia conservan todas las fotos', () => {
  const e = editor([]);
  e.aplicar(f => agregarFotos(f, [foto('b1')]));
  e.aplicar(f => agregarFotos(f, [foto('c1')]));
  e.aplicar(f => agregarFotos(f, [foto('b2')]));
  assert.deepEqual(e.fotos.map(f => f.id), ['b1', 'c1', 'b2']);
});

test('quitar u ordenar durante la carga actúa sobre la foto correcta', () => {
  const e = editor([foto('a'), foto('b'), foto('c')]);
  e.aplicar(f => quitarFoto(f, 'a'));
  e.aplicar(f => moverFoto(f, 'c', -1));
  e.aplicar(f => actualizarFoto(f, 'b', { pie: 'sigue siendo b' }));
  e.aplicar(f => agregarFotos(f, [foto('d')]));
  assert.deepEqual(e.fotos.map(f => f.id), ['c', 'b', 'd']);
  assert.equal(e.fotos.find(f => f.id === 'b').pie, 'sigue siendo b');
});

test('moverFoto no se sale de los bordes y agregarFotos no duplica ids', () => {
  const fotos = [foto('a'), foto('b')];
  assert.equal(moverFoto(fotos, 'a', -1), fotos);
  assert.equal(moverFoto(fotos, 'b', 1), fotos);
  assert.equal(moverFoto(fotos, 'x', 1), fotos);
  assert.deepEqual(agregarFotos(fotos, [foto('a')]).map(f => f.id), ['a', 'b']);
});

test('la edición de número mayor queda como última y reemplaza a la anterior', () => {
  assert.equal(CATALOGO[0].numero, Math.max(...CATALOGO.map(e => e.numero)));
  assert.deepEqual(CATALOGO.map(e => e.numero), [3, 2]);
  const conNueva = ordenarCatalogo([...CATALOGO, { ...edicionNueva(4), id: 'demo-4' }]);
  assert.equal(conNueva[0].numero, 4);
  assert.deepEqual(conNueva.slice(1).map(e => e.numero), [3, 2]);
  assert.equal(new Set(CATALOGO.map(e => e.numero)).size, CATALOGO.length, 'no hay dos ediciones con el mismo número');
});

test('las ediciones del catálogo y una edición con fotos editadas son válidas', () => {
  CATALOGO.forEach(validarEdicion);
  const e = edicionNueva(4);
  e.bloques = [{ id: 'b', tipo: 'breve', notas: [{ id: 'n', titulo: 't', texto: 'x', fotos: [foto('a', { zoom: 3, x: 0, y: 100 })] }], eventos: [] }];
  assert.equal(validarEdicion(e), e);
  e.bloques[0].notas[0].fotos[0].zoom = 4;
  assert.throws(() => validarEdicion(e));
});
