# Etiqueta IA y valor del arte · app del experimento

Sitio estático (HTML, CSS y JavaScript, sin dependencias) para el experimento
intra-sujeto 2×2: **fuente real** (original del Prado / generada con IA) ×
**etiqueta mostrada** («Obra original» / «Generada con IA»). Los datos se guardan
en Google Sheets mediante un Apps Script.

```
index.html            página única
config.js             ← lo único que hay que editar para publicar
css/estilo.css
js/diseno.js          cuadrado latino y armado de ensayos (puro, testeado)
js/datos.js           localStorage, envío con reintentos, CSV
js/app.js             pantallas y flujo
manifest.json         lo genera el script; lo lee la app
img/                  imágenes procesadas, con nombres opacos (las genera el script)
estimulos/            imágenes fuente (no se publican, ver .gitignore)
apps-script/Codigo.gs backend para Google Sheets
herramientas/         generador del manifiesto, servidor local y simulador de Sheets
tests/                tests del contrabalanceo, del Apps Script y del CSV
```

Requisitos para trabajar en local: **Node 18+** y **Python 3.8+ con Pillow**
(`pip install pillow`). El sitio publicado no necesita nada de eso.

---

## 1. Agregar las imágenes

Pon las imágenes en esta estructura (jpg, jpeg, jfif, png o webp):

```
estimulos/original/01.jpg … 24.jpg   originales del Prado
estimulos/ia/01.jpg … 24.jpg         obras generadas (mismo número = mismo par)
estimulos/practica/p1.jpg, p2.jpg    obras de práctica (no se usan después)
```

Ahora mismo esas carpetas tienen *placeholders* (rectángulos numerados). Basta con
reemplazarlos por archivos con el mismo nombre.

## 2. Generar el manifiesto

```bash
python herramientas/generar_manifiesto.py
```

El script:

- valida que cada par tenga sus dos imágenes y que haya un múltiplo de 4 pares
  (avisa si no son exactamente 24);
- convierte todo a JPEG con **1024 px de lado largo**, así originales e IA quedan
  del mismo tamaño, y **sin metadatos** (los generadores de IA dejan marcas en EXIF/XMP);
- guarda las imágenes en `img/` con **nombres opacos** (p. ej. `img/99212ff4f013.jpg`),
  para que la dirección de una imagen no delate si es original o IA;
- escribe `manifest.json`.

Otras opciones: `--solo-validar` (no escribe nada), `--sin-redimensionar`,
`--placeholders` (crea los placeholders que falten, nunca sobrescribe).

Después de generar el manifiesto, corre los tests (paso 6).

## 3. Configurar Google Sheets

1. En Google Drive crea una hoja de cálculo nueva (p. ej. «Datos · Etiqueta IA»).
2. Menú **Extensiones › Apps Script**. Borra el contenido de `Código.gs` y pega
   el de `apps-script/Codigo.gs`. Guarda (💾).
3. **Implementar › Nueva implementación**. En el engranaje elige **Aplicación web**.
   - *Descripción:* v1
   - *Ejecutar como:* **Yo**
   - *Quién tiene acceso:* **Cualquier usuario**
4. Pulsa **Implementar** y autoriza el acceso con tu cuenta. Si aparece «Google no ha
   verificado esta aplicación», entra en *Configuración avanzada › Ir a … (no seguro)*:
   el script es tuyo y solo escribe en esta hoja.
5. Copia la **URL de la aplicación web** (termina en `/exec`) y pégala en `config.js`:

   ```js
   URL_APPS_SCRIPT: 'https://script.google.com/macros/s/AKfy…/exec',
   ```

6. Comprueba que funciona: abre esa URL en el navegador. Debe responder
   `{"ok":true,"mensaje":"Backend del estudio funcionando."}`. Con `?accion=estado`
   al final verás cuántas sesiones completas hay por lista.

Las hojas **Ensayos** y **Sesiones** se crean solas con el primer envío.

> Si después cambias el código del Apps Script: *Implementar › Gestionar implementaciones
> › ✏️ › Versión: Nueva versión*. Así la URL no cambia.

## 4. Publicar en GitHub Pages

1. Crea un repositorio en GitHub y sube esta carpeta (`index.html` debe quedar en la raíz).
   En el plan gratis el repositorio debe ser **público**; por eso `estimulos/` está en
   `.gitignore` y solo se publican `img/` y `manifest.json`.
2. En el repositorio: **Settings › Pages › Build and deployment › Source: Deploy from a
   branch**, rama `main`, carpeta `/ (root)`. Guarda.
3. En uno o dos minutos el sitio queda en `https://TU-USUARIO.github.io/NOMBRE-REPO/`.
   Ese es el enlace que se envía a los participantes.

## 5. Prueba completa antes de lanzar

**En local (sin Google):**

```bash
npm run servidor
```

Abre `http://localhost:8080/?debug=1&api=/api`. El servidor local sirve el sitio y ejecuta
el **mismo `Codigo.gs`** sobre una hoja simulada; los datos quedan en
`datos_locales/Ensayos.csv` y `datos_locales/Sesiones.csv`.

**Con Google Sheets (ya publicado):**

1. Abre `https://…github.io/…/?debug=1` en tu celular y en un computador.
2. Recorre el flujo completo. En modo prueba:
   - una franja negra arriba muestra lista, par, celda, fuente, ficha y si es **FALSA**;
   - **Saltar** responde al azar el ensayo actual y **Completar bloque** el resto del bloque;
   - **Reiniciar** borra la sesión de este navegador para empezar otra;
   - las filas quedan marcadas `modo_prueba = TRUE` y no cuentan para balancear listas.
3. Revisa que en la hoja aparezcan 26 filas en *Ensayos* (2 de práctica + 24) y una en
   *Sesiones* con `completa = TRUE`.
4. Antes de enviar el enlace: confirma que `MODO_PRUEBA: false` en `config.js` y
   **borra las filas de prueba** (o fíltralas por `modo_prueba`).

Parámetros de URL útiles:

| Parámetro | Efecto |
| --- | --- |
| `?debug=1` | modo prueba (sesión aparte de la normal en el mismo navegador) |
| `?lista=0` … `?lista=3` | fuerza la lista (queda `lista_origen = url`) |
| `?debug=1&reiniciar=1` | borra la sesión de prueba y empieza de cero |
| `?debug=1&api=…` | usa otro backend (solo en modo prueba) |
| `?exportar=1` | descarga en CSV los datos guardados en este navegador |

## 6. Tests

```bash
npm test
```

- **Contrabalanceo** (`tests/contrabalanceo.test.js`): para cada lista, 24 pares distintos,
  6 por celda, ninguna imagen repetida y nunca los dos miembros de un par; a lo largo de
  las 4 listas cada par pasa por las 4 condiciones y cada imagen aparece una vez con cada
  etiqueta; el orden se aleatoriza y ninguna celda queda sesgada hacia el inicio o el final;
  la práctica no repite obras de la tarea. También verifica que `manifest.json` apunte a
  archivos que existen.
- **Apps Script** (`tests/apps-script.test.js`): ejecuta `Codigo.gs` sobre el simulador:
  reenvíos sin duplicar, actualización de la sesión, asignación balanceada de listas.
- **CSV** (`tests/csv.test.js`).

---

## Cómo funciona

**Contrabalanceo.** La condición del par *i* (0–23, en el orden del manifiesto) en la lista
*L* es `(i + L) % 4`: 0 = original con etiqueta verdadera, 1 = original con etiqueta «IA»,
2 = IA con etiqueta «original», 3 = IA con etiqueta verdadera.

**Asignación de lista.** Prioridad: `?lista=` en la URL → servidor → al azar si el
servidor no responde en 8 s. El servidor elige la lista con menos sesiones *completas +
incompletas activas en los últimos 30 minutos* (empates al azar). Contar las activas evita
que, si muchas personas abren el enlace a la vez, todas caigan en la misma lista.

**Una sola participación.** Toda la sesión vive en `localStorage`. Si la persona recarga o
cierra y vuelve, sigue donde quedó (nunca vuelve a ver una obra ya respondida). Si ya
terminó, ve de nuevo la explicación final con el aviso «Ya participaste». Esto no impide
participar desde otro navegador o en modo incógnito; para eso conviene revisar en el análisis
sesiones con edad y dispositivo idénticos y horarios cercanos.

**Envío de datos.** Tras cada ensayo y cada chequeo se envía la fila de sesión y los
ensayos pendientes. Si falla, se reintenta con espera creciente (hasta 1 min) y al
recuperar la conexión; al cerrar la pestaña se intenta un último envío. El servidor
descarta ensayos repetidos (columna `uid`), así que reenviar nunca duplica filas. Si en la
pantalla final todavía hay datos sin enviar, aparece un enlace para descargarlos en CSV.

## Diccionario de datos

**Ensayos** (una fila por ensayo):

| Columna | Descripción |
| --- | --- |
| `uid` | `participante_id` + `p`/`e` + orden; único |
| `participante_id`, `lista` | identificador aleatorio y lista (0–3) |
| `es_practica` | TRUE en los 2 ensayos de práctica (excluir del análisis) |
| `orden` | posición en el bloque (1–24, o 1–2 en práctica) |
| `par_id` | `01`–`24`, o `p1`/`p2` en práctica |
| `fuente` | `original` / `ia` (`practica` en práctica) |
| `etiqueta` | etiqueta mostrada: `original` / `ia` |
| `etiqueta_verdadera` | TRUE si `fuente == etiqueta` (vacío en práctica) |
| `celda` | 0–3 según la tabla de arriba |
| `valor`, `agrado`, `profundidad` | respuestas 1–7 |
| `ms_valor`, `ms_agrado`, `ms_profundidad` | ms desde que la imagen terminó de cargar hasta la **primera** respuesta a esa pregunta (incluye la espera de 4 s) |
| `ms_ensayo` | ms desde que la imagen cargó hasta pulsar «Siguiente» |
| `ms_carga_imagen` | ms que tardó en cargar la imagen |
| `timestamp` | hora (ISO, UTC) al pulsar «Siguiente» |
| `modo_prueba`, `version_app` | control |

En los ensayos saltados en modo prueba los tiempos quedan vacíos o en 0.

**Sesiones** (una fila por persona; se actualiza en cada envío):

| Columna | Descripción |
| --- | --- |
| `participante_id`, `lista`, `lista_origen` | `lista_origen`: `servidor`, `url` o `aleatoria` |
| `edad`, `genero` | `genero` vacío si no respondió |
| `chequeo_proposito` | «¿Qué crees que buscaba este estudio?» |
| `chequeo_credibilidad` | credibilidad de las fichas, 1–7 |
| `chequeo_reconocio`, `chequeo_reconocio_cual` | `si`/`no` + texto opcional |
| `chequeo_ficha_incorrecta`, `chequeo_ficha_cual` | `si`/`no`/`no_se` + texto opcional |
| `duracion_total_ms` | desde aceptar el consentimiento hasta el último chequeo (o hasta el último envío si no terminó) |
| `completa` | TRUE al responder el último chequeo |
| `etapa`, `ensayos_completados` | dónde quedó (útil para medir abandono) |
| `dispositivo`, `sistema`, `pantalla`, `ventana`, `dpr` | `movil`/`tablet`/`escritorio`, SO, tamaños en px CSS |
| `version_app`, `modo_prueba`, `inicio`, `fin`, `ultima_actualizacion` | control |

Para el análisis: `modo_prueba = FALSE`, `es_practica = FALSE` y, para el análisis
principal, sesiones con `completa = TRUE`.
