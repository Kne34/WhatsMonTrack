Write-Host "=======================================" -ForegroundColor Cyan
Write-Host "   WhatsMonTrack Startup Utility" -ForegroundColor Cyan
Write-Host "=======================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "[1/3] Starting database layer..." -ForegroundColor Yellow
docker compose up -d postgres-master postgres-slave pgpool
Write-Host "Waiting 5 seconds for databases to initialize..." -ForegroundColor DarkGray
Start-Sleep -Seconds 5

Write-Host "`n[2/3] Starting core backend and frontend services..." -ForegroundColor Yellow
docker compose up -d transaction-service parser-service gateway frontend
Write-Host "Waiting 10 seconds for services to start..." -ForegroundColor DarkGray
Start-Sleep -Seconds 10

Write-Host "`n[3/3] Starting Nginx proxy..." -ForegroundColor Yellow
docker compose up -d nginx

Write-Host "`nApplication started!" -ForegroundColor Green
Write-Host "- Dashboard: http://localhost" -ForegroundColor White
Write-Host "- To view Gateway Logs (and QR Code): docker logs whatsmon-gateway -f" -ForegroundColor White
