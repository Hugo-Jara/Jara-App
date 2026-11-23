import { test } from 'node:test';
import assert from 'node:assert/strict';
import { codigoYoutube } from '../src/lib/documental.js';

test('entiende los enlaces de YouTube que se copian desde el celular y el computador', () => {
  const c = 'dQw4w9WgXcQ';
  for (const e of [
    `https://youtu.be/${c}`, `https://youtu.be/${c}?si=abc123`, `https://www.youtube.com/watch?v=${c}`,
    `https://m.youtube.com/watch?v=${c}&t=10s`, `https://youtube.com/shorts/${c}`, `https://www.youtube.com/embed/${c}`,
    `  https://youtu.be/${c}  `, c,
  ]) assert.equal(codigoYoutube(e), c, e);
});

test('lo que no es YouTube queda vacío', () => {
  for (const e of ['', null, 'hola', 'https://drive.google.com/file/d/xyz/view', 'https://youtu.be/', 'https://evil.com/watch?v=dQw4w9WgXcQ'])
    assert.equal(codigoYoutube(e), null, String(e));
});
