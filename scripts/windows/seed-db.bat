@echo off
title Wathba Seed Database
cd /d "%~dp0..\.."
echo ==========================================
echo    Wathba - Seed Database
echo ==========================================
echo.
echo WARNING: This will clear ALL existing data
echo and re-populate the database with test data.
echo.
echo  Accounts that will be created:
echo     Teacher  : admin / admin123
echo     Assistant: asst_nour / 123456
echo     Student  : std_ali / 123456
echo.
set /p confirm="Proceed with seeding? (Y/N): "
if /i not "%confirm%"=="Y" (
    echo.
    echo Seed cancelled.
    pause
    exit /b
)
echo.
echo [1/1] Running seed script...
echo.
node server/db/seed.js
echo.
if %errorlevel% equ 0 (
    echo ==========================================
    echo    Seed completed successfully!
    echo ==========================================
) else (
    echo ==========================================
    echo    Seed failed! Error code: %errorlevel%
    echo ==========================================
)
echo.
pause
