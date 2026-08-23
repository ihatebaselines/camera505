@echo off
title CAMERA 505 - LIFE PLATFORM [*WE DON'T SUPPORT 67*]
color 0A
cd /d "%~dp0"

echo ==============================================================================
echo   CAMERA 505 - LIFE PLATFORM LAUNCHER
echo   *WE DON'T SUPPORT 67*
echo ==============================================================================
echo.

where python >nul 2>nul
if %errorlevel% neq 0 (
    color 0C
    echo [ERROR] Python is not found in your system PATH!
    echo Please install Python 3.10+ from python.org and check "Add Python to PATH".
    echo.
    pause
    exit /b 1
)

python scripts\init_db.py
if %errorlevel% neq 0 exit /b %errorlevel%
python scripts\start_all.py
if %errorlevel% neq 0 (
    echo.
    echo [INFO] Launcher exited.
    pause
)
