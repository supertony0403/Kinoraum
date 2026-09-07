#!/usr/bin/env bash
# Installiert die gebaute IPK auf dem LG-Fernseher und startet sie.
#
# Vorbedingung am Fernseher:
#   1. Im LG Content Store die App "Developer Mode" installieren
#   2. Dort mit dem LG-Entwicklerkonto anmelden und "Dev Mode Status" einschalten
#   3. Der Fernseher zeigt eine IP und einen Passphrase-Schluessel
#   4. Am Rechner einmal:  ares-setup-device
#      Geraet hinzufuegen: Name z. B. "tv", die IP, Port 9922, Benutzer "prisoner"
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

DEVICE="${1:-tv}"
APPID="$(node -e "process.stdout.write(JSON.parse(require('fs').readFileSync('appinfo.json','utf8')).id)")"

bin() {
  if command -v "$1" >/dev/null 2>&1; then echo "$1"; return 0; fi
  if [ -x "$ROOT/node_modules/.bin/$1" ]; then echo "$ROOT/node_modules/.bin/$1"; return 0; fi
  echo "!! $1 nicht gefunden. Erst scripts/build.sh laufen lassen." >&2
  return 1
}

ARES_INSTALL="$(bin ares-install)"
ARES_LAUNCH="$(bin ares-launch)"

IPK="$(ls -1t "$ROOT"/dist/*.ipk 2>/dev/null | head -1)"
[ -n "$IPK" ] || { echo "!! Keine IPK in dist/. Erst scripts/build.sh laufen lassen."; exit 1; }

echo "== Installiere $(basename "$IPK") auf Geraet '$DEVICE'"
"$ARES_INSTALL" --device "$DEVICE" "$IPK"

echo "== Starte $APPID"
"$ARES_LAUNCH" --device "$DEVICE" "$APPID"

echo
echo "   Fehlersuche bei laufender App:"
echo "     ares-inspect --device $DEVICE --app $APPID"
echo "   Wieder entfernen:"
echo "     ares-install --device $DEVICE --remove $APPID"
