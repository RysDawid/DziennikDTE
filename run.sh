#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# DTE — CNE | Uruchamianie aplikacji (dev)
# Tworzy venv, instaluje zależności i startuje serwer FastAPI.
#
#   ./run.sh            # port 8000, dostępny w całej sieci LAN
#   ./run.sh 8080       # własny port
#   PORT=8080 ./run.sh  # własny port (zmienna)
#   HOST=127.0.0.1 ./run.sh  # tylko ten komputer (bez dostępu z sieci)
#
# Gdy „Permission denied" — uruchom: bash run.sh   (Dropbox bywa gubi bit +x)
# ---------------------------------------------------------------------------
set -euo pipefail

# Katalog skryptu = katalog projektu (działa też ze spacjami/znakami w ścieżce)
cd "$(dirname "$(readlink -f "$0")")"

HOST="${HOST:-0.0.0.0}"   # domyślnie dostępny dla innych urządzeń w sieci
PORT="${1:-${PORT:-8000}}"
VENV=".venv"

# Wybór interpretera Pythona
PY="$(command -v python3 || command -v python || true)"
if [ -z "$PY" ]; then
  echo "✗ Nie znaleziono Pythona 3. Zainstaluj python3 i spróbuj ponownie." >&2
  exit 1
fi

# Środowisko wirtualne
if [ ! -d "$VENV" ]; then
  echo "▸ Tworzę środowisko wirtualne ($VENV)…"
  "$PY" -m venv "$VENV"
fi
# shellcheck disable=SC1091
source "$VENV/bin/activate"

# Zależności — instaluj tylko gdy się zmieniły (znacznik wg hasha requirements)
STAMP="$VENV/.requirements.sha"
REQ_HASH="$(sha1sum requirements.txt | awk '{print $1}')"
if [ ! -f "$STAMP" ] || [ "$(cat "$STAMP")" != "$REQ_HASH" ]; then
  echo "▸ Instaluję zależności…"
  pip install -q --upgrade pip
  pip install -q -r requirements.txt
  echo "$REQ_HASH" > "$STAMP"
fi

LINE="════════════════════════════════════════════════════"
echo ""
echo "$LINE"
echo "  DTE — CNE  uruchamianie…"
echo "  Ten komputer:   http://localhost:${PORT}"
if [ "$HOST" = "0.0.0.0" ]; then
  IPS="$(hostname -I 2>/dev/null || true)"
  if [ -n "${IPS// }" ]; then
    echo "  W sieci LAN (wpisz na innym urządzeniu/telefonie):"
    for ip in $IPS; do
      case "$ip" in
        127.*|169.254.*|*:*) ;;                 # pomiń loopback / APIPA / IPv6
        *) echo "                  http://${ip}:${PORT}" ;;
      esac
    done
  fi
  echo "  Jeśli inne urządzenie nie łączy się: odblokuj port ${PORT} w firewallu."
else
  echo "  (HOST=${HOST} — dostęp tylko z tego komputera)"
fi
echo "  Ctrl+C aby zatrzymać."
echo "$LINE"
echo ""

# Udostępnij port banerowi w main.py (lifespan) i uruchom serwer
export DTE_PORT="$PORT"
exec uvicorn main:app --reload --host "$HOST" --port "$PORT"
