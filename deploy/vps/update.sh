#!/usr/bin/env bash
# Applies a release on the server: the latest code from GitHub plus the images built on the laptop.
# Normally started by deploy/vps/release.sh. Manual use, after copying the image file here:
#   /opt/whatsmontrack/deploy/vps/update.sh /root/whatsmontrack-images.tar.gz
# Nothing is built on the server (too slow for 1 vCPU / 1 GB).
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
IMAGES="${1:-/root/whatsmontrack-images.tar.gz}"
cd "$APP_DIR"
dc() { docker compose -f docker-compose.prod.yml --env-file .env.prod "$@"; }
step() { echo; echo "==> $*"; }

[ -f "$IMAGES" ] || {
  echo "No image file at $IMAGES."
  echo "Build it on the laptop with deploy/vps/release.sh (or copy it here with scp first)."
  exit 1
}

step "Latest code (compose file, Caddyfile, scripts)"
git pull --ff-only
chmod +x deploy/vps/*.sh

step "Backup before the new version runs its database migrations"
if [ -n "$(dc ps -q --status running postgres)" ]; then
  ./deploy/vps/backup.sh
else
  echo "Database not running yet (first deploy): nothing to back up."
fi

step "Loading the new images"
gunzip -c "$IMAGES" | docker load

step "Restarting what changed (no build on the server)"
dc up -d --no-build

step "Waiting for the API to report healthy"
for i in $(seq 1 30); do
  if dc exec -T api wget -qO- http://localhost:3000/api/health 2>/dev/null | grep -q '"ok":true'; then
    echo "API healthy."; break
  fi
  [ "$i" -eq 30 ] && { echo "API did not become healthy in 60 s. Check: dc logs api"; exit 1; }
  sleep 2
done

step "Cleaning up"
rm -f "$IMAGES"
docker image prune -f >/dev/null
dc ps
