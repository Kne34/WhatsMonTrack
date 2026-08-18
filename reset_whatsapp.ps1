Write-Host "=======================================" -ForegroundColor Cyan
Write-Host "   WhatsApp Session Reset Utility" -ForegroundColor Cyan
Write-Host "=======================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "[1/4] Stopping Gateway Container..." -ForegroundColor Yellow
docker compose stop gateway

Write-Host "[2/4] Deleting stale auth_info_baileys folder..." -ForegroundColor Yellow
Remove-Item -Recurse -Force backend\gateway\auth_info_baileys -ErrorAction SilentlyContinue

Write-Host "[3/4] Restarting Gateway Container..." -ForegroundColor Yellow
docker compose start gateway

Write-Host "[4/4] Showing logs to scan new QR Code (Press Ctrl+C to exit)..." -ForegroundColor Yellow
Write-Host ""
docker logs whatsmon-gateway -f
