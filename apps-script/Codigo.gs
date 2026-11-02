/**
 * Backend del experimento «Etiqueta IA y valor del arte».
 * Se pega en Extensiones > Apps Script de una hoja de cálculo de Google y se
 * despliega como aplicación web (ver README).
 *
 * Hojas que crea solo:
 *   Ensayos  · una fila por ensayo (formato largo). No repite ensayos (columna uid).
 *   Sesiones · una fila por participante; se actualiza en cada envío.
 *
 * Protocolo (lo usa js/datos.js):
 *   POST  cuerpo JSON {sesion: {...}, ensayos: [{...}]}      -> {ok: true}
 *   GET   ?accion=asignar&pid=XXX&prueba=0|1                  -> {ok: true, lista: 0..3}
 *   GET   ?accion=estado                                      -> conteos por lista
 */

var HOJA_ENSAYOS = 'Ensayos';
var HOJA_SESIONES = 'Sesiones';
var N_LISTAS = 4;
// Una sesión incompleta «reserva» su lista durante este tiempo. Así, si muchas
// personas abren el enlace a la vez, no caen todas en la misma lista.
var MINUTOS_RESERVA = 30;

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    var datos = JSON.parse(e.postData.contents);
    if (datos.sesion && datos.sesion.participante_id) {
      upsert_(hoja_(HOJA_SESIONES), 'participante_id', datos.sesion);
    }
    var nuevos = 0;
    if (datos.ensayos && datos.ensayos.length) {
      nuevos = agregarEnsayos_(hoja_(HOJA_ENSAYOS), datos.ensayos);
    }
    return json_({ ok: true, ensayos_nuevos: nuevos });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.accion === 'asignar') return asignar_(p.pid, p.prueba === '1');
  if (p.accion === 'estado') return json_({ ok: true, conteos: conteos_() });
  return json_({ ok: true, mensaje: 'Backend del estudio funcionando.' });
}

// Lista con menos sesiones completas + incompletas recientes (empates al azar).
// Las sesiones de modo prueba no cuentan. Deja una fila provisional en Sesiones.
function asignar_(pid, prueba) {
  if (!pid) return json_({ ok: false, error: 'falta pid' });
  var lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    var hoja = hoja_(HOJA_SESIONES);
    var existente = buscarFila_(hoja, 'participante_id', pid);
    if (existente) {
      var previa = leerFila_(hoja, existente).lista;
      if (previa !== '' && Number(previa) >= 0 && Number(previa) < N_LISTAS) {
        return json_({ ok: true, lista: Number(previa) });
      }
    }
    var c = conteos_();
    var carga = [];
    for (var l = 0; l < N_LISTAS; l++) carga.push(c.completas[l] + c.reservadas[l]);
    var minimo = Math.min.apply(null, carga);
    var candidatas = [];
    for (var k = 0; k < N_LISTAS; k++) if (carga[k] === minimo) candidatas.push(k);
    var lista = candidatas[Math.floor(Math.random() * candidatas.length)];
    var ahora = new Date().toISOString();
    upsert_(hoja, 'participante_id', {
      participante_id: pid, lista: lista, lista_origen: 'servidor', completa: false,
      etapa: 'asignada', modo_prueba: prueba, ultima_actualizacion: ahora,
    });
    return json_({ ok: true, lista: lista });
  } finally {
    lock.releaseLock();
  }
}

function conteos_() {
  var completas = [0, 0, 0, 0];
  var reservadas = [0, 0, 0, 0];
  var hoja = hoja_(HOJA_SESIONES);
  var valores = hoja.getDataRange().getValues();
  var cab = valores[0];
  var iL = cab.indexOf('lista');
  var iC = cab.indexOf('completa');
  var iP = cab.indexOf('modo_prueba');
  var iU = cab.indexOf('ultima_actualizacion');
  var limite = Date.now() - MINUTOS_RESERVA * 60000;
  for (var r = 1; r < valores.length; r++) {
    var fila = valores[r];
    var l = Number(fila[iL]);
    if (fila[iL] === '' || !(l >= 0 && l < N_LISTAS)) continue;
    if (iP >= 0 && esVerdadero_(fila[iP])) continue;
    if (esVerdadero_(fila[iC])) completas[l]++;
    else if (iU >= 0 && new Date(fila[iU]).getTime() > limite) reservadas[l]++;
  }
  return { completas: completas, reservadas: reservadas };
}

// ------------------------------------------------------------------ utilidades

function hoja_(nombre) {
  var libro = SpreadsheetApp.getActiveSpreadsheet();
  var hoja = libro.getSheetByName(nombre) || libro.insertSheet(nombre);
  if (hoja.getLastRow() === 0) {
    var base = nombre === HOJA_ENSAYOS ? ['uid', 'participante_id'] : ['participante_id'];
    hoja.appendRow(base);
    hoja.setFrozenRows(1);
  }
  return hoja;
}

// Devuelve los encabezados y agrega al final los que falten.
function columnas_(hoja, claves) {
  var cab = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0];
  var nuevas = claves.filter(function (k) { return cab.indexOf(k) < 0; });
  if (nuevas.length) {
    hoja.getRange(1, cab.length + 1, 1, nuevas.length).setValues([nuevas]);
    cab = cab.concat(nuevas);
  }
  return cab;
}

function buscarFila_(hoja, columna, valor) {
  var cab = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0];
  var c = cab.indexOf(columna);
  if (c < 0 || hoja.getLastRow() < 2) return 0;
  var celda = hoja.getRange(2, c + 1, hoja.getLastRow() - 1, 1)
    .createTextFinder(String(valor)).matchEntireCell(true).findNext();
  return celda ? celda.getRow() : 0;
}

function leerFila_(hoja, fila) {
  var cab = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0];
  var val = hoja.getRange(fila, 1, 1, cab.length).getValues()[0];
  var o = {};
  cab.forEach(function (k, i) { o[k] = val[i]; });
  return o;
}

// Inserta o actualiza (solo las claves recibidas) la fila cuyo `clave` coincide.
function upsert_(hoja, clave, objeto) {
  var cab = columnas_(hoja, Object.keys(objeto));
  var fila = buscarFila_(hoja, clave, objeto[clave]);
  if (!fila) {
    hoja.appendRow(cab.map(function (k) { return valor_(objeto[k]); }));
    return;
  }
  var rango = hoja.getRange(fila, 1, 1, cab.length);
  var actual = rango.getValues()[0];
  rango.setValues([cab.map(function (k, i) { return k in objeto ? valor_(objeto[k]) : actual[i]; })]);
}

function agregarEnsayos_(hoja, ensayos) {
  var claves = [];
  ensayos.forEach(function (e) {
    Object.keys(e).forEach(function (k) { if (claves.indexOf(k) < 0) claves.push(k); });
  });
  var cab = columnas_(hoja, claves);
  var cUid = cab.indexOf('uid');
  var existentes = {};
  if (hoja.getLastRow() > 1) {
    hoja.getRange(2, cUid + 1, hoja.getLastRow() - 1, 1).getValues()
      .forEach(function (f) { existentes[f[0]] = true; });
  }
  var filas = [];
  ensayos.forEach(function (e) {
    if (!e.uid || existentes[e.uid]) return;
    existentes[e.uid] = true;
    filas.push(cab.map(function (k) { return valor_(e[k]); }));
  });
  if (filas.length) {
    hoja.getRange(hoja.getLastRow() + 1, 1, filas.length, cab.length).setValues(filas);
  }
  return filas.length;
}

function valor_(v) {
  if (v === undefined || v === null) return '';
  // Evita que Sheets interprete como fórmula un texto escrito por un participante.
  if (typeof v === 'string' && /^[=+\-@]/.test(v)) return "'" + v;
  return v;
}

function esVerdadero_(v) {
  return v === true || v === 'TRUE' || v === 'true';
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
