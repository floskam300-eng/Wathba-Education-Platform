@echo off
title Wathba Platform Manager
echo ==========================================
echo    Wathba Educational Platform Manager
echo ==========================================
echo.

echo [1/3] Stopping any background processes...
taskkill /F /IM node.exe /T >nul 2>&1
echo Done.
echo.

echo [2/3] Starting Backend Server...
start "Wathba Backend" cmd /c "npm run server"
echo Waiting for server to initialize...
timeout /t 5 /nobreak >nul
echo.

echo [3/3] Starting Frontend Client...
start "Wathba Frontend" cmd /c "npm run client"
echo.

echo ==========================================
echo    Platform is starting in new windows!
echo    Backend: http://localhost:3001
echo    Frontend: http://localhost:5000
echo ==========================================
echo.
echo Press any key to exit this manager...
pause >nul
