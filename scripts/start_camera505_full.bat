@echo off
title CAMERA 505 - Full Platform Launcher
echo.
echo ==========================================
echo  CAMERA 505 - Full Platform
echo  Backend + Frontend + AI Engine
echo ==========================================
echo.
echo [1/3] Starting CAMERA 505 platform...
start "CAMERA 505 Backend" python scripts\start_all.py
echo [2/3] Waiting for backend to initialize...
timeout /t 6 /nobreak >nul
echo [3/3] Opening main UI...
start "" http://localhost:6767
echo.
echo CAMERA 505 is running!
echo.
echo Available at: http://localhost:6767
echo API docs at: http://localhost:8000/docs
echo.
pause