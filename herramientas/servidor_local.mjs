// Servidor de desarrollo: sirve el sitio y simula el Apps Script en /api
// ejecutando el mismo apps-script/Codigo.gs sobre una hoja en memoria.
//
//   node herramientas/servidor_local.mjs [puerto]
//   Abre http://localhost:8080/?debug=1&api=/api
//
// Los datos quedan en datos_locales/hoja.json (y se exportan a CSV en la misma carpeta).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { crearBackend } from './simulador-sheets.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATOS = path.join(RAIZ, 'datos_locales');
const PUERTO = Number(process.argv[2] || process.env.PORT || 8080);
const backend = crearBackend(path.join(RAIZ, 'apps-script', 'Codigo.gs'), path.join(DATOS, 'hoja.json'));

const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.md': 'text/plain; charset=utf-8',
};

function exportarCsv() {
  for (const nombre of ['Ensayos', 'Sesiones']) {
    const h = backend.libro.getSheetByName(nombre);
    if (!h) continue;
    const csv = h.filas.map((f) => f.map((v) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(',')).join('\n');
    fs.writeFileSync(path.join(DATOS, `${nombre}.csv`), csv);
  }
}

function responderJson(res, objeto) {
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(objeto));
}

http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/api') {
    if (req.method === 'GET') {
      responderJson(res, backend.doGet(Object.fromEntries(url.searchParams)));
      return;
    }
    let cuerpo = '';
    req.on('data', (c) => { cuerpo += c; });
    req.on('end', () => {
      const r = backend.doPost(cuerpo);
      exportarCsv();
      console.log(`POST /api -> ${JSON.stringify(r)}`);
      responderJson(res, r);
    });
    return;
  }

  let ruta = decodeURIComponent(url.pathname);
  if (ruta.endsWith('/')) ruta += 'index.html';
  const archivo = path.join(RAIZ, path.normalize(ruta));
  if (!archivo.startsWith(RAIZ) || !fs.existsSync(archivo) || fs.statSync(archivo).isDirectory()) {
    res.writeHead(404);
    res.end('No encontrado');
    return;
  }
  res.writeHead(200, {
    'Content-Type': TIPOS[path.extname(archivo).toLowerCase()] || 'application/octet-stream',
    'Cache-Control': 'no-cache',
  });
  fs.createReadStream(archivo).pipe(res);
}).listen(PUERTO, () => {
  console.log(`Sitio:       http://localhost:${PUERTO}/`);
  console.log(`Modo prueba: http://localhost:${PUERTO}/?debug=1&api=/api`);
});
