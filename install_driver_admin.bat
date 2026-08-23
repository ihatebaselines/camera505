@echo off
title CAMERA 505 - Install ESP32 / Arduino CP2102 Driver
cd /d "%~dp0"
echo ==============================================================================
echo   CAMERA 505 -- Installing Silicon Labs CP210x USB Driver...
echo ==============================================================================
echo.
echo Opening Windows Administrator prompt to install driver...
powershell -Command "Start-Process cmd -ArgumentList '/c echo Installing CP210x Driver... & pnputil /add-driver \"%~dp0drivers\cp210x\silabser.inf\" /install & echo. & echo Driver Installation Complete! & pause' -Verb RunAs"
echo.
echo Please click 'Yes' on the Windows permission prompt.
pause
