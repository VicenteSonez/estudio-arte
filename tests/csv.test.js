import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aCsv } from '../js/datos.js';

test('aCsv une columnas de todas las filas y escapa comas, comillas y saltos de línea', () => {
  const csv = aCsv([
    { a: 1, b: 'hola, mundo' },
    { a: 2, c: 'dijo "sí"\nluego' },
  ]);
  assert.equal(csv, 'a,b,c\r\n1,"hola, mundo",\r\n2,,"dijo ""sí""\nluego"');
});

test('aCsv deja vacíos los null y undefined y conserva false y 0', () => {
  assert.equal(aCsv([{ x: null, y: undefined, z: false, w: 0 }]), 'x,y,z,w\r\n,,false,0');
});
