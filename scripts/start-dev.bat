@echo off
title Wathba Platform [DEV MODE]
echo ==========================================
echo    Wathba Educational Platform - DEV MODE
echo ==========================================
echo.

:: مسارات الملفات
set PROJECT_DIR=E:\Projects\Wathba-Platform-Education\Wathba-Education-Platform

echo [1/2] Starting Backend Server...
:: في وضع التطوير نستخدم NODE_ENV=development
start "Wathba Backend (Dev)" cmd /k "cd /d %PROJECT_DIR% && set NODE_ENV=development && node server/index.js"

echo Waiting for server to initialize (3 seconds)...
timeout /t 3 /nobreak >nul

echo [2/2] Starting Frontend Client (Hot-Reloading)...
start "Wathba Frontend (Dev)" cmd /k "cd /d %PROJECT_DIR%\client && npm run dev"

echo.
echo ==========================================
echo    Platform is starting in DEV MODE!
echo.
echo    Backend API:  http://localhost:3001
echo    Frontend:     http://localhost:5000
echo.
echo    Note: Changes to Frontend code will 
echo    reflect immediately in the browser.
echo ==========================================
echo.
echo Press any key to exit...
pause >nul
