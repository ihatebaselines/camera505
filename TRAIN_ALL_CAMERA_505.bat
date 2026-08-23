@echo off
title CAMERA 505 - MASTER TRAINING SUITE (206k Hours & ESRS CatBoost)
color 0B
cd /d "%~dp0"

echo ==============================================================================
echo   CAMERA 505 — MASTER TRAINING SUITE
echo   *WE DON'T SUPPORT 67*
echo ==============================================================================
echo.
echo  [1/4] Generating 10,000 ESRS & AASM Clinical Patient Dataset
echo  [2/4] Training CatBoost GBDT Decision Tree Multi-Class Classifier
echo  [3/4] Running Multi-Core Parallel PyTorch Benchmark on 206,318 Hours
echo  [4/4] Pretraining 10-Step Multimodal Foundation Transformer (RoPE + 4 SSL Stages)
echo.
echo ==============================================================================

where python >nul 2>nul
if %errorlevel% neq 0 (
    color 0C
    echo [ERROR] Python is not found in your system PATH!
    echo Please install Python 3.10+ and add it to your PATH.
    echo.
    pause
    exit /b 1
)

python scripts\train_all_pipeline.py
if %errorlevel% neq 0 (
    color 0C
    echo.
    echo [ERROR] Master training pipeline encountered an issue.
    pause
    exit /b %errorlevel%
)

color 0A
echo.
echo ==============================================================================
echo   ALL CAMERA 505 MODELS SUCCESSFULLY TRAINED & SAVED IN foundation_models/
echo ==============================================================================
echo.
pause
