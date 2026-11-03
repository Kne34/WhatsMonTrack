Write-Host "=======================================" -ForegroundColor Cyan
Write-Host "   WhatsApp Session Reset Utility" -ForegroundColor Cyan
Write-Host "=======================================" -ForegroundColor Cyan
Write-Host ""
# The bot session is stored in the database (table "WhatsAppAuth"), not in a folder.
# Normally use the dashboard instead: Bot WhatsApp -> Reset sesi.

Write-Host "[1/3] Deleting the stored WhatsApp session..." -ForegroundColor Yellow
'DELETE FROM "WhatsAppAuth";' | docker compose exec -T api npx prisma db execute --stdin

Write-Host "[2/3] Restarting the API container..." -ForegroundColor Yellow
docker compose restart api

Write-Host "[3/3] Showing logs to scan the new QR code (press Ctrl+C to exit)..." -ForegroundColor Yellow
Write-Host ""
docker logs whatsmon-api -f
