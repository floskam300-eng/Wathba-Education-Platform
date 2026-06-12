@echo off
title Wathba Platform Launcher
echo ==========================================
echo    Wathba Educational Platform Launcher
echo ==========================================
echo.

:: مسارات الملفات
set PROJECT_DIR=E:\Projects\Wathba-Platform-Education\Wathba-Education-Platform
set CLOUDFLARED_EXE=E:\Cloudflared\cloudflared.exe
set TUNNEL_CONFIG=E:\Cloudflared\config.yml

echo [1/2] Starting Backend Server in a new window...
start "Wathba Backend" cmd /k "cd /d %PROJECT_DIR% && node server/index.js"

echo Waiting for server to warm up (5 seconds)...
timeout /t 5 /nobreak >nul

echo [2/2] Starting Cloudflare Tunnel in a new window...
start "Wathba Tunnel" cmd /k "cd /d E:\Cloudflared && %CLOUDFLARED_EXE% tunnel --config %TUNNEL_CONFIG% run"

echo.
echo ==========================================
echo    Platform is now starting!
echo    Public URL:  https://wathba.site
echo    Local Admin: http://localhost:3001
echo ==========================================
echo.
echo You can close this window now.
pause
