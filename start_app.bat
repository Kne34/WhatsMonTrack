@echo off
echo =======================================
echo    WhatsMonTrack Startup Utility
echo =======================================
echo.

echo [1/3] Starting database layer...
docker compose up -d postgres-master postgres-slave pgpool
echo Waiting 5 seconds for databases to initialize...
timeout /t 5 /nobreak >nul

echo.
echo [2/3] Starting core backend and frontend services...
docker compose up -d transaction-service parser-service gateway frontend
echo Waiting 10 seconds for services to start...
timeout /t 10 /nobreak >nul

echo.
echo [3/3] Starting Nginx proxy...
docker compose up -d nginx

echo.
echo Application started!
echo - Dashboard: http://localhost
