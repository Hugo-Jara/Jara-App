// Pruebas del detector de carpetas de fotos (src/lib/fotosDrive.js), con
// nombres como los del Drive de la liga. npm run test:fotos-drive
import test from 'node:test';
import assert from 'node:assert/strict';
import { idDeCarpeta, parecido, puntaje, proponer } from '../src/lib/fotosDrive.js';

test('saca el id de los links del Drive', () => {
  assert.equal(idDeCarpeta('https://drive.google.com/drive/folders/1Fu9uCsiq145hzQZoZC-1-jCgVnEg0D8l?usp=sharing'), '1Fu9uCsiq145hzQZoZC-1-jCgVnEg0D8l');
  assert.equal(idDeCarpeta('https://drive.google.com/drive/mobile/folders/1O0PR10zHnnvxuXw_IE4HzyNUsWGLSJnf/1GtXuPnPU8F76zz5Jc44pi7EmYp1-jKtg/1J_7BA3viY3khWTOBo16Isn8_Zi8r9Kbs?usp=sharing&sort=13'), '1J_7BA3viY3khWTOBo16Isn8_Zi8r9Kbs');
  assert.equal(idDeCarpeta('https://drive.google.com/open?id=1Fu9uCsiq145hzQZoZC-1-jCgVnEg0D8l'), '1Fu9uCsiq145hzQZoZC-1-jCgVnEg0D8l');
  assert.equal(idDeCarpeta('  1Fu9uCsiq145hzQZoZC-1-jCgVnEg0D8l '), '1Fu9uCsiq145hzQZoZC-1-jCgVnEg0D8l');
  assert.equal(idDeCarpeta('hola'), null);
  assert.equal(idDeCarpeta(''), null);
});

test('nombres de rivales parecidos', () => {
  assert.equal(parecido('COBS', 'Cobs'), 1);
  assert.equal(parecido('Acharán Jr', 'Acharan'), 1);
  assert.ok(parecido('C. Memo Jr', 'Club Memo') >= 0.5);
  assert.equal(parecido('Zara', 'Toreros'), 0);
});

const partidos = [
  { id: 'a', equipo: 'Junior Sábado', rival: 'Cobs', fecha: '2026-11-01' },
  { id: 'b', equipo: 'Senior Sábado', rival: 'Cobs', fecha: '2026-11-01' },
  { id: 'c', equipo: 'Junior Sábado', rival: 'Pelícanos', fecha: '2026-10-18' },
  { id: 'd', equipo: 'Senior Jueves', rival: 'Fasolita', fecha: '2026-09-24' },
  { id: 'e', equipo: 'Senior Sábado', rival: 'Fasolita', fecha: '2026-09-26' },
];

test('la categoría separa al Junior del Senior', () => {
  const c = { id: 'x', rival: 'COBS', categoria: 'jr', dia: '2026-11-01' };
  assert.ok(puntaje(c, partidos[0]) > 100);
  assert.equal(puntaje(c, partidos[1]), 0);
});

test('el día separa al Senior Sábado del Senior Jueves', () => {
  const c = { id: 'x', rival: 'Fasolita', categoria: 'sr', dia: '2026-09-26' };
  assert.ok(puntaje(c, partidos[4]) > puntaje(c, partidos[3]));
});

test('propone un partido por carpeta y salta lo enlazado', () => {
  const carpetas = [
    { id: 'c1', rival: 'COBS', categoria: 'jr', dia: '2026-11-01' },
    { id: 'c2', rival: 'Pelícanos', categoria: 'jr', dia: '2026-10-18' },
    { id: 'c3', rival: 'Fasolita', categoria: 'sr', dia: '2026-09-26' },
    { id: 'c4', rival: 'Rival que no está', categoria: 'jr', dia: '2026-08-01' },
  ];
  const { propuestas, sinPartido } = proponer(carpetas, partidos, [{ carpetaId: 'c2', partidoId: 'c' }]);
  const mapa = Object.fromEntries(propuestas.map((p) => [p.carpeta.id, p.partido.id]));
  assert.deepEqual(mapa, { c1: 'a', c3: 'e' });
  assert.deepEqual(sinPartido.map((c) => c.id), ['c4']);
});

test('sin fecha en las fotos usa cuándo se creó la carpeta', () => {
  const c = { id: 'x', rival: 'Pelícanos', categoria: 'jr', dia: null, creada: '2026-10-21T18:35:51Z' };
  assert.ok(puntaje(c, partidos[2]) >= 60);
});

test('el mismo rival en otro torneo no se propone', () => {
  // Cabaret en la Apertura (abril) y en la Clausura (noviembre).
  const cabaret = { id: 'n', equipo: 'Senior Sábado', rival: 'Cabaret', fecha: '2026-11-08' };
  const vieja = { id: 'v', rival: 'Cabaret', categoria: 'sr', dia: '2026-04-18' };
  assert.equal(puntaje(vieja, cabaret), 0);
  assert.equal(puntaje({ ...vieja, dia: null, creada: '2026-04-21T10:00:00Z' }, cabaret), 0);
  assert.equal(puntaje({ ...vieja, dia: null, creada: null }, cabaret), 0);
  const { propuestas, sinPartido } = proponer([vieja], [cabaret]);
  assert.equal(propuestas.length, 0);
  assert.deepEqual(sinPartido.map((c) => c.id), ['v']);
});
