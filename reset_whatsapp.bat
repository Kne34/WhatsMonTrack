@echo off
echo =======================================
echo    WhatsApp Session Reset Utility
echo =======================================
echo.

echo [1/4] Stopping Gateway Container...
docker compose stop gateway

echo [2/4] Deleting stale auth_info_baileys folder...
rmdir /s /q backend\gateway\auth_info_baileys 2>nul

echo [3/4] Restarting Gateway Container...
docker compose start gateway

echo [4/4] Showing logs to scan new QR Code (Press Ctrl+C to exit)...
echo.
docker logs whatsmon-gateway -f
