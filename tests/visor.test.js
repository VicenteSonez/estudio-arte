import test from 'node:test';
import assert from 'node:assert/strict';
import { acercarEn, limitarVista, ZOOM_MAX } from '../js/visor.js';

test('el zoom se mantiene entre 1 y el máximo', () => {
  assert.equal(limitarVista({ z: 0.2, x: 0, y: 0 }, 400, 300).z, 1);
  assert.equal(limitarVista({ z: 99, x: 0, y: 0 }, 400, 300).z, ZOOM_MAX);
});

test('la imagen nunca deja huecos dentro del visor', () => {
  assert.deepEqual(limitarVista({ z: 2, x: 50, y: 50 }, 400, 300), { z: 2, x: 0, y: 0 });
  assert.deepEqual(limitarVista({ z: 2, x: -999, y: -999 }, 400, 300), { z: 2, x: -400, y: -300 });
  assert.deepEqual(limitarVista({ z: 1, x: -30, y: 40 }, 400, 300), { z: 1, x: 0, y: 0 });
});

test('acercar deja fijo el punto indicado', () => {
  const v = acercarEn({ z: 1, x: 0, y: 0 }, 2, 100, 150, 400, 300);
  assert.deepEqual(v, { z: 2, x: -100, y: -150 });
  // El píxel de la imagen bajo (100, 150) sigue siendo el mismo.
  assert.equal((100 - v.x) / v.z, 100);
  assert.equal((150 - v.y) / v.z, 150);
});

test('al volver a zoom 1 la imagen queda completa y centrada', () => {
  const dentro = acercarEn({ z: 1, x: 0, y: 0 }, 3, 200, 100, 400, 300);
  assert.deepEqual(acercarEn(dentro, 1, 50, 50, 400, 300), { z: 1, x: 0, y: 0 });
});
