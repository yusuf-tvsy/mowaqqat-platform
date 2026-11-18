#!/usr/bin/env bash
# Read-only check of the actual production volume; does not write or restart.
set -Eeuo pipefail
: "${KADER_PROJECT_ID:?Set KADER_PROJECT_ID from the verified Railway dashboard}"
: "${KADER_SERVICE_ID:?Set KADER_SERVICE_ID from the verified Railway dashboard}"
command -v railway >/dev/null || { echo 'Install CLI: npm install -g @railway/cli'; exit 1; }
railway whoami >/dev/null || { echo 'Authorize with railway login --browserless'; exit 1; }
KEY="${KADER_SSH_KEY:-$HOME/.ssh/kader_codespaces_ed25519}"
[ -f "$KEY" ] || { echo "Missing SSH key: $KEY"; exit 1; }
railway ssh -p "$KADER_PROJECT_ID" -s "$KADER_SERVICE_ID" -e production -i "$KEY" -- sh -lc '
  set -eu
  test -d /data || { echo "Mount /data is missing"; exit 2; }
  echo "Volume mount /data found"
  echo "Release files (names only):"
  find /data/kader-releases -maxdepth 2 -type f \( -name start.py -o -name index.html \) 2>/dev/null | head -n 35 || true
  echo "Free disk capacity:"
  df -h /data | tail -n 1
'
