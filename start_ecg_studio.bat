@echo off
cd /d "%~dp0"
python scripts\init_db.py
if %errorlevel% neq 0 exit /b %errorlevel%
title CAMERA 505 - ECG Studio + Web Dashboard
echo.
echo =========================================
echo  CAMERA 505 - ECG Studio
echo  Hardware ECG + Web Dashboard
echo =========================================
echo.
echo [1/2] Starting desktop ECG oscilloscope...
start "ECG Desktop" python scripts\desktop_ecg_plotter.py
echo [2/2] Opening web dashboard...
timeout /t 2 /nobreak >nul
start "" http://localhost:6767/dashboard/night
echo.
echo Both ECG Studio and Web Dashboard are now running.
echo Close this window to stop the desktop plotter.
pause
