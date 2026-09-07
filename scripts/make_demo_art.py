#!/usr/bin/env python3
"""Erzeugt Poster und Hintergrundbilder fuer die Demo-Bibliothek.

Zieht per ffmpeg einzelne Bilder aus den Filmen (nur die noetigen
Byte-Bereiche, nicht die ganze Datei) und legt sie unter assets/demo/ ab.
Die Bilder liegen damit im IPK und stehen auch ohne Netz zur Verfuegung.

Rechtlich: alle Titel stehen unter CC BY oder sind gemeinfrei. Die
Namensnennung zeigt die App an jedem Eintrag an.

Aufruf:  python3 scripts/make_demo_art.py
"""

import os
import subprocess
import sys
import tempfile

from PIL import Image, ImageDraw, ImageFilter, ImageStat

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets", "demo")
IA = "https://archive.org/download/"

# key, Archivkennung, Datei, Laufzeit in Minuten
TITLES = [
    ("sintel",    "Sintel",           "sintel-2048-surround_512kb.mp4",   15),
    ("bbb",       "BigBuckBunny_124", "Content/big_buck_bunny_720p_surround.mp4", 10),
    ("tos",       "Tears-of-Steel",   "tears_of_steel_720p.mp4",          12),
    ("ed",        "ElephantsDream",   "ed_hd_512kb.mp4",                  11),
    ("general",   "TheGeneral1926",   "The_General_1926_720p_512kb.mp4",  79),
    ("nosferatu", "nosferatu_1922",   "nosferatu_1922.mp4",               94),
]

# Anteile der Laufzeit, an denen gesucht wird. Der Anfang faellt weg:
# dort stehen meist Vorspann und Schwarzblende.
MARKS = (0.22, 0.34, 0.46, 0.58, 0.70)


def grab(url, seconds, path):
    """Ein Einzelbild an der Stelle holen. True bei Erfolg."""
    cmd = [
        "ffmpeg", "-y", "-loglevel", "error",
        "-ss", str(int(seconds)),
        "-i", url,
        "-frames:v", "1",
        "-vf", "scale=1600:-2",
        path,
    ]
    try:
        r = subprocess.run(cmd, timeout=120, capture_output=True)
    except subprocess.TimeoutExpired:
        return False
    return r.returncode == 0 and os.path.exists(path) and os.path.getsize(path) > 2000


def quality(path):
    """Bewertet ein Bild: hell genug und mit Zeichnung.

    Ein reines Schwarzbild hat kaum Streuung; eine Ueberblendung ist flau.
    Beides taugt nicht als Poster, deshalb entscheidet die
    Standardabweichung, gedaempft durch einen Helligkeitsfilter."""
    try:
        im = Image.open(path).convert("L")
    except Exception:
        return -1.0
    st = ImageStat.Stat(im)
    mean = st.mean[0]
    sd = st.stddev[0]
    if mean < 38 or mean > 232:          # zu dunkel oder ausgebrannt
        return -1.0
    return sd


def best_frame(url, minutes, work):
    """Mehrere Stellen probieren und die mit der meisten Zeichnung nehmen."""
    best, best_score = None, -1.0
    for i, m in enumerate(MARKS):
        p = os.path.join(work, "cand%d.jpg" % i)
        if not grab(url, minutes * 60 * m, p):
            continue
        s = quality(p)
        print("      %5.1f %% -> Zeichnung %.1f" % (m * 100, s))
        if s > best_score:
            best_score, best = s, p
        if best_score > 55:              # gut genug, weitere Versuche sparen
            break
    return best


def cover(im, size):
    """Fuellt die Zielflaeche und schneidet den Ueberstand ab."""
    tw, th = size
    sw, sh = im.size
    scale = max(tw / sw, th / sh)
    im2 = im.resize((max(1, int(sw * scale)), max(1, int(sh * scale))), Image.LANCZOS)
    x = (im2.width - tw) // 2
    y = int((im2.height - th) * 0.38)    # etwas oberhalb der Mitte: Gesichter
    return im2.crop((x, y, x + tw, y + th))


def make_backdrop(src, dst):
    im = Image.open(src).convert("RGB")
    cover(im, (1920, 1080)).save(dst, quality=86, optimize=True)


def make_poster(src, dst):
    """Poster im Verhaeltnis 2:3.

    Ein Filmbild ist breit, das Poster ist hoch. Ein erster Versuch legte das
    Bild auf eine unscharf gezogene Fassung seiner selbst - das ergab unten
    eine tote Schlierenflaeche. Deshalb wird jetzt randlos beschnitten: das
    Ergebnis ist durchgehend scharf und sieht aus wie echtes Titelbild.
    Unten dunkelt nur noch ein schmaler Verlauf ab, damit die Kennzeichnung
    der Quelle darauf lesbar bleibt."""
    W, H = 600, 900
    im = Image.open(src).convert("RGB")
    out = cover(im, (W, H))

    # Verlauf im unteren Drittel, in einem schmalen Streifen gezeichnet
    # und auf die Breite gedehnt - spart das Rechnen ueber alle Punkte.
    grad = Image.new("L", (1, H))
    gd = grad.load()
    for y in range(H):
        t = y / float(H - 1)
        gd[0, y] = 0 if t < 0.66 else int(min(1.0, (t - 0.66) / 0.34) ** 1.7 * 190)
    out.paste(Image.new("RGB", (W, H), (7, 8, 12)), (0, 0), grad.resize((W, H)))

    out.save(dst, quality=88, optimize=True)


def main():
    os.makedirs(OUT, exist_ok=True)
    made, failed = 0, []

    for key, ident, fname, minutes in TITLES:
        poster = os.path.join(OUT, key + "-poster.jpg")
        backdrop = os.path.join(OUT, key + "-backdrop.jpg")
        if os.path.exists(poster) and os.path.exists(backdrop) and "--force" not in sys.argv:
            print("  %-10s liegt schon vor" % key)
            made += 1
            continue

        url = IA + ident + "/" + fname
        print("  %-10s %s" % (key, ident))
        with tempfile.TemporaryDirectory() as work:
            src = best_frame(url, minutes, work)
            if not src:
                print("      kein brauchbares Bild")
                failed.append(key)
                continue
            make_backdrop(src, backdrop)
            make_poster(src, poster)
            made += 1
            print("      erzeugt")

    print("\nFertig: %d Titel mit Bild, %d ohne %s" %
          (made, len(failed), ("(" + ", ".join(failed) + ")") if failed else ""))
    return 0 if made else 1


if __name__ == "__main__":
    sys.exit(main())
