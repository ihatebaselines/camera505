@echo off
title CAMERA 505 - INTERACTIVE TRAINING & BASELINE MENU
color 0B
cd /d "%~dp0"

where python >nul 2>nul
if %errorlevel% neq 0 (
    color 0C
    echo [ERROR] Python is not found in your system PATH!
    echo Please install Python 3.10+ and add it to your PATH.
    echo.
    pause
    exit /b 1
)

python scripts\menu_trainer.py
if %errorlevel% neq 0 (
    echo.
    pause
)
