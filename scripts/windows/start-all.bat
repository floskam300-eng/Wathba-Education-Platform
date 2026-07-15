@echo off
title Wathba Platform Launcher
echo ==========================================
echo    Wathba Educational Platform Launcher
echo ==========================================
echo.

set PROJECT_DIR=E:\Projects\Wathba-Platform-Education\Wathba-Education-Platform
set CLOUDFLARED_EXE=E:\Cloudflared\cloudflared.exe
set TUNNEL_CONFIG=E:\Cloudflared\config.yml

set BUILD_FRONT=n
set /p BUILD_FRONT="Build the frontend first? (y/n): "

if /i "%BUILD_FRONT%"=="y" (
    echo.
    echo ==========================================
    echo    Building Frontend Client...
    echo ==========================================
    cd /d "%PROJECT_DIR%\client" && call npm run build
    if errorlevel 1 (
        echo.
        echo [ERROR] Frontend build failed!
        echo.
        set CONTINUE_START=y
        set /p CONTINUE_START="Start servers anyway? (y/n): "
        if /i "%CONTINUE_START%"=="n" exit /b
    )
)

echo.
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
