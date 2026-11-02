// Diseño experimental: cuadrado latino 4×4 y armado de los ensayos.
// Módulo puro (sin DOM) para poder testearlo con Node.

export const N_LISTAS = 4;

// Celda = condición. Índice = (i + lista) % 4.
export const CONDICIONES = [
  { fuente: 'original', etiqueta: 'original' }, // 0 verdadera
  { fuente: 'original', etiqueta: 'ia' },       // 1 falsa
  { fuente: 'ia',       etiqueta: 'original' }, // 2 falsa
  { fuente: 'ia',       etiqueta: 'ia' },       // 3 verdadera
];

export const TEXTO_ETIQUETA = {
  original: 'Obra original',
  ia: 'Generada con IA',
};

export function celda(indicePar, lista) {
  return (indicePar + lista) % N_LISTAS;
}

export function listaValida(valor) {
  if (valor === null || valor === undefined || String(valor).trim() === '') return null;
  const n = Number(valor);
  return Number.isInteger(n) && n >= 0 && n < N_LISTAS ? n : null;
}

// Número en [0, 1) con crypto cuando existe.
export function azar() {
  const c = globalThis.crypto;
  if (c && c.getRandomValues) {
    const u = new Uint32Array(1);
    c.getRandomValues(u);
    return u[0] / 2 ** 32;
  }
  return Math.random();
}

// Fisher–Yates sobre una copia.
export function mezclar(arreglo, rng = azar) {
  const a = arreglo.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Los 24 ensayos de una lista, en orden aleatorio. Cada par aparece una sola
// vez, en una sola de sus dos versiones y con una sola etiqueta.
export function construirEnsayos(pares, lista, rng = azar) {
  if (pares.length === 0 || pares.length % N_LISTAS) {
    throw new Error(`El número de pares (${pares.length}) debe ser múltiplo de ${N_LISTAS}`);
  }
  if (listaValida(lista) === null) throw new Error(`Lista inválida: ${lista}`);
  const ensayos = pares.map((par, i) => {
    const c = celda(i, lista);
    const { fuente, etiqueta } = CONDICIONES[c];
    const img = par[fuente];
    return {
      par_id: par.id,
      celda: c,
      fuente,
      etiqueta,
      etiqueta_verdadera: fuente === etiqueta,
      src: img.src,
      ancho: img.ancho,
      alto: img.alto,
    };
  });
  return mezclar(ensayos, rng).map((e, k) => ({ ...e, orden: k + 1 }));
}

// Práctica: las obras en orden aleatorio, con etiquetas alternadas
// (con 2 obras, una de cada etiqueta) y cuál va primero también al azar.
export function construirPractica(practica, rng = azar) {
  const etiquetas = mezclar(['original', 'ia'], rng);
  return mezclar(practica, rng).map((obra, k) => ({
    par_id: obra.id,
    celda: '',
    fuente: 'practica',
    etiqueta: etiquetas[k % 2],
    etiqueta_verdadera: '',
    src: obra.src,
    ancho: obra.ancho,
    alto: obra.alto,
    orden: k + 1,
  }));
}
