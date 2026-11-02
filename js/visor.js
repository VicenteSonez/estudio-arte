// Zoom y desplazamiento de la obra. La geometría es pura para poder testearla con Node.

export const ZOOM_MAX = 4;
const PASO_BOTON = 1.5;
const PASO_FLECHA = 60;

// Mantiene el zoom en rango y evita que la imagen deje huecos dentro del visor.
export function limitarVista({ z, x, y }, ancho, alto) {
  const zoom = Math.min(ZOOM_MAX, Math.max(1, z));
  return {
    z: zoom,
    x: Math.min(0, Math.max(ancho - ancho * zoom, x)),
    y: Math.min(0, Math.max(alto - alto * zoom, y)),
  };
}

// Cambia el zoom dejando fijo el punto (px, py) del visor.
export function acercarEn(vista, z, px, py, ancho, alto) {
  const zoom = Math.min(ZOOM_MAX, Math.max(1, z));
  const k = zoom / vista.z;
  return limitarVista({ z: zoom, x: px - (px - vista.x) * k, y: py - (py - vista.y) * k }, ancho, alto);
}

// Conecta rueda, arrastre, pellizco, doble clic, teclado y botones.
export function activarVisor(visor, img, botones) {
  let vista = { z: 1, x: 0, y: 0 };
  let zoomMax = 1;
  let pellizco = null;
  const punteros = new Map();

  const ancho = () => visor.clientWidth;
  const alto = () => visor.clientHeight;

  const aplicar = (nueva) => {
    vista = nueva;
    zoomMax = Math.max(zoomMax, vista.z);
    img.style.transform = `translate(${vista.x}px, ${vista.y}px) scale(${vista.z})`;
    visor.classList.toggle('ampliada', vista.z > 1);
    botones.alejar.disabled = vista.z <= 1;
    botones.acercar.disabled = vista.z >= ZOOM_MAX;
    botones.completa.hidden = vista.z <= 1;
  };
  const zoomA = (z, px = ancho() / 2, py = alto() / 2) => aplicar(acercarEn(vista, z, px, py, ancho(), alto()));
  const mover = (dx, dy) => aplicar(limitarVista({ ...vista, x: vista.x + dx, y: vista.y + dy }, ancho(), alto()));
  const verCompleta = () => aplicar({ z: 1, x: 0, y: 0 });

  const posicion = (ev) => {
    const r = visor.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  };
  const medirPellizco = () => {
    const [a, b] = [...punteros.values()];
    return { d: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  };

  visor.addEventListener('wheel', (ev) => {
    // Sin zoom, alejar con la rueda sigue moviendo la página.
    if (vista.z <= 1 && ev.deltaY > 0) return;
    ev.preventDefault();
    const delta = ev.deltaY * (ev.deltaMode === 1 ? 16 : 1);
    const p = posicion(ev);
    zoomA(vista.z * Math.exp(-delta * 0.002), p.x, p.y);
  }, { passive: false });

  visor.addEventListener('pointerdown', (ev) => {
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
    visor.setPointerCapture(ev.pointerId);
    punteros.set(ev.pointerId, posicion(ev));
    pellizco = punteros.size === 2 ? { ...medirPellizco(), z: vista.z } : null;
  });

  visor.addEventListener('pointermove', (ev) => {
    const previo = punteros.get(ev.pointerId);
    if (!previo) return;
    const p = posicion(ev);
    punteros.set(ev.pointerId, p);
    if (pellizco && punteros.size === 2) {
      const m = medirPellizco();
      zoomA(pellizco.z * (m.d / pellizco.d), m.x, m.y);
      mover(m.x - pellizco.x, m.y - pellizco.y);
      pellizco.x = m.x;
      pellizco.y = m.y;
    } else if (punteros.size === 1) {
      mover(p.x - previo.x, p.y - previo.y);
    }
  });

  const soltar = (ev) => {
    punteros.delete(ev.pointerId);
    pellizco = null;
  };
  visor.addEventListener('pointerup', soltar);
  visor.addEventListener('pointercancel', soltar);

  visor.addEventListener('dblclick', (ev) => {
    if (vista.z > 1) { verCompleta(); return; }
    const p = posicion(ev);
    zoomA(2.5, p.x, p.y);
  });

  visor.addEventListener('keydown', (ev) => {
    const acciones = {
      '+': () => zoomA(vista.z * PASO_BOTON),
      '=': () => zoomA(vista.z * PASO_BOTON),
      '-': () => zoomA(vista.z / PASO_BOTON),
      0: verCompleta,
      ArrowLeft: () => mover(PASO_FLECHA, 0),
      ArrowRight: () => mover(-PASO_FLECHA, 0),
      ArrowUp: () => mover(0, PASO_FLECHA),
      ArrowDown: () => mover(0, -PASO_FLECHA),
    };
    const accion = acciones[ev.key];
    if (!accion) return;
    ev.preventDefault();
    accion();
  });

  botones.acercar.addEventListener('click', () => zoomA(vista.z * PASO_BOTON));
  botones.alejar.addEventListener('click', () => zoomA(vista.z / PASO_BOTON));
  botones.completa.addEventListener('click', verCompleta);

  aplicar(vista);
  return {
    reencuadrar: () => aplicar(limitarVista(vista, ancho(), alto())),
    zoomMaximo: () => Math.round(zoomMax * 100) / 100,
  };
}
