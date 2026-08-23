@echo off
title CAMERA 505 - Silicon Labs CP2102 Driver Quick-Installer
cd /d "%~dp0"
echo ==============================================================================
echo   CAMERA 505 -- Silicon Labs CP2102 Driver Quick-Installer
echo ==============================================================================
echo.
echo Pasul 1: Se deschide folderul cu driverul.
echo Pasul 2: Da click DREAPTA pe fisierul 'silabser.inf' (sau 'silabser') si alege 'Install' (Instaleaza).
echo.
explorer "%~dp0drivers\cp210x"
pause
