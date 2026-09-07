#!/usr/bin/env bash
# Startet einen lokalen Server, um die App am Rechner zu pruefen.
# Der Browser ersetzt den Fernseher nicht, aber Aufbau, Fokus und
# Wiedergabe lassen sich damit vollstaendig durchgehen.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${1:-8137}"
echo "Kinoraum: http://127.0.0.1:$PORT/"
echo "Fenster auf 1920x1080 stellen. Pfeiltasten und Enter ersetzen die Fernbedienung."
exec python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$ROOT"
