#!/usr/bin/env bash
# Empties the database: every user, account, transaction, budget, Utang-piutang record, investment,
# chat message and the WhatsApp bot session. The tables and the migration history stay, so the app
# starts again as a fresh install (register again; the admin scans the bot QR again).
#
# Run on the VPS from the app folder:   bash deploy/vps/reset-data.sh
# A backup is made first (backups/whatsmon-<date>.sql.gz); restoring it is described in deploy/vps/README.md.
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$APP_DIR"
compose() { docker compose -f docker-compose.prod.yml --env-file .env.prod "$@"; }

echo "Ini akan MENGHAPUS SEMUA DATA: semua user, rekening, transaksi, anggaran, utang-piutang,"
echo "investasi, chat, dan sesi bot WhatsApp. Struktur tabel tetap ada."
echo

echo "1/3 Backup dulu..."
bash deploy/vps/backup.sh
echo

read -r -p 'Ketik HAPUS SEMUA untuk melanjutkan: ' answer
if [ "$answer" != "HAPUS SEMUA" ]; then
  echo "Dibatalkan. Tidak ada yang dihapus."
  exit 1
fi

echo "2/3 Mengosongkan semua tabel (kecuali riwayat migration)..."
compose exec -T postgres psql -U whatsmon -d whatsmon -v ON_ERROR_STOP=1 <<'SQL'
DO $$
DECLARE tables text;
BEGIN
  SELECT string_agg(format('%I.%I', schemaname, tablename), ', ')
    INTO tables
    FROM pg_tables
   WHERE schemaname = 'public' AND tablename <> '_prisma_migrations';
  IF tables IS NOT NULL THEN
    EXECUTE 'TRUNCATE ' || tables || ' CASCADE';
  END IF;
END $$;
SQL

echo "3/3 Restart API (bot WhatsApp melupakan sesi lamanya)..."
compose restart api

echo
echo "Selesai. Database kosong."
echo "Langkah berikutnya: daftar lagi di web dengan email admin, lalu buka 'Bot WhatsApp' dan scan QR-nya."
