#!/usr/bin/env bash
# Kinoraum auf den LG-Fernseher installieren - in einem Durchgang.
#
#   scripts/tv-install.sh <IP-des-Fernsehers> <Passphrase>
#
# Beide Angaben stehen am Fernseher in der App "Developer Mode":
# dort werden IP-Adresse und ein sechsstelliger "Key Server Passphrase"
# angezeigt, solange "Dev Mode Status" eingeschaltet ist.
#
# Das Skript legt das Geraet an, holt den SSH-Schluessel, baut bei Bedarf die
# IPK, installiert sie und startet die App.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
export PATH="$ROOT/node_modules/.bin:$PATH"

IP="${1:-}"
PASS="${2:-}"
NAME="${3:-tv}"

rot()  { printf '\033[31m%s\033[0m\n' "$*"; }
gruen(){ printf '\033[32m%s\033[0m\n' "$*"; }

if [ -z "$IP" ] || [ -z "$PASS" ]; then
  cat <<'HILFE'
Aufruf:  scripts/tv-install.sh <IP-des-Fernsehers> <Passphrase>

So kommst du an beides:
  1. Am Fernseher im LG Content Store die App "Developer Mode" installieren.
  2. Darin mit einem LG-Entwicklerkonto anmelden (kostenlos, auf
     developer.lge.com anlegen - dieselben Daten wie am TV verwenden).
  3. "Dev Mode Status" einschalten. Der Fernseher startet einmal neu.
  4. Die App zeigt danach die IP-Adresse und den Passphrase an.

Beispiel:
  scripts/tv-install.sh 192.168.1.42 A1B2C3
HILFE
  exit 2
fi

if ! command -v ares-setup-device >/dev/null 2>&1; then
  echo "-- webOS-Werkzeuge fehlen, werden lokal installiert"
  npm install --silent || { rot "!! npm install fehlgeschlagen"; exit 1; }
fi

echo "== 1/5  Erreichbarkeit von $IP:9922"
if ! timeout 6 bash -c "echo > /dev/tcp/$IP/9922" 2>/dev/null; then
  rot "!! Port 9922 antwortet nicht."
  cat <<HINWEIS
   Moegliche Gruende:
   - "Dev Mode Status" ist am Fernseher nicht eingeschaltet
   - der Fernseher steht in einem anderen Netz als dieser Rechner
     (dieser Rechner: $(ip -4 addr show scope global 2>/dev/null | grep -oP 'inet \K[\d.]+' | head -2 | tr '\n' ' '))
   - der Fernseher ist im Standby (Netzwerk aus)
HINWEIS
  exit 1
fi
gruen "   erreichbar"

echo "== 2/5  Geraet '$NAME' eintragen"
ares-setup-device -r "$NAME" >/dev/null 2>&1     # falls schon vorhanden
if ! ares-setup-device -a "$NAME" \
      -i "host=$IP" -i "port=9922" -i "username=prisoner" \
      -i "passphrase=$PASS" -i "description=LG TV (Kinoraum)" 2>&1 | sed 's/^/   /'; then
  rot "!! Eintragen fehlgeschlagen"
  exit 1
fi
gruen "   eingetragen"

echo "== 3/5  Schluessel holen und Verbindung pruefen"
if ! ares-device -i --device "$NAME" 2>&1 | sed 's/^/   /'; then
  rot "!! Der Fernseher antwortet nicht wie erwartet."
  echo "   Haeufigste Ursache: der Passphrase stimmt nicht mehr. Er wechselt,"
  echo "   sobald der Entwicklermodus neu eingeschaltet wird - am TV nachsehen."
  exit 1
fi
gruen "   Verbindung steht"

echo "== 4/5  IPK bereitstellen"
IPK="$(ls -1t "$ROOT"/dist/*.ipk 2>/dev/null | head -1)"
if [ -z "$IPK" ]; then
  echo "   keine IPK vorhanden, wird gebaut"
  bash "$ROOT/scripts/build.sh" >/dev/null 2>&1 || { rot "!! Bauen fehlgeschlagen"; exit 1; }
  IPK="$(ls -1t "$ROOT"/dist/*.ipk | head -1)"
fi
echo "   $(basename "$IPK")  ($(du -h "$IPK" | cut -f1))"

echo "== 5/5  Installieren und starten"
APPID="$(node -e "process.stdout.write(JSON.parse(require('fs').readFileSync('appinfo.json','utf8')).id)")"
ares-install --device "$NAME" "$IPK" 2>&1 | sed 's/^/   /' || { rot "!! Installieren fehlgeschlagen"; exit 1; }
ares-launch  --device "$NAME" "$APPID" 2>&1 | sed 's/^/   /' || { rot "!! Starten fehlgeschlagen"; exit 1; }

echo
gruen "Fertig. Kinoraum laeuft auf dem Fernseher."
cat <<ENDE

  Neue Fassung nachschieben:   scripts/tv-install.sh $IP $PASS
  Fehlersuche bei laufender App:
      ares-inspect --device $NAME --app $APPID
  Wieder entfernen:
      ares-install --device $NAME --remove $APPID

  Hinweis: LG schaltet den Entwicklermodus nach etwa 50 Stunden ab. In der
  Developer-Mode-App am Fernseher verlaengert "Extend" ihn; die installierte
  App bleibt dabei erhalten.
ENDE
