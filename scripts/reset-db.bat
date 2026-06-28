@echo off
title Wathba Reset Database
cd /d "%~dp0.."
echo ==========================================
echo    Wathba Reset Database
echo ==========================================
echo.
echo This will DELETE ALL data in the database.
echo Admin teacher account will be preserved.
echo.
set /p confirm="Proceed with reset? (Y/N): "
if /i not "%confirm%"=="Y" (
    echo.
    echo Reset cancelled.
    pause
    exit /b
)
echo.
echo [1/1] Running reset script...
echo.
node server/db/reset.js
echo.
if %errorlevel% equ 0 (
    echo ==========================================
    echo    Reset completed successfully!
    echo ==========================================
) else (
    echo ==========================================
    echo    Reset failed with error code %errorlevel%
    echo ==========================================
)
echo.
pause
