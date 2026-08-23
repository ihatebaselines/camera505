@echo off
title CAMERA 505 — Push to GitHub (One-Time Safe Push)
color 0B
cd /d "%~dp0"

echo ==============================================================================
echo   CAMERA 505 — GitHub Repository Deploy
echo   Target: https://github.com/ihatebaselines/camera505
echo ==============================================================================
echo.

where git >nul 2>nul
if %errorlevel% neq 0 (
    echo [!] Git is not found in PATH.
    echo Please install Git for Windows from: https://git-scm.com/download/win
    echo.
    pause
    exit /b 1
)

echo [1/5] Initializing local Git repository...
if not exist ".git" (
    git init
    git branch -M main
    git remote add origin https://github.com/ihatebaselines/camera505.git
) else (
    git remote set-url origin https://github.com/ihatebaselines/camera505.git
)

echo.
echo [2/5] Staging project files (excluding node_modules / .next)...
git add .

echo.
echo [3/5] Creating commit...
git commit -m "ilove67,ihatebaselines,but stop making jokes with 67"

echo.
echo ==============================================================================
echo  GitHub requires a Personal Access Token (PAT) instead of account password.
echo  Generate a 1-day token here: https://github.com/settings/tokens
echo ==============================================================================
echo.
set /p TOKEN="Enter your GitHub Personal Access Token: "

if "%TOKEN%"=="" (
    echo [ERROR] Token cannot be empty.
    pause
    exit /b 1
)

echo.
echo [4/5] Pushing to origin main...
git push -u https://ihatebaselines:%TOKEN%@github.com/ihatebaselines/camera505.git main --force

echo.
echo [5/5] Sanitizing remote URL (removing token from memory/git config)...
git remote set-url origin https://github.com/ihatebaselines/camera505.git
set TOKEN=

echo.
echo ==============================================================================
echo  ✓ Commit & Push completed! No credentials were saved on this machine.
echo ==============================================================================
echo.
pause
