// Ejecuta apps-script/Codigo.gs sobre el simulador de Sheets.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { crearBackend } from '../herramientas/simulador-sheets.mjs';

const GS = fileURLToPath(new URL('../apps-script/Codigo.gs', import.meta.url));

const ensayo = (pid, orden, extra = {}) => ({
  uid: `${pid}-e${orden}`, participante_id: pid, orden, valor: 5, es_practica: false, ...extra,
});

test('guarda la sesión y los ensayos; un reenvío no duplica filas', () => {
  const b = crearBackend(GS);
  const carga = { sesion: { participante_id: 'aaa', lista: 2, completa: false }, ensayos: [ensayo('aaa', 1), ensayo('aaa', 2)] };
  assert.deepEqual(b.doPost(JSON.stringify(carga)), { ok: true, ensayos_nuevos: 2 });
  assert.deepEqual(b.doPost(JSON.stringify(carga)), { ok: true, ensayos_nuevos: 0 });
  assert.equal(b.filas('Ensayos').length, 2);
  assert.equal(b.filas('Sesiones').length, 1);
});

test('la sesión se actualiza en su misma fila y conserva columnas no enviadas', () => {
  const b = crearBackend(GS);
  b.doPost(JSON.stringify({ sesion: { participante_id: 'x', lista: 1, edad: 24, completa: false }, ensayos: [] }));
  b.doPost(JSON.stringify({ sesion: { participante_id: 'x', completa: true, chequeo_proposito: 'no sé' }, ensayos: [] }));
  const s = b.filas('Sesiones');
  assert.equal(s.length, 1);
  assert.equal(s[0].edad, 24);
  assert.equal(s[0].completa, true);
  assert.equal(s[0].chequeo_proposito, 'no sé');
});

test('columnas nuevas se agregan al final sin romper las anteriores', () => {
  const b = crearBackend(GS);
  b.doPost(JSON.stringify({ ensayos: [ensayo('p', 1)] }));
  b.doPost(JSON.stringify({ ensayos: [ensayo('p', 2, { nueva: 'z' })] }));
  const e = b.filas('Ensayos');
  assert.equal(e[0].nueva, '');
  assert.equal(e[1].nueva, 'z');
  assert.equal(e[1].valor, 5);
});

test('un texto que empieza con = no se guarda como fórmula', () => {
  const b = crearBackend(GS);
  b.doPost(JSON.stringify({ sesion: { participante_id: 'f', chequeo_proposito: '=IMPORTXML("x")' } }));
  assert.equal(b.filas('Sesiones')[0].chequeo_proposito, "'=IMPORTXML(\"x\")");
});

test('JSON inválido responde ok:false', () => {
  const b = crearBackend(GS);
  assert.equal(b.doPost('{no es json').ok, false);
});

test('asignar elige la lista con menos sesiones y repite la misma para el mismo pid', () => {
  const b = crearBackend(GS);
  // Listas 0, 1 y 2 con una sesión completa cada una -> la siguiente debe ser 3.
  for (const [pid, lista] of [['a', 0], ['b', 1], ['c', 2]]) {
    b.doPost(JSON.stringify({ sesion: { participante_id: pid, lista, completa: true, modo_prueba: false } }));
  }
  const r = b.doGet({ accion: 'asignar', pid: 'nuevo', prueba: '0' });
  assert.deepEqual(r, { ok: true, lista: 3 });
  assert.deepEqual(b.doGet({ accion: 'asignar', pid: 'nuevo', prueba: '0' }), { ok: true, lista: 3 });
});

test('asignar reparte entre personas que llegan a la vez y no cuenta el modo prueba', () => {
  const b = crearBackend(GS);
  for (let k = 0; k < 6; k++) {
    b.doPost(JSON.stringify({ sesion: { participante_id: `t${k}`, lista: 0, completa: true, modo_prueba: true } }));
  }
  const listas = [];
  for (let k = 0; k < 8; k++) listas.push(b.doGet({ accion: 'asignar', pid: `n${k}`, prueba: '0' }).lista);
  const conteo = [0, 0, 0, 0];
  for (const l of listas) conteo[l]++;
  assert.deepEqual(conteo, [2, 2, 2, 2]);
});

test('estado devuelve los conteos', () => {
  const b = crearBackend(GS);
  b.doPost(JSON.stringify({ sesion: { participante_id: 'a', lista: 1, completa: true } }));
  const r = b.doGet({ accion: 'estado' });
  assert.deepEqual(r.conteos.completas, [0, 1, 0, 0]);
});
