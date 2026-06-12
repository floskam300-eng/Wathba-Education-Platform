@echo off
title Cloudflare Tunnel Manager
echo ==========================================
echo    Wathba Platform - Cloudflare Tunnel
echo ==========================================
echo.

set CLOUDFLARED_PATH=E:\Cloudflared\cloudflared.exe
set CONFIG_PATH=E:\Cloudflared\config.yml

echo [1/2] Checking cloudflared.exe...
if not exist "%CLOUDFLARED_PATH%" (
    echo [ERROR] cloudflared.exe not found at %CLOUDFLARED_PATH%
    pause
    exit /b
)
echo Done.

echo [2/2] Starting Tunnel...
echo.
"%CLOUDFLARED_PATH%" tunnel --config "%CONFIG_PATH%" run

echo.
echo Tunnel stopped.
pause
