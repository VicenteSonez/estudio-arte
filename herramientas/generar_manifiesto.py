#!/usr/bin/env python3
"""Genera manifest.json e img/ a partir de la carpeta estimulos/.

Estructura esperada:
    estimulos/original/01.jpg ... 24.jpg   originales del Prado
    estimulos/ia/01.jpg ... 24.jpg         obras generadas (mismo número = mismo par)
    estimulos/practica/p1.jpg, p2.jpg      obras de práctica

Qué hace:
    1. Valida que cada par tenga sus dos imágenes y que el número de pares sea
       múltiplo de 4 (lo exige el cuadrado latino).
    2. Convierte cada imagen a JPEG con 1600 px de lado largo y sin metadatos
       (los generadores de IA suelen dejar marcas en EXIF/XMP).
    3. La guarda en img/ con un nombre opaco, para que la URL no delate el
       origen real (p. ej. «ia/07.jpg»).
    4. Escribe manifest.json, que es lo que lee la app.

Uso:
    python herramientas/generar_manifiesto.py               # procesa estimulos/
    python herramientas/generar_manifiesto.py --placeholders # crea imágenes de prueba que falten
    python herramientas/generar_manifiesto.py --solo-validar # no escribe nada

Requiere Pillow:  pip install pillow
"""
import argparse
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFont, ImageOps
except ImportError:
    sys.exit("Falta Pillow. Instálalo con:  pip install pillow")

RAIZ = Path(__file__).resolve().parent.parent
FUENTE = RAIZ / "estimulos"
SALIDA = RAIZ / "img"
MANIFIESTO = RAIZ / "manifest.json"
EXTENSIONES = (".jpg", ".jpeg", ".jfif", ".png", ".webp")
LADO_LARGO = 1600
CALIDAD_JPEG = 86
# Cambiar la sal cambia todos los nombres de img/ (útil si se filtraron).
SAL = "eiva-2026"
PARES_ESPERADOS = 24


def imagenes_en(carpeta):
    """Devuelve {nombre_sin_extension: ruta} de las imágenes de una carpeta."""
    if not carpeta.is_dir():
        return {}
    encontradas = {}
    for ruta in sorted(carpeta.iterdir()):
        if ruta.suffix.lower() in EXTENSIONES:
            if ruta.stem in encontradas:
                raise SystemExit(f"Hay dos imágenes con el nombre «{ruta.stem}» en {carpeta}")
            encontradas[ruta.stem] = ruta
    return encontradas


def nombre_opaco(clave):
    return hashlib.sha1(f"{SAL}/{clave}".encode()).hexdigest()[:12] + ".jpg"


def procesar(origen, clave, redimensionar):
    """Convierte una imagen y la deja en img/. Devuelve su entrada del manifiesto."""
    with Image.open(origen) as im:
        im = ImageOps.exif_transpose(im).convert("RGB")
        if redimensionar:
            escala = LADO_LARGO / max(im.size)
            nuevo = (round(im.width * escala), round(im.height * escala))
            im = im.resize(nuevo, Image.LANCZOS)
        nombre = nombre_opaco(clave)
        # Se guarda sin exif ni icc: solo los píxeles.
        im.save(SALIDA / nombre, "JPEG", quality=CALIDAD_JPEG, optimize=True, progressive=True)
        return {"src": f"img/{nombre}", "ancho": im.width, "alto": im.height}


# ---------------------------------------------------------------- placeholders

def fuente_tipografica(tamano):
    for nombre in ("georgia.ttf", "DejaVuSerif.ttf", "times.ttf", "arial.ttf"):
        try:
            return ImageFont.truetype(nombre, tamano)
        except OSError:
            continue
    return ImageFont.load_default(size=tamano)


def placeholder(ruta, color, titulo, subtitulo, tamano):
    im = Image.new("RGB", tamano, color)
    d = ImageDraw.Draw(im)
    w, h = tamano
    # Algunas franjas para que se note el redimensionado y el encuadre.
    for k in range(0, w + h, 90):
        d.line([(k, 0), (k - h, h)], fill=tuple(min(255, c + 18) for c in color), width=14)
    d.rectangle([24, 24, w - 25, h - 25], outline=(250, 244, 230), width=4)
    grande, chica = fuente_tipografica(int(min(w, h) * 0.28)), fuente_tipografica(int(min(w, h) * 0.07))
    d.text((w / 2, h / 2), titulo, font=grande, fill=(250, 244, 230), anchor="mm")
    d.text((w / 2, h / 2 + min(w, h) * 0.22), subtitulo, font=chica, fill=(250, 244, 230), anchor="mm")
    ruta.parent.mkdir(parents=True, exist_ok=True)
    im.save(ruta, "JPEG", quality=80)


def crear_placeholders():
    """Crea las imágenes de prueba que falten (nunca sobrescribe)."""
    formatos = [(900, 1200), (1200, 900), (1000, 1000), (800, 1280), (1400, 900), (960, 1200)]
    creadas = 0
    for n in range(1, PARES_ESPERADOS + 1):
        num = f"{n:02d}"
        tam = formatos[n % len(formatos)]
        tono = (n * 37) % 360
        for fuente, color, texto in (
            ("original", hsv(tono, 0.45, 0.42), "ORIGINAL"),
            ("ia", hsv(tono, 0.35, 0.55), "IA"),
        ):
            ruta = FUENTE / fuente / f"{num}.jpg"
            if not ruta.exists():
                placeholder(ruta, color, num, f"{texto} · par {num}", tam)
                creadas += 1
    for k, color in ((1, (92, 74, 60)), (2, (70, 84, 96))):
        ruta = FUENTE / "practica" / f"p{k}.jpg"
        if not ruta.exists():
            placeholder(ruta, color, f"P{k}", "práctica", (1000, 1200))
            creadas += 1
    print(f"Placeholders creados: {creadas}")


def hsv(h, s, v):
    import colorsys
    r, g, b = colorsys.hsv_to_rgb(h / 360, s, v)
    return (int(r * 255), int(g * 255), int(b * 255))


# ---------------------------------------------------------------- principal

def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--placeholders", action="store_true", help="crea imágenes de prueba que falten")
    p.add_argument("--solo-validar", action="store_true", help="valida sin escribir nada")
    p.add_argument("--sin-redimensionar", action="store_true", help="conserva el tamaño original")
    args = p.parse_args()

    if args.placeholders:
        crear_placeholders()

    originales = imagenes_en(FUENTE / "original")
    ias = imagenes_en(FUENTE / "ia")
    practica = imagenes_en(FUENTE / "practica")

    errores = []
    for falta in sorted(set(originales) - set(ias)):
        errores.append(f"El par {falta} tiene original pero no versión IA (falta estimulos/ia/{falta}.*)")
    for falta in sorted(set(ias) - set(originales)):
        errores.append(f"El par {falta} tiene versión IA pero no original (falta estimulos/original/{falta}.*)")
    pares = sorted(set(originales) & set(ias))
    if not pares:
        errores.append("No hay pares. ¿Pusiste las imágenes en estimulos/original y estimulos/ia?")
    elif len(pares) % 4:
        errores.append(f"Hay {len(pares)} pares; el cuadrado latino necesita un múltiplo de 4.")
    if not practica:
        errores.append("No hay obras de práctica en estimulos/practica/.")
    if errores:
        print("\n".join("ERROR: " + e for e in errores))
        sys.exit(1)
    if len(pares) != PARES_ESPERADOS:
        print(f"AVISO: hay {len(pares)} pares (el diseño contempla {PARES_ESPERADOS}).")
    if len(practica) != 2:
        print(f"AVISO: hay {len(practica)} obras de práctica (el diseño contempla 2).")

    print(f"OK: {len(pares)} pares completos y {len(practica)} obras de práctica.")
    if args.solo_validar:
        return

    SALIDA.mkdir(exist_ok=True)
    for viejo in SALIDA.glob("*.jpg"):
        viejo.unlink()
    redim = not args.sin_redimensionar
    manifiesto = {
        "generado": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "lado_largo": LADO_LARGO if redim else None,
        "n_pares": len(pares),
        "pares": [
            {
                "id": par,
                "original": procesar(originales[par], f"original/{par}", redim),
                "ia": procesar(ias[par], f"ia/{par}", redim),
            }
            for par in pares
        ],
        "practica": [
            {"id": nombre, **procesar(ruta, f"practica/{nombre}", redim)}
            for nombre, ruta in practica.items()
        ],
    }
    MANIFIESTO.write_text(json.dumps(manifiesto, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Escrito {MANIFIESTO.name} e {len(pares) * 2 + len(practica)} imágenes en img/.")


if __name__ == "__main__":
    main()
