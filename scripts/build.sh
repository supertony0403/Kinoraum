#!/usr/bin/env bash
# Packt Kinoraum zu einer IPK, die sich auf den LG-Fernseher installieren laesst.
#
# Gebraucht wird die webOS-Kommandozeile (@webosose/ares-cli). Fehlt sie,
# wird sie hier lokal ins Projekt gelegt - ohne Eingriff ins System.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

OUT="$ROOT/dist"
STAGE="$ROOT/.stage"

echo "== Kinoraum verpacken"

# ---------------------------------------------------------------- Werkzeug
find_ares() {
  if command -v ares-package >/dev/null 2>&1; then
    echo "ares-package"; return 0
  fi
  if [ -x "$ROOT/node_modules/.bin/ares-package" ]; then
    echo "$ROOT/node_modules/.bin/ares-package"; return 0
  fi
  return 1
}

if ! ARES_PACKAGE="$(find_ares)"; then
  echo "-- webOS-Kommandozeile fehlt, wird lokal installiert (npm)"
  # Ueber package.json, nicht ueber "npm install --no-save <paket>": ohne
  # package.json haelt npm den leeren Baum fuer aktuell und installiert nichts.
  npm install --silent
  ARES_PACKAGE="$ROOT/node_modules/.bin/ares-package"
  [ -x "$ARES_PACKAGE" ] || {
    echo "!! ares-package fehlt weiterhin. Von Hand: npm install"
    exit 1
  }
fi
echo "   ares-package: $ARES_PACKAGE"

# ---------------------------------------------------------------- Pruefung
node -e "JSON.parse(require('fs').readFileSync('appinfo.json','utf8'))" \
  || { echo "!! appinfo.json ist kein gueltiges JSON"; exit 1; }

for f in $(grep -oE 'src="js/[^"]+"' index.html | sed 's/src="//;s/"//'); do
  [ -f "$f" ] || { echo "!! In index.html verlinkt, aber nicht vorhanden: $f"; exit 1; }
done

# Syntaxfehler wuerden auf dem Fernseher nur als weisser Schirm auffallen.
if command -v node >/dev/null 2>&1; then
  for f in $(find js -name '*.js' ! -path 'js/lib/*'); do
    node --check "$f" >/dev/null || { echo "!! Syntaxfehler in $f"; exit 1; }
  done
  echo "   Alle Skripte syntaktisch geprueft"
fi

# Die Kurzform inset: gibt es erst ab Chromium 87, Ziel ist Chromium 53.
# Sie faellt dort ersatzlos weg - der Fokusring wird unsichtbar und die
# Schirme verlieren ihre Vollflaeche, ohne dass im Testbrowser etwas auffiele.
if grep -nE '(^|[{;[:space:]])inset:' css/*.css | grep -v 'box-shadow' | grep -q .; then
  echo "!! CSS-Kurzform 'inset:' gefunden - auf Chromium 53 wirkungslos:"
  grep -nE '(^|[{;[:space:]])inset:' css/*.css | grep -v 'box-shadow' | sed 's/^/     /'
  echo "   Stattdessen top/right/bottom/left einzeln schreiben."
  exit 1
fi
echo "   CSS auf Chromium-53-Vertraeglichkeit geprueft"

[ -f assets/icon.png ] || { echo "!! assets/icon.png fehlt (scripts/make_assets.py)"; exit 1; }

if [ ! -d assets/demo ] || [ -z "$(ls -A assets/demo 2>/dev/null)" ]; then
  echo "   Hinweis: assets/demo ist leer. Die Demo-Titel zeigen dann Farbflaechen"
  echo "            statt Bilder. Mit 'python3 scripts/make_demo_art.py' erzeugen."
fi

# ---------------------------------------------------------------- Packen
# Ueber einen Zwischenordner, damit weder .git noch node_modules
# noch die Skripte in der IPK landen.
rm -rf "$STAGE" "$OUT"
mkdir -p "$STAGE" "$OUT"

cp appinfo.json "$STAGE/"
cp index.html "$STAGE/"
cp -r css js assets "$STAGE/"

# Aufraeumen: nichts mitschleppen, was auf dem Fernseher nichts zu suchen hat
find "$STAGE" -name '.DS_Store' -delete 2>/dev/null || true
find "$STAGE" -name '*.map' -delete 2>/dev/null || true

SIZE=$(du -sh "$STAGE" | cut -f1)
echo "   Inhalt: $SIZE"

"$ARES_PACKAGE" "$STAGE" -o "$OUT"

rm -rf "$STAGE"

IPK="$(ls -1 "$OUT"/*.ipk 2>/dev/null | head -1)"
if [ -z "$IPK" ]; then
  echo "!! Es wurde keine IPK erzeugt"
  exit 1
fi

echo
echo "== Fertig: $IPK  ($(du -h "$IPK" | cut -f1))"
echo
echo "   Installieren:  scripts/install.sh"
echo "   Vorher einmal: ares-setup-device   (Fernseher eintragen)"
