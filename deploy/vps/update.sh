#!/usr/bin/env bash
# Pulls the latest code of the deploy branch and rebuilds what changed. Run as root on the VPS:
#   /opt/whatsmontrack/deploy/vps/update.sh
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$APP_DIR"

git pull --ff-only
chmod +x deploy/vps/*.sh
# Backup first, so a failed migration can be rolled back
./deploy/vps/backup.sh
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
# Free disk space taken by old images and build cache
docker image prune -f >/dev/null
docker builder prune -f --filter until=168h >/dev/null
docker compose -f docker-compose.prod.yml --env-file .env.prod ps
