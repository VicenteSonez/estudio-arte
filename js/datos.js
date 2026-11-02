// Persistencia local, envío al Apps Script con reintentos y exportación CSV.

const PREFIJO = 'eiva:v1:';

export function claveEstado(modoPrueba) {
  return PREFIJO + (modoPrueba ? 'estado-prueba' : 'estado');
}

export function leerLocal(clave) {
  try {
    const t = localStorage.getItem(clave);
    return t ? JSON.parse(t) : null;
  } catch {
    return null;
  }
}

export function escribirLocal(clave, valor) {
  try {
    localStorage.setItem(clave, JSON.stringify(valor));
    return true;
  } catch {
    return false;
  }
}

export function borrarLocal(clave) {
  try { localStorage.removeItem(clave); } catch { /* sin almacenamiento */ }
}

export function idAleatorio(largo = 10) {
  const abc = 'abcdefghjkmnpqrstuvwxyz23456789';
  const u = new Uint8Array(largo);
  crypto.getRandomValues(u);
  return Array.from(u, (b) => abc[b % abc.length]).join('');
}

// ------------------------------------------------------------------ red

async function conTiempoLimite(promesa, ms, controlador) {
  const t = setTimeout(() => controlador.abort(), ms);
  try { return await promesa; } finally { clearTimeout(t); }
}

// GET ?accion=asignar. Devuelve la lista o null si no hay servidor.
export async function pedirLista(url, participanteId, modoPrueba) {
  if (!url) return null;
  const ctl = new AbortController();
  const q = new URLSearchParams({ accion: 'asignar', pid: participanteId, prueba: modoPrueba ? '1' : '0' });
  try {
    const r = await conTiempoLimite(fetch(`${url}?${q}`, { signal: ctl.signal }), 8000, ctl);
    const j = await r.json();
    return j.ok && Number.isInteger(j.lista) ? j.lista : null;
  } catch {
    return null;
  }
}

// Envía la fila de sesión y los ensayos aún no confirmados. Un solo envío a la
// vez; si llega otro pedido mientras tanto, se repite al terminar. Si falla,
// reintenta con espera creciente. El servidor ignora ensayos repetidos (uid),
// así que reenviar nunca duplica filas.
export function crearEnviador({ url, obtenerCarga, confirmar, alCambiar }) {
  let enCurso = false;
  let otraVez = false;
  let espera = 4000;
  let temporizador = null;
  let estado = url ? 'pendiente' : 'sin-servidor';

  function avisar(nuevo) {
    estado = nuevo;
    alCambiar && alCambiar(nuevo);
  }

  async function enviar() {
    if (!url) return avisar('sin-servidor');
    if (enCurso) { otraVez = true; return; }
    const carga = obtenerCarga();
    if (!carga) {
      if (estado !== 'error') avisar('al-dia');
      return;
    }
    enCurso = true;
    otraVez = false;
    clearTimeout(temporizador);
    avisar('enviando');
    const ctl = new AbortController();
    try {
      const r = await conTiempoLimite(fetch(url, {
        method: 'POST',
        // text/plain evita la consulta previa CORS, que Apps Script no responde.
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(carga),
        signal: ctl.signal,
      }), 20000, ctl);
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || 'respuesta sin ok');
      confirmar(carga);
      espera = 4000;
      avisar('al-dia');
    } catch (e) {
      avisar('error');
      temporizador = setTimeout(enviar, espera);
      espera = Math.min(espera * 2, 60000);
    } finally {
      enCurso = false;
      if (otraVez) enviar();
    }
  }

  // Último intento al cerrar o esconder la pestaña. No sabemos si llegó, así
  // que no se marca nada como enviado: el siguiente envío lo repite.
  function despedida() {
    if (!url || !navigator.sendBeacon) return;
    const carga = obtenerCarga();
    if (carga) {
      navigator.sendBeacon(url, new Blob([JSON.stringify(carga)], { type: 'text/plain;charset=utf-8' }));
    }
  }

  addEventListener('online', enviar);
  addEventListener('pagehide', despedida);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') despedida();
  });

  return { enviar, estado: () => estado };
}

// ------------------------------------------------------------------ CSV

function celdaCsv(v) {
  if (v === null || v === undefined) return '';
  const t = String(v);
  return /[",\n\r;]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

export function aCsv(filas) {
  const columnas = [];
  for (const f of filas) for (const k of Object.keys(f)) if (!columnas.includes(k)) columnas.push(k);
  const lineas = [columnas.join(',')];
  for (const f of filas) lineas.push(columnas.map((c) => celdaCsv(f[c])).join(','));
  return lineas.join('\r\n');
}

export function descargar(nombre, texto) {
  // BOM para que Excel reconozca los acentos.
  const blob = new Blob(['﻿' + texto], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

// ------------------------------------------------------------------ dispositivo

export function describirDispositivo() {
  const ua = navigator.userAgent;
  const ipad = /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  let tipo = 'escritorio';
  if (ipad || /Tablet|Android(?!.*Mobile)/i.test(ua)) tipo = 'tablet';
  else if (/Mobi|iPhone|iPod|Android/i.test(ua)) tipo = 'movil';
  let so = 'otro';
  if (/iPhone|iPad|iPod/.test(ua) || ipad) so = 'iOS';
  else if (/Android/.test(ua)) so = 'Android';
  else if (/Windows/.test(ua)) so = 'Windows';
  else if (/Mac OS X/.test(ua)) so = 'macOS';
  else if (/Linux/.test(ua)) so = 'Linux';
  return {
    dispositivo: tipo,
    sistema: so,
    pantalla: `${screen.width}x${screen.height}`,
    ventana: `${innerWidth}x${innerHeight}`,
    dpr: Math.round((devicePixelRatio || 1) * 100) / 100,
  };
}
