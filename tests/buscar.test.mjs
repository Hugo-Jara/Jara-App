import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buscarPersonas, calce, personasDePlanteles } from '../src/lib/buscar.js';

// Nombres inventados (el repo es público).
const club = [
  { id: 'a', nombre: 'Martín Núñez', apodo: 'el Pulga' },
  { id: 'b', nombre: 'Juan Pablo Rodríguez', apodo: '' },
  { id: 'c', nombre: 'Pablo Moreno', apodo: 'Chino' },
  { id: 'd', nombre: 'Ángel Muñoz' },
  { id: 'e', nombre: 'Tomás Pérez', apodo: 'Tomate' },
];
const ids = (escrito) => buscarPersonas(club, escrito).map((p) => p.id);

test('sin tildes ni mayúsculas', () => {
  assert.deepEqual(ids('nunez'), ['a']);
  assert.deepEqual(ids('ANGEL'), ['d']);
  assert.deepEqual(ids('muñoz'), ['d']);
});

test('por apellido o por apodo', () => {
  assert.deepEqual(ids('moreno'), ['c']);
  assert.deepEqual(ids('pulga'), ['a']);
  assert.deepEqual(ids('chi'), ['c']);
});

test('varias palabras en cualquier orden', () => {
  assert.deepEqual(ids('pab mor'), ['c']);
  assert.deepEqual(ids('rodriguez juan'), ['b']);
  assert.deepEqual(ids('juan juan'), []);
});

test('primero quien empieza con lo escrito', () => {
  // "Pablo Moreno" empieza con "pablo"; "Juan Pablo" lo tiene en medio.
  assert.deepEqual(ids('pablo'), ['c', 'b']);
  // "Tomás" por nombre antes que "Tomate" por apodo (es la misma persona: una sola vez).
  assert.deepEqual(ids('tom'), ['e']);
});

test('en medio de una palabra, desde tres letras', () => {
  assert.deepEqual(ids('driguez'), ['b']);
  assert.equal(calce(club[1], 'dr'), null);
});

test('vacío no sugiere nada y el tope es 6', () => {
  assert.deepEqual(ids('   '), []);
  const muchos = Array.from({ length: 10 }, (_, i) => ({ id: String(i), nombre: `Jugador ${i}` }));
  assert.equal(buscarPersonas(muchos, 'jug').length, 6);
});

test('juntar planteles sin repetir', () => {
  const l = personasDePlanteles([
    { nombre: 'Senior Sábado', jugadores: [{ id: 'a', nombre: 'Martín Núñez' }, { id: 'c', nombre: 'Pablo Moreno' }] },
    { nombre: 'Senior Jueves', jugadores: [{ id: 'a', nombre: 'Martín Núñez' }] },
  ]);
  assert.equal(l.length, 2);
  assert.deepEqual(l.find((p) => p.id === 'a').planteles, ['Senior Sábado', 'Senior Jueves']);
});
