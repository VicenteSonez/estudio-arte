import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  CONDICIONES, N_LISTAS, celda, construirEnsayos, construirPractica, listaValida, mezclar,
} from '../js/diseno.js';

const manifiesto = JSON.parse(fs.readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));
const pares = manifiesto.pares;

// Generador con semilla para que las pruebas sean reproducibles.
function rngSemilla(semilla) {
  let s = semilla >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
  };
}

test('el manifiesto tiene 24 pares, cada uno con original e IA distintos', () => {
  assert.equal(pares.length, 24);
  for (const p of pares) {
    assert.ok(p.original.src && p.ia.src, `par ${p.id} incompleto`);
    assert.notEqual(p.original.src, p.ia.src);
    for (const v of [p.original, p.ia]) {
      assert.ok(fs.existsSync(new URL(`../${v.src}`, import.meta.url)), `no existe ${v.src}`);
    }
  }
  assert.equal(new Set(pares.map((p) => p.id)).size, 24, 'ids de par repetidos');
});

for (let lista = 0; lista < N_LISTAS; lista++) {
  test(`lista ${lista}: 24 pares distintos, 6 por celda, ninguna imagen repetida`, () => {
    for (let semilla = 1; semilla <= 50; semilla++) {
      const ensayos = construirEnsayos(pares, lista, rngSemilla(semilla * 7 + lista));
      assert.equal(ensayos.length, 24);
      assert.equal(new Set(ensayos.map((e) => e.par_id)).size, 24, 'un par aparece dos veces');
      assert.equal(new Set(ensayos.map((e) => e.src)).size, 24, 'una imagen aparece dos veces');

      const porCelda = [0, 0, 0, 0];
      for (const e of ensayos) porCelda[e.celda]++;
      assert.deepEqual(porCelda, [6, 6, 6, 6]);

      // Ninguna persona ve las dos versiones de un par.
      const todasLasSrc = new Set(ensayos.map((e) => e.src));
      for (const p of pares) {
        assert.ok(!(todasLasSrc.has(p.original.src) && todasLasSrc.has(p.ia.src)), `ve ambos miembros del par ${p.id}`);
      }

      // Cada ensayo coincide con su celda, su imagen y la veracidad de la etiqueta.
      for (const e of ensayos) {
        const par = pares.find((p) => p.id === e.par_id);
        const c = CONDICIONES[e.celda];
        assert.equal(e.celda, celda(pares.indexOf(par), lista));
        assert.equal(e.fuente, c.fuente);
        assert.equal(e.etiqueta, c.etiqueta);
        assert.equal(e.src, par[e.fuente].src);
        assert.equal(e.etiqueta_verdadera, e.fuente === e.etiqueta);
      }
      assert.equal(ensayos.filter((e) => e.etiqueta_verdadera).length, 12);
      assert.deepEqual(ensayos.map((e) => e.orden), Array.from({ length: 24 }, (_, k) => k + 1));
    }
  });
}

test('a lo largo de las 4 listas cada par pasa por las 4 condiciones', () => {
  const visto = new Map(pares.map((p) => [p.id, new Set()]));
  for (let lista = 0; lista < N_LISTAS; lista++) {
    for (const e of construirEnsayos(pares, lista, rngSemilla(lista))) visto.get(e.par_id).add(e.celda);
  }
  for (const [id, celdas] of visto) assert.deepEqual([...celdas].sort(), [0, 1, 2, 3], `par ${id}`);
});

test('a lo largo de las 4 listas cada imagen aparece exactamente dos veces (una por etiqueta)', () => {
  const usos = new Map();
  for (let lista = 0; lista < N_LISTAS; lista++) {
    for (const e of construirEnsayos(pares, lista, rngSemilla(lista))) {
      const k = e.src;
      usos.set(k, [...(usos.get(k) || []), e.etiqueta]);
    }
  }
  assert.equal(usos.size, 48);
  for (const [src, etiquetas] of usos) assert.deepEqual(etiquetas.sort(), ['ia', 'original'], src);
});

test('el orden se aleatoriza por persona', () => {
  const ordenes = new Set();
  for (let s = 0; s < 20; s++) {
    ordenes.add(construirEnsayos(pares, 0, rngSemilla(s)).map((e) => e.par_id).join(','));
  }
  assert.ok(ordenes.size >= 19, 'los órdenes se repiten demasiado');
});

test('la posición de cada celda en la secuencia no tiene sesgo', () => {
  // Promedio de la posición de cada celda en muchas personas ≈ 12,5.
  const suma = [0, 0, 0, 0];
  const n = 2000;
  const rng = rngSemilla(99);
  for (let k = 0; k < n; k++) {
    for (const e of construirEnsayos(pares, k % 4, rng)) suma[e.celda] += e.orden;
  }
  for (const s of suma) assert.ok(Math.abs(s / (n * 6) - 12.5) < 0.3, `posición media ${s / (n * 6)}`);
});

test('la práctica usa obras propias, todas con la etiqueta «Obra original»', () => {
  const srcEnsayos = new Set(pares.flatMap((p) => [p.original.src, p.ia.src]));
  for (let s = 0; s < 20; s++) {
    const pr = construirPractica(manifiesto.practica, rngSemilla(s));
    assert.equal(pr.length, 2);
    assert.deepEqual(pr.map((e) => e.etiqueta), ['original', 'original']);
    for (const e of pr) assert.ok(!srcEnsayos.has(e.src), 'una obra de práctica se repite en la tarea');
  }
});

test('listaValida acepta solo 0–3', () => {
  assert.equal(listaValida('0'), 0);
  assert.equal(listaValida('3'), 3);
  for (const malo of ['4', '-1', '1.5', 'a', '', null, undefined]) assert.equal(listaValida(malo), null, String(malo));
});

test('construirEnsayos rechaza un número de pares que no es múltiplo de 4', () => {
  assert.throws(() => construirEnsayos(pares.slice(0, 23), 0));
  assert.throws(() => construirEnsayos(pares, 4));
});

test('mezclar conserva los elementos', () => {
  const a = Array.from({ length: 30 }, (_, i) => i);
  assert.deepEqual(mezclar(a, rngSemilla(3)).sort((x, y) => x - y), a);
});
