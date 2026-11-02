// Flujo del experimento «Etiqueta IA y valor del arte».
import {
  construirEnsayos, construirPractica, listaValida, N_LISTAS, TEXTO_ETIQUETA, azar,
} from './diseno.js';
import {
  claveEstado, leerLocal, escribirLocal, borrarLocal, idAleatorio, pedirLista,
  crearEnviador, aCsv, descargar, describirDispositivo,
} from './datos.js';
import { activarVisor } from './visor.js';

const VERSION_APP = '1.1.0';

const CFG = Object.assign(
  { URL_APPS_SCRIPT: '', SEGUNDOS_ESPERA: 4, MODO_PRUEBA: false, CONTACTO: '' },
  window.CONFIG || {},
);
const params = new URLSearchParams(location.search);
const PRUEBA = CFG.MODO_PRUEBA === true || params.get('debug') === '1';
// En modo prueba se puede apuntar a otro servidor (p. ej. ?api=/api del servidor local).
const URL_API = (PRUEBA && params.get('api')) || CFG.URL_APPS_SCRIPT || '';
const CLAVE = claveEstado(PRUEBA);
const ESPERA_MS = Math.max(0, Number(CFG.SEGUNDOS_ESPERA) || 0) * 1000;

const PREGUNTAS = [
  { clave: 'valor', texto: '¿Cuánto valor artístico tiene esta obra?' },
  { clave: 'agrado', texto: '¿Cuánto te agrada y qué tan bella te parece?' },
  { clave: 'profundidad', texto: '¿Qué tan profunda o significativa te parece?' },
];
const ETAPAS_EN_CURSO = ['practica', 'transicion', 'ensayos',
  'chequeo-proposito', 'chequeo-credibilidad', 'chequeo-reconocimiento', 'chequeo-ficha'];

const app = document.getElementById('app');
let E = null;          // estado de la sesión (se guarda en localStorage)
let manifiesto = null;
let enviador = null;
const precargadas = [];

// ================================================================ estado

function estadoNuevo() {
  return {
    version_app: VERSION_APP,
    participante_id: idAleatorio(),
    modo_prueba: PRUEBA,
    etapa: 'consentimiento',
    registrada: false,       // true desde que entrega edad válida: recién ahí se envía algo
    lista: null,
    lista_origen: null,
    edad: null,
    genero: '',
    dispositivo: null,
    plan_practica: null,
    plan: null,
    indice: 0,
    filas: [],               // ensayos respondidos (formato largo)
    enviados: [],            // uid de ensayos confirmados por el servidor
    chequeos: {},
    t_inicio: null,
    t_fin: null,
    completa: false,
    rev: 0,                  // cambia con cada guardado; sirve para saber si la sesión cambió
    rev_enviada: -1,
  };
}

function guardar() {
  E.rev += 1;
  E.ultima_actualizacion = new Date().toISOString();
  escribirLocal(CLAVE, E);
}

function filaSesion() {
  const c = E.chequeos;
  const fin = E.t_fin || Date.now();
  return {
    participante_id: E.participante_id,
    lista: E.lista,
    lista_origen: E.lista_origen,
    edad: E.edad,
    genero: E.genero,
    chequeo_proposito: c.proposito ?? '',
    chequeo_credibilidad: c.credibilidad ?? '',
    chequeo_reconocio: c.reconocio ?? '',
    chequeo_reconocio_cual: c.reconocio_cual ?? '',
    chequeo_ficha_incorrecta: c.ficha_incorrecta ?? '',
    chequeo_ficha_cual: c.ficha_cual ?? '',
    duracion_total_ms: E.t_inicio ? fin - E.t_inicio : '',
    completa: E.completa,
    etapa: E.etapa,
    ensayos_completados: E.filas.filter((f) => !f.es_practica).length,
    ...(E.dispositivo || {}),
    version_app: VERSION_APP,
    modo_prueba: E.modo_prueba,
    inicio: E.t_inicio ? new Date(E.t_inicio).toISOString() : '',
    fin: E.t_fin ? new Date(E.t_fin).toISOString() : '',
    ultima_actualizacion: E.ultima_actualizacion,
  };
}

function obtenerCarga() {
  if (!E.registrada) return null;
  const ensayos = E.filas.filter((f) => !E.enviados.includes(f.uid));
  if (!ensayos.length && E.rev === E.rev_enviada) return null;
  return { sesion: filaSesion(), ensayos, rev: E.rev };
}

function confirmar(carga) {
  for (const f of carga.ensayos) if (!E.enviados.includes(f.uid)) E.enviados.push(f.uid);
  E.rev_enviada = Math.max(E.rev_enviada, carga.rev);
  // Guardar sin subir rev: el cambio de rev_enviada no es un cambio de la sesión.
  escribirLocal(CLAVE, E);
}

// ================================================================ utilidades

const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (ch) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

function pintar(html, clase = '') {
  app.className = clase;
  app.innerHTML = html;
  window.scrollTo(0, 0);
  const titulo = app.querySelector('h1');
  if (titulo) { titulo.tabIndex = -1; titulo.focus({ preventScroll: true }); }
}

const $ = (sel, raiz = app) => raiz.querySelector(sel);
const $$ = (sel, raiz = app) => Array.from(raiz.querySelectorAll(sel));

function ir(etapa) {
  E.etapa = etapa;
  guardar();
  mostrar();
}

function precargar(lista) {
  for (const e of lista) {
    if (!e) continue;
    const im = new Image();
    im.decoding = 'async';
    im.src = e.src;
    precargadas.push(im);
    if (precargadas.length > 8) precargadas.shift();
  }
}

function escalaHTML(nombre, texto, anclas = ['Nada', 'Muchísimo']) {
  const botones = [1, 2, 3, 4, 5, 6, 7].map((v) => (
    `<button type="button" class="op" data-v="${v}" aria-pressed="false">${v}</button>`)).join('');
  return `
    <fieldset class="pregunta" data-clave="${nombre}">
      <legend>${esc(texto)}</legend>
      <div class="escala" role="group">${botones}</div>
      <div class="anclas" aria-hidden="true"><span>${anclas[0]}</span><span>${anclas[1]}</span></div>
    </fieldset>`;
}

// Activa un grupo de botones de opción única. alElegir(valor, boton)
function opcionUnica(contenedor, alElegir) {
  contenedor.addEventListener('click', (ev) => {
    const b = ev.target.closest('button[data-v]');
    if (!b || b.closest('fieldset:disabled')) return;
    for (const o of contenedor.querySelectorAll('button[data-v]')) o.setAttribute('aria-pressed', String(o === b));
    alElegir(b.dataset.v, b);
  });
}

// ================================================================ pantallas

function pantallaConsentimiento() {
  pintar(`
    <main class="hoja">
      <p class="sobrelinea">Estudio en línea</p>
      <h1>Cómo valoramos las obras de arte</h1>
      <p>Te invitamos a participar en un estudio sobre cómo las personas valoran obras de arte.
      Verás una serie de pinturas y responderás tres preguntas breves sobre cada una.</p>
      <dl class="claves">
        <div><dt>Duración</dt><dd>Entre 10 y 12 minutos.</dd></div>
        <div><dt>Anónimo</dt><dd>No pedimos tu nombre ni datos de contacto; solo tu edad y, si quieres, tu género.</dd></div>
        <div><dt>Voluntario</dt><dd>Puedes dejarlo cuando quieras cerrando la página. Las respuestas que alcances a dar quedarán guardadas.</dd></div>
        <div><dt>Requisito</dt><dd>Solo pueden participar personas mayores de 18 años.</dd></div>
      </dl>
      <p>Es parte de un proyecto de curso universitario. Al terminar te contaremos con más detalle el objetivo del estudio.</p>
      <p class="nota">Te recomendamos un lugar tranquilo y, si usas el celular, sostenerlo en vertical.</p>
      <label class="casilla">
        <input type="checkbox" id="acepto">
        <span>Soy mayor de 18 años y acepto participar</span>
      </label>
      <button class="primario" id="seguir" disabled>Comenzar</button>
    </main>`);
  const casilla = $('#acepto');
  const boton = $('#seguir');
  casilla.addEventListener('change', () => { boton.disabled = !casilla.checked; });
  boton.addEventListener('click', () => {
    E.t_inicio = Date.now();
    E.dispositivo = describirDispositivo();
    ir('datos');
  });
}

function pantallaDatos() {
  const generos = [['mujer', 'Mujer'], ['hombre', 'Hombre'], ['no_binario', 'No binario'],
    ['otro', 'Otro'], ['prefiero_no_decir', 'Prefiero no decir']];
  pintar(`
    <main class="hoja">
      <p class="sobrelinea">Antes de empezar</p>
      <h1>Dos datos sobre ti</h1>
      <label class="campo">
        <span>Edad</span>
        <input type="number" id="edad" inputmode="numeric" min="18" max="99" step="1" autocomplete="off" placeholder="Años">
      </label>
      <p class="error" id="error-edad" hidden></p>
      <fieldset class="campo">
        <legend>Género <span class="opcional">(opcional)</span></legend>
        <div class="opciones" id="genero">
          ${generos.map(([v, t]) => `<button type="button" class="opcion" data-v="${v}" aria-pressed="false">${t}</button>`).join('')}
        </div>
      </fieldset>
      <button class="primario" id="seguir" disabled>Continuar</button>
    </main>`);
  const edad = $('#edad');
  const boton = $('#seguir');
  const error = $('#error-edad');
  let genero = '';
  opcionUnica($('#genero'), (v) => { genero = v; });
  edad.addEventListener('input', () => {
    boton.disabled = edad.value.trim() === '';
    error.hidden = true;
  });
  boton.addEventListener('click', async () => {
    const n = Number(edad.value);
    if (!Number.isInteger(n) || n < 1 || n > 120) {
      error.textContent = 'Escribe tu edad en años, solo con números.';
      error.hidden = false;
      return;
    }
    if (n < 18) {
      // No se guarda ni se envía nada de menores de edad.
      E = { ...estadoNuevo(), etapa: 'excluido' };
      guardar();
      mostrar();
      return;
    }
    E.edad = n;
    E.genero = genero;
    boton.disabled = true;
    boton.textContent = 'Preparando las obras…';
    await prepararSesion();
    ir('instrucciones');
    enviador.enviar();
  });
}

async function prepararSesion() {
  let lista = listaValida(params.get('lista'));
  let origen = 'url';
  if (lista === null) {
    lista = await pedirLista(URL_API, E.participante_id, PRUEBA);
    origen = 'servidor';
  }
  if (lista === null) {
    lista = Math.floor(azar() * N_LISTAS);
    origen = 'aleatoria';
  }
  E.lista = lista;
  E.lista_origen = origen;
  E.plan = construirEnsayos(manifiesto.pares, lista);
  E.plan_practica = construirPractica(manifiesto.practica);
  E.indice = 0;
  E.registrada = true;
}

function pantallaInstrucciones() {
  const n = E.plan.length;
  pintar(`
    <main class="hoja">
      <p class="sobrelinea">Instrucciones</p>
      <h1>Cómo funciona</h1>
      <ol class="pasos">
        <li>Verás ${n} pinturas, una a la vez. Bajo cada una hay una ficha, como en un museo.</li>
        <li><strong>Lo importante es que observes cada obra con detenimiento antes de responder.</strong> Tómate el tiempo que necesites. Las respuestas se activan después de unos segundos.</li>
        <li>Acércate a los detalles y recorre la imagen: usa la rueda del mouse o los botones <strong>+</strong> y <strong>−</strong>, o pellizca con dos dedos en el celular. Luego arrastra para moverte.</li>
        <li>Responde tres preguntas de 1 (<em>Nada</em>) a 7 (<em>Muchísimo</em>).</li>
        <li>No hay respuestas correctas ni incorrectas: nos interesa tu impresión.</li>
        <li>No podrás volver atrás, así que responde con tranquilidad antes de seguir.</li>
      </ol>
      <p>Primero harás ${E.plan_practica.length} obras de práctica.</p>
      <button class="primario" id="seguir">Comenzar la práctica</button>
    </main>`);
  precargar(E.plan_practica);
  $('#seguir').addEventListener('click', () => { E.indice = 0; ir('practica'); });
}

function pantallaTransicion() {
  pintar(`
    <main class="hoja centrada">
      <p class="sobrelinea">Práctica terminada</p>
      <h1>Ahora comienzan las ${E.plan.length} obras</h1>
      <p>Funciona igual que la práctica. Tómate tu tiempo con cada una.</p>
      <button class="primario" id="seguir">Comenzar</button>
    </main>`);
  precargar(E.plan.slice(0, 2));
  $('#seguir').addEventListener('click', () => { E.indice = 0; ir('ensayos'); });
}

// ---------------------------------------------------------------- ensayo

function pantallaEnsayo(bloque) {
  const plan = bloque === 'practica' ? E.plan_practica : E.plan;
  const e = plan[E.indice];
  const total = plan.length;
  const progreso = bloque === 'practica'
    ? `Práctica · obra ${E.indice + 1} de ${total}`
    : `Obra ${E.indice + 1} de ${total}`;
  const avance = bloque === 'practica' ? 0 : (E.indice / total) * 100;

  pintar(`
    <section class="ensayo">
      <header class="barra">
        <span class="progreso">${progreso}</span>
        <span class="pista" aria-hidden="true"><span style="width:${avance}%"></span></span>
      </header>
      <figure class="obra">
        <div class="lienzo"><div class="marco cargando">
          <div class="visor" tabindex="0" aria-label="Obra. Usa + y − para acercarte y las flechas para moverte.">
            <img alt="Obra" draggable="false">
          </div>
          <div class="zoom-botones">
            <button type="button" class="zoom-completa" id="zoom-completa" hidden>Ver completa</button>
            <button type="button" id="zoom-alejar" aria-label="Alejar">−</button>
            <button type="button" id="zoom-acercar" aria-label="Acercar">+</button>
          </div>
        </div></div>
        <figcaption class="ficha"><span>${TEXTO_ETIQUETA[e.etiqueta]}</span></figcaption>
        <div class="espera" aria-hidden="true"><span></span></div>
        <p class="consejo">Obsérvala con calma: acércate y recórrela antes de responder.</p>
        <p class="error" hidden id="error-img">No se pudo cargar la imagen.
          <button type="button" class="enlace" id="reintentar">Reintentar</button></p>
      </figure>
      <div class="panel">
        <form class="preguntas" onsubmit="return false">
          ${PREGUNTAS.map((p) => escalaHTML(p.clave, p.texto)).join('')}
        </form>
        <button class="primario" id="siguiente" disabled>Siguiente</button>
      </div>
    </section>`, 'modo-ensayo');

  const marco = $('.marco');
  const img = $('img', marco);
  const lienzo = $('.lienzo');
  const espera = $('.espera');
  const preguntas = $$('.pregunta');
  const siguiente = $('#siguiente');
  for (const f of preguntas) f.disabled = true;

  const resp = {};
  const ms = {};
  let t0 = null;
  let msCarga = null;
  const tPedido = performance.now();

  const visor = activarVisor($('.visor', marco), img, {
    acercar: $('#zoom-acercar'),
    alejar: $('#zoom-alejar'),
    completa: $('#zoom-completa'),
  });
  const ajustar = () => {
    ajustarImagen(lienzo, marco, img, e.ancho, e.alto);
    visor.reencuadrar();
  };
  const observador = new ResizeObserver(ajustar);
  observador.observe(lienzo);
  ajustar();

  img.addEventListener('load', async () => {
    try { await img.decode(); } catch { /* ya está cargada */ }
    if (t0 !== null) return;
    t0 = performance.now();
    msCarga = Math.round(t0 - tPedido);
    marco.classList.remove('cargando');
    espera.firstElementChild.style.transitionDuration = `${ESPERA_MS}ms`;
    requestAnimationFrame(() => espera.classList.add('corriendo'));
    setTimeout(() => {
      for (const f of preguntas) f.disabled = false;
      espera.classList.add('lista');
    }, ESPERA_MS);
    precargar(plan.slice(E.indice + 1, E.indice + 3));
    if (bloque === 'practica' && E.indice === total - 1) precargar(E.plan.slice(0, 2));
  });
  img.addEventListener('error', () => { $('#error-img').hidden = false; });
  $('#reintentar').addEventListener('click', () => {
    $('#error-img').hidden = true;
    img.src = `${e.src}?r=${Date.now()}`;
  });
  img.src = e.src;

  for (const f of preguntas) {
    opcionUnica(f, (v) => {
      const clave = f.dataset.clave;
      resp[clave] = Number(v);
      // Tiempo hasta la primera respuesta, desde que la imagen terminó de cargar.
      if (ms[clave] === undefined) ms[clave] = Math.round(performance.now() - t0);
      siguiente.disabled = PREGUNTAS.some((p) => resp[p.clave] === undefined);
    });
  }

  siguiente.addEventListener('click', () => {
    siguiente.disabled = true;
    observador.disconnect();
    registrarEnsayo(bloque, e, resp, ms, Math.round(performance.now() - t0), msCarga, visor.zoomMaximo());
    avanzar(bloque);
  }, { once: true });

  pintarPanelPrueba(e, bloque);
}

// Calcula el tamaño exacto de la imagen para que se vea completa y el marco la abrace.
function ajustarImagen(lienzo, marco, img, ancho, alto) {
  const cs = getComputedStyle(marco);
  const extraX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight)
    + parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth);
  const extraY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom)
    + parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
  const w = lienzo.clientWidth - extraX;
  const h = lienzo.clientHeight - extraY;
  if (w <= 0 || h <= 0) return;
  const s = Math.min(w / ancho, h / alto, 1);
  img.style.width = `${Math.floor(ancho * s)}px`;
  img.style.height = `${Math.floor(alto * s)}px`;
}

function registrarEnsayo(bloque, e, resp, ms, msEnsayo, msCarga, zoomMax = '') {
  const practica = bloque === 'practica';
  const uid = `${E.participante_id}-${practica ? 'p' : 'e'}${e.orden}`;
  if (E.filas.some((f) => f.uid === uid)) return;
  E.filas.push({
    uid,
    participante_id: E.participante_id,
    lista: E.lista,
    es_practica: practica,
    orden: e.orden,
    par_id: e.par_id,
    fuente: e.fuente,
    etiqueta: e.etiqueta,
    etiqueta_verdadera: e.etiqueta_verdadera,
    celda: e.celda,
    valor: resp.valor,
    agrado: resp.agrado,
    profundidad: resp.profundidad,
    ms_valor: ms.valor ?? '',
    ms_agrado: ms.agrado ?? '',
    ms_profundidad: ms.profundidad ?? '',
    ms_ensayo: msEnsayo,
    ms_carga_imagen: msCarga ?? '',
    zoom_max: zoomMax,
    timestamp: new Date().toISOString(),
    modo_prueba: E.modo_prueba,
    version_app: VERSION_APP,
  });
}

function avanzar(bloque) {
  const plan = bloque === 'practica' ? E.plan_practica : E.plan;
  E.indice += 1;
  if (E.indice >= plan.length) {
    E.indice = 0;
    E.etapa = bloque === 'practica' ? 'transicion' : 'chequeo-proposito';
  }
  guardar();
  enviador.enviar();
  // Pausa breve entre obras para que una no se «pegue» visualmente a la siguiente.
  app.classList.add('saliendo');
  setTimeout(mostrar, 180);
}

// ---------------------------------------------------------------- chequeos

function hojaChequeo(numero, cuerpo) {
  return `
    <main class="hoja">
      <p class="sobrelinea">Últimas preguntas · ${numero} de 4</p>
      ${cuerpo}
      <button class="primario" id="seguir" disabled>Siguiente</button>
    </main>`;
}

function pantallaChequeoProposito() {
  pintar(hojaChequeo(1, `
    <p class="previo">Terminaste las obras. Antes de cerrar, cuatro preguntas breves.</p>
    <h1>¿Qué crees que buscaba este estudio?</h1>
    <p class="nota">Escribe lo que pienses, aunque sea una suposición.</p>
    <textarea id="texto" rows="5" maxlength="1500"></textarea>`));
  const texto = $('#texto');
  const boton = $('#seguir');
  texto.addEventListener('input', () => { boton.disabled = texto.value.trim().length < 2; });
  boton.addEventListener('click', () => {
    E.chequeos.proposito = texto.value.trim();
    ir('chequeo-credibilidad');
    enviador.enviar();
  });
}

function pantallaChequeoCredibilidad() {
  pintar(hojaChequeo(2, `
    <h1>¿Qué tan creíbles te parecieron las fichas de las obras?</h1>
    ${escalaHTML('credibilidad', 'Elige un número del 1 al 7')}`));
  const boton = $('#seguir');
  let valor = null;
  opcionUnica($('.pregunta'), (v) => { valor = Number(v); boton.disabled = false; });
  boton.addEventListener('click', () => {
    E.chequeos.credibilidad = valor;
    ir('chequeo-reconocimiento');
    enviador.enviar();
  });
}

function chequeoConDetalle({ numero, titulo, opciones, conDetalle, etiquetaDetalle, clave, siguiente }) {
  pintar(hojaChequeo(numero, `
    <h1>${titulo}</h1>
    <div class="opciones grandes" id="opciones">
      ${opciones.map(([v, t]) => `<button type="button" class="opcion" data-v="${v}" aria-pressed="false">${t}</button>`).join('')}
    </div>
    <label class="campo" id="detalle" hidden>
      <span>${etiquetaDetalle} <span class="opcional">(opcional)</span></span>
      <textarea id="texto" rows="3" maxlength="1500"></textarea>
    </label>`));
  const boton = $('#seguir');
  let valor = null;
  opcionUnica($('#opciones'), (v) => {
    valor = v;
    $('#detalle').hidden = !conDetalle.includes(v);
    boton.disabled = false;
  });
  boton.addEventListener('click', () => {
    E.chequeos[clave] = valor;
    E.chequeos[`${clave === 'reconocio' ? 'reconocio' : 'ficha'}_cual`] = conDetalle.includes(valor) ? $('#texto').value.trim() : '';
    siguiente();
  });
}

function pantallaChequeoReconocimiento() {
  chequeoConDetalle({
    numero: 3,
    titulo: '¿Reconociste alguna de las obras?',
    opciones: [['si', 'Sí'], ['no', 'No']],
    conDetalle: ['si'],
    etiquetaDetalle: '¿Cuál o cuáles? Descríbelas con tus palabras',
    clave: 'reconocio',
    siguiente: () => { ir('chequeo-ficha'); enviador.enviar(); },
  });
}

function pantallaChequeoFicha() {
  chequeoConDetalle({
    numero: 4,
    titulo: '¿Te pareció que alguna ficha era incorrecta?',
    opciones: [['si', 'Sí'], ['no', 'No'], ['no_se', 'No sé']],
    conDetalle: ['si', 'no_se'],
    etiquetaDetalle: '¿Cuál y por qué te lo pareció?',
    clave: 'ficha_incorrecta',
    siguiente: () => {
      E.completa = true;
      E.t_fin = Date.now();
      ir('final');
      enviador.enviar();
    },
  });
}

// ---------------------------------------------------------------- final

function pantallaFinal(regreso = false) {
  const vistas = E.filas.filter((f) => !f.es_practica).sort((a, b) => a.orden - b.orden);
  const galeria = vistas.map((f) => {
    const plan = E.plan.find((p) => p.par_id === f.par_id);
    const origen = f.fuente === 'original' ? 'Original del Prado' : 'Generada con IA';
    const ficha = f.etiqueta_verdadera
      ? '<span class="sello verdadera">Ficha verdadera</span>'
      : `<span class="sello falsa">Ficha falsa</span><span class="decia">decía «${TEXTO_ETIQUETA[f.etiqueta]}»</span>`;
    return `
      <li>
        <div class="miniatura"><img src="${esc(plan.src)}" alt="" draggable="false" loading="lazy"></div>
        <p class="origen">${origen}</p>
        ${ficha}
      </li>`;
  }).join('');
  const falsas = vistas.filter((f) => !f.etiqueta_verdadera).length;

  pintar(`
    <main class="hoja ancha">
      <p class="sobrelinea">${regreso ? 'Ya participaste en este estudio' : 'Estudio terminado'}</p>
      <h1>¡Gracias por participar!</h1>

      <h2>Lo que no te contamos al inicio</h2>
      <p>Este estudio busca saber si la etiqueta <strong>«Generada con IA»</strong> cambia cuánto valoramos una obra,
      aunque la obra sea exactamente la misma.</p>
      <p>De las obras que viste, la mitad eran pinturas originales del Museo del Prado y la otra mitad eran obras nuevas
      generadas con inteligencia artificial en su mismo estilo. Además, <strong>algunas fichas eran falsas a propósito</strong>:
      ${falsas ? `en tu caso, ${falsas} de ${vistas.length}.` : ''} Hubo originales con la ficha «Generada con IA» y obras
      generadas con la ficha «Obra original».</p>
      <p>Lo hicimos así porque es la única forma de separar el efecto de la etiqueta del efecto de la obra misma.
      Si te lo hubiéramos dicho antes, tus respuestas habrían cambiado. No hay respuestas correctas ni incorrectas:
      lo que respondiste es justo lo que necesitábamos.</p>

      <aside class="favor">
        <h2>Un favor importante</h2>
        <p><strong>Por favor, no le cuentes de qué se trata el estudio a nadie que aún no haya participado.</strong>
        Si alguien llega sabiendo que hay fichas falsas, sus respuestas ya no sirven y se arruina el experimento.
        Puedes invitar a tus amigos, pero sin darles detalles.</p>
      </aside>

      <h2>Las obras que viste</h2>
      <p class="nota">En el orden en que aparecieron, con su origen real.</p>
      <ul class="galeria">${galeria}</ul>

      <p class="envio" id="estado-envio" aria-live="polite"></p>
      <p class="respaldo" id="respaldo" hidden>
        <button type="button" class="enlace" id="csv">Descargar mis respuestas (CSV)</button>
        <span class="nota">y envíalas al equipo si te lo piden.</span>
      </p>
      ${CFG.CONTACTO ? `<p class="nota">¿Preguntas? Escríbenos a ${esc(CFG.CONTACTO)}.</p>` : ''}
    </main>`);
  $('#csv').addEventListener('click', exportarCsv);
  pintarEstadoEnvio(enviador.estado());
}

function pantallaExcluido() {
  pintar(`
    <main class="hoja centrada">
      <h1>Gracias por tu interés</h1>
      <p>Este estudio es solo para personas mayores de 18 años, así que no podemos continuar.
      No guardamos ninguna de tus respuestas.</p>
    </main>`);
}

function pantallaExportar() {
  pintar(`
    <main class="hoja">
      <p class="sobrelinea">Investigador</p>
      <h1>Datos guardados en este navegador</h1>
      <p>${E ? `Sesión ${esc(E.participante_id)} · ${E.filas.length} ensayos · etapa «${esc(E.etapa)}»
        · ${E.completa ? 'completa' : 'incompleta'}${E.modo_prueba ? ' · modo prueba' : ''}` : 'No hay ninguna sesión en este navegador.'}</p>
      ${E ? '<button class="primario" id="csv">Descargar CSV</button>' : ''}
      <p class="nota">Para ver la sesión de modo prueba agrega <code>&amp;debug=1</code> a la dirección.</p>
    </main>`);
  if (E) $('#csv').addEventListener('click', exportarCsv);
}

function exportarCsv() {
  const id = E.participante_id;
  descargar(`ensayos_${id}.csv`, aCsv(E.filas));
  setTimeout(() => descargar(`sesion_${id}.csv`, aCsv([filaSesion()])), 400);
}

function pintarEstadoEnvio(estado) {
  const p = document.getElementById('estado-envio');
  if (!p) return;
  const textos = {
    pendiente: 'Guardando tus respuestas…',
    enviando: 'Guardando tus respuestas…',
    'al-dia': 'Tus respuestas quedaron guardadas. Ya puedes cerrar esta página.',
    error: 'Aún no pudimos guardar tus respuestas (¿sin conexión?). Seguiremos intentando: deja esta página abierta un momento.',
    'sin-servidor': 'Sin servidor configurado: las respuestas quedaron solo en este dispositivo.',
  };
  p.textContent = textos[estado] || '';
  p.dataset.estado = estado;
  const respaldo = document.getElementById('respaldo');
  if (respaldo) respaldo.hidden = !(estado === 'error' || estado === 'sin-servidor' || PRUEBA);
}

// ================================================================ modo prueba

function pintarPanelPrueba(e = null, bloque = null) {
  if (!PRUEBA) return;
  let panel = document.getElementById('panel-prueba');
  if (!panel) {
    panel = document.createElement('aside');
    panel.id = 'panel-prueba';
    document.body.appendChild(panel);
    panel.addEventListener('click', accionPrueba);
  }
  const lista = E.lista === null ? '—' : `${E.lista} (${E.lista_origen})`;
  const ensayo = e ? `
    <div>par <b>${e.par_id}</b> · celda ${e.celda === '' ? '—' : e.celda} · fuente <b>${e.fuente}</b>
    · ficha <b>${e.etiqueta}</b> · <b class="${e.etiqueta_verdadera === false ? 'falsa' : ''}">${
  e.etiqueta_verdadera === '' ? 'práctica' : e.etiqueta_verdadera ? 'VERDADERA' : 'FALSA'}</b></div>` : '';
  panel.innerHTML = `
    <div><b>MODO PRUEBA</b> · lista ${lista} · ${esc(E.participante_id)} · envío: <span id="prueba-envio">${enviador ? enviador.estado() : ''}</span></div>
    ${ensayo}
    <div class="acciones-prueba">
      ${bloque ? '<button data-a="saltar">Saltar</button><button data-a="bloque">Completar bloque</button>' : ''}
      <button data-a="csv">CSV</button>
      <button data-a="reiniciar">Reiniciar</button>
    </div>`;
  panel.dataset.bloque = bloque || '';
  // El ResizeObserver del lienzo reajusta la imagen cuando cambia este alto.
  document.body.style.setProperty('--alto-panel', `${panel.offsetHeight}px`);
}

function accionPrueba(ev) {
  const a = ev.target.dataset.a;
  if (!a) return;
  const bloque = document.getElementById('panel-prueba').dataset.bloque;
  if (a === 'reiniciar') {
    borrarLocal(CLAVE);
    location.reload();
  } else if (a === 'csv') {
    exportarCsv();
  } else if (a === 'saltar' || a === 'bloque') {
    const plan = bloque === 'practica' ? E.plan_practica : E.plan;
    const hasta = a === 'saltar' ? E.indice + 1 : plan.length;
    const r = () => 1 + Math.floor(azar() * 7);
    for (let k = E.indice; k < hasta; k++) {
      registrarEnsayo(bloque, plan[k], { valor: r(), agrado: r(), profundidad: r() }, {}, 0, '');
    }
    E.indice = hasta - 1;
    avanzar(bloque);
  }
}

// ================================================================ arranque

function mostrar() {
  app.classList.remove('saliendo');
  const pantallas = {
    consentimiento: pantallaConsentimiento,
    datos: pantallaDatos,
    instrucciones: pantallaInstrucciones,
    practica: () => pantallaEnsayo('practica'),
    transicion: pantallaTransicion,
    ensayos: () => pantallaEnsayo('ensayos'),
    'chequeo-proposito': pantallaChequeoProposito,
    'chequeo-credibilidad': pantallaChequeoCredibilidad,
    'chequeo-reconocimiento': pantallaChequeoReconocimiento,
    'chequeo-ficha': pantallaChequeoFicha,
    final: () => pantallaFinal(false),
    excluido: pantallaExcluido,
  };
  (pantallas[E.etapa] || pantallaConsentimiento)();
  if (!['practica', 'ensayos'].includes(E.etapa)) pintarPanelPrueba();
}

// Sin botón «atrás»: el historial siempre vuelve a la pantalla actual.
function bloquearAtras() {
  history.pushState({ eiva: 1 }, '');
  addEventListener('popstate', () => history.pushState({ eiva: 1 }, ''));
  addEventListener('beforeunload', (ev) => {
    if (!PRUEBA && E && ETAPAS_EN_CURSO.includes(E.etapa)) {
      ev.preventDefault();
      ev.returnValue = '';
    }
  });
}

function protegerImagenes() {
  const esObra = (t) => t instanceof Element && (t.tagName === 'IMG' || t.closest('.marco, .miniatura'));
  document.addEventListener('contextmenu', (ev) => { if (esObra(ev.target)) ev.preventDefault(); });
  document.addEventListener('dragstart', (ev) => { if (esObra(ev.target)) ev.preventDefault(); });
}

function aviso(texto) {
  const t = document.createElement('div');
  t.className = 'aviso';
  t.textContent = texto;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

async function iniciar() {
  if (PRUEBA) document.body.classList.add('prueba');
  if (PRUEBA && params.get('reiniciar') === '1') {
    borrarLocal(CLAVE);
    params.delete('reiniciar');
    history.replaceState(null, '', `${location.pathname}?${params}`);
  }
  E = leerLocal(CLAVE);

  try {
    const r = await fetch('manifest.json', { cache: 'no-cache' });
    manifiesto = await r.json();
  } catch {
    app.innerHTML = '<main class="hoja"><h1>No se pudo cargar el estudio</h1><p>Revisa tu conexión y recarga la página.</p></main>';
    return;
  }

  enviador = crearEnviador({
    url: URL_API,
    obtenerCarga,
    confirmar,
    alCambiar: (estado) => {
      pintarEstadoEnvio(estado);
      const s = document.getElementById('prueba-envio');
      if (s) s.textContent = estado;
    },
  });

  if (params.get('exportar') === '1') {
    pantallaExportar();
    return;
  }

  bloquearAtras();
  protegerImagenes();

  if (!E) {
    E = estadoNuevo();
    guardar();
    mostrar();
    return;
  }
  if (E.etapa === 'final') {
    pantallaFinal(true);
    pintarPanelPrueba();
  } else {
    if (ETAPAS_EN_CURSO.includes(E.etapa)) aviso('Continuamos donde quedaste.');
    mostrar();
  }
  enviador.enviar();
}

iniciar();
