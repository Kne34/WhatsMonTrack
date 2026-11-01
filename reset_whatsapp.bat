@echo off
echo =======================================
echo    WhatsApp Session Reset Utility
echo =======================================
echo.

echo [1/4] Stopping API Container...
docker compose stop api

echo [2/4] Deleting stale auth_info_baileys folder...
rmdir /s /q backend\api\auth_info_baileys 2>nul

echo [3/4] Restarting API Container...
docker compose start api

echo [4/4] Showing logs to scan new QR Code (Press Ctrl+C to exit)...
echo.
docker logs whatsmon-api -f
