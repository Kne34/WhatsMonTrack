#!/usr/bin/env bash
# Dumps the database (including the WhatsApp session) to $APP_DIR/backups, keeping 14 days.
# Runs daily from cron (see setup.sh). Restore: see deploy/vps/README.md.
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
KEEP_DAYS=14
cd "$APP_DIR"
mkdir -p backups
chmod 700 backups

file="backups/whatsmon-$(date +%F-%H%M).sql.gz"
docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T postgres \
  pg_dump -U whatsmon -d whatsmon --no-owner | gzip > "$file.tmp"
mv "$file.tmp" "$file"
chmod 600 "$file"

find backups -name 'whatsmon-*.sql.gz' -mtime +"$KEEP_DAYS" -delete
echo "$(date '+%F %T') backup ok: $file ($(du -h "$file" | cut -f1))"
