@echo off
echo =======================================
echo    WhatsApp Session Reset Utility
echo =======================================
echo.
rem The bot session is stored in the database (table "WhatsAppAuth"), not in a folder.
rem Normally use the dashboard instead: Bot WhatsApp -^> Reset sesi.

echo [1/3] Deleting the stored WhatsApp session...
echo DELETE FROM "WhatsAppAuth"; | docker compose exec -T api npx prisma db execute --stdin

echo [2/3] Restarting the API container...
docker compose restart api

echo [3/3] Showing logs to scan the new QR code (press Ctrl+C to exit)...
echo.
docker logs whatsmon-api -f
