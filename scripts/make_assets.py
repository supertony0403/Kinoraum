#!/usr/bin/env python3
"""Erzeugt Icons und Splash fuer die webOS-App (LG verlangt PNG in festen Groessen)."""
import math
from PIL import Image, ImageDraw, ImageFilter, ImageFont

BG      = (7, 8, 12)
SURFACE = (18, 20, 28)
HOT     = (255, 61, 90)
WARM    = (255, 157, 61)
TEXT    = (242, 244, 248)


def lerp(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


def diagonal_gradient(size, c0, c1):
    w, h = size
    img = Image.new("RGB", size)
    px = img.load()
    denom = float((w - 1) + (h - 1)) or 1.0
    for y in range(h):
        for x in range(w):
            px[x, y] = lerp(c0, c1, (x + y) / denom)
    return img


def rounded_mask(size, radius):
    m = Image.new("L", size, 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, size[0] - 1, size[1] - 1], radius=radius, fill=255)
    return m


def pick_font(px):
    for path in (
        "/usr/share/fonts/TTF/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/liberation/LiberationSans-Bold.ttf",
        "/usr/share/fonts/TTF/LiberationSans-Bold.ttf",
    ):
        try:
            return ImageFont.truetype(path, px)
        except OSError:
            continue
    return ImageFont.load_default()


def mark(size):
    """Quadratisches App-Zeichen: Verlaufsflaeche, Blendenschlitz, Monogramm."""
    ss = size * 4                     # supersampling gegen Treppchen
    tile = diagonal_gradient((ss, ss), HOT, WARM)
    card = Image.new("RGBA", (ss, ss), (0, 0, 0, 0))
    card.paste(tile, (0, 0), rounded_mask((ss, ss), int(ss * 0.22)))

    d = ImageDraw.Draw(card)
    f = pick_font(int(ss * 0.56))
    box = d.textbbox((0, 0), "K", font=f)
    d.text(
        ((ss - (box[2] - box[0])) / 2 - box[0], (ss - (box[3] - box[1])) / 2 - box[1]),
        "K", font=f, fill=TEXT + (255,),
    )
    # Projektionsschlitz: eine schmale dunkle Schraege ueber das untere Drittel,
    # bewusst asymmetrisch, damit das Zeichen eine Leserichtung bekommt
    band = Image.new("RGBA", (ss, ss), (0, 0, 0, 0))
    ImageDraw.Draw(band).polygon(
        [(0, ss * 0.80), (ss, ss * 0.60), (ss, ss * 0.74), (0, ss * 0.94)],
        fill=(7, 8, 12, 245),
    )
    card.alpha_composite(band)
    return card.resize((size, size), Image.LANCZOS)


def icon(path, size):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    img.alpha_composite(mark(size))
    img.save(path)
    print("%s  %dx%d" % (path, size, size))


def splash(path, w=1920, h=1080):
    img = Image.new("RGB", (w, h), BG)
    # warmer Lichtkegel aus der linken oberen Ecke, weich gezeichnet und dann geblurrt
    glow = Image.new("RGB", (w // 8, h // 8), BG)
    g = ImageDraw.Draw(glow)
    cx, cy = w // 8 * 0.30, h // 8 * 0.28
    for i in range(34, 0, -1):
        r = (h // 8) * 0.09 * i / 4.0
        g.ellipse([cx - r * 1.7, cy - r, cx + r * 1.7, cy + r], fill=lerp(BG, HOT, (i / 34.0) ** 2 * 0.55))
    img = Image.blend(img, glow.resize((w, h), Image.BICUBIC).filter(ImageFilter.GaussianBlur(24)), 0.85)

    m = mark(196)
    img.paste(m, (int(w * 0.5 - 98), int(h * 0.5 - 150)), m)

    d = ImageDraw.Draw(img)
    f = pick_font(64)
    box = d.textbbox((0, 0), "Kinoraum", font=f)
    d.text(((w - (box[2] - box[0])) / 2 - box[0], h * 0.5 + 88), "Kinoraum", font=f, fill=TEXT)

    fs = pick_font(26)
    sub = "Deine Mediathek"
    box = d.textbbox((0, 0), sub, font=fs)
    d.text(((w - (box[2] - box[0])) / 2 - box[0], h * 0.5 + 176), sub, font=fs, fill=(139, 147, 167))
    img.save(path)
    print("%s  %dx%d" % (path, w, h))


if __name__ == "__main__":
    icon("assets/icon.png", 80)
    icon("assets/largeIcon.png", 130)
    splash("assets/splash.png")
