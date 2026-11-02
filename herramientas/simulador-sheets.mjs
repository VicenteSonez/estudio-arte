// Simulador mínimo de Google Sheets / Apps Script para ejecutar
// apps-script/Codigo.gs en Node (servidor local y tests). Implementa solo lo
// que usa Codigo.gs.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

class Rango {
  constructor(hoja, fila, col, nFilas, nCols) {
    Object.assign(this, { hoja, fila, col, nFilas, nCols });
  }

  getValues() {
    const out = [];
    for (let r = 0; r < this.nFilas; r++) {
      const f = this.hoja.filas[this.fila - 1 + r] || [];
      const v = [];
      for (let c = 0; c < this.nCols; c++) v.push(f[this.col - 1 + c] ?? '');
      out.push(v);
    }
    return out;
  }

  setValues(valores) {
    valores.forEach((v, r) => {
      const i = this.fila - 1 + r;
      while (this.hoja.filas.length <= i) this.hoja.filas.push([]);
      v.forEach((x, c) => { this.hoja.filas[i][this.col - 1 + c] = x; });
    });
    return this;
  }

  createTextFinder(texto) {
    const rango = this;
    let entera = false;
    return {
      matchEntireCell(b) { entera = b; return this; },
      findNext() {
        const vals = rango.getValues();
        for (let r = 0; r < vals.length; r++) {
          for (const celda of vals[r]) {
            const s = String(celda);
            if (entera ? s === texto : s.includes(texto)) return { getRow: () => rango.fila + r };
          }
        }
        return null;
      },
    };
  }
}

class Hoja {
  constructor(nombre, filas = []) { this.nombre = nombre; this.filas = filas; }
  getLastRow() { return this.filas.length; }
  getLastColumn() { return Math.max(0, ...this.filas.map((f) => f.length)); }
  appendRow(v) { this.filas.push(v.slice()); }
  setFrozenRows() {}
  getRange(f, c, nf = 1, nc = 1) { return new Rango(this, f, c, nf, nc); }
  getDataRange() {
    return new Rango(this, 1, 1, Math.max(1, this.getLastRow()), Math.max(1, this.getLastColumn()));
  }
}

class Libro {
  constructor(datos = {}) {
    this.hojas = Object.entries(datos).map(([n, filas]) => new Hoja(n, filas));
  }
  getSheetByName(n) { return this.hojas.find((h) => h.nombre === n) || null; }
  insertSheet(n) { const h = new Hoja(n); this.hojas.push(h); return h; }
  aJSON() { return Object.fromEntries(this.hojas.map((h) => [h.nombre, h.filas])); }
}

// Carga Codigo.gs con un libro en memoria (opcionalmente persistido en un JSON).
export function crearBackend(rutaGs, rutaDatos = null) {
  const inicial = rutaDatos && fs.existsSync(rutaDatos) ? JSON.parse(fs.readFileSync(rutaDatos, 'utf8')) : {};
  const libro = new Libro(inicial);
  const contexto = vm.createContext({
    SpreadsheetApp: { getActiveSpreadsheet: () => libro },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: (s) => ({ setMimeType() { return this; }, getContent: () => s }),
    },
    JSON, Math, Date, Number, String, Object,
  });
  vm.runInContext(fs.readFileSync(rutaGs, 'utf8'), contexto, { filename: path.basename(rutaGs) });

  function guardar() {
    if (!rutaDatos) return;
    fs.mkdirSync(path.dirname(rutaDatos), { recursive: true });
    fs.writeFileSync(rutaDatos, JSON.stringify(libro.aJSON(), null, 1));
  }

  return {
    libro,
    doGet(parametros) {
      const r = JSON.parse(contexto.doGet({ parameter: parametros }).getContent());
      guardar();
      return r;
    },
    doPost(cuerpo) {
      const r = JSON.parse(contexto.doPost({ postData: { contents: cuerpo } }).getContent());
      guardar();
      return r;
    },
    // Filas de una hoja como objetos.
    filas(nombre) {
      const h = libro.getSheetByName(nombre);
      if (!h || !h.filas.length) return [];
      const [cab, ...resto] = h.filas;
      return resto.map((f) => Object.fromEntries(cab.map((k, i) => [k, f[i] ?? ''])));
    },
  };
}
