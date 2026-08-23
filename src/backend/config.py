"""
LIFE Platform - Backend Configuration
"""

import os

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA_DIR = os.path.join(BASE_DIR, "data")
os.makedirs(DATA_DIR, exist_ok=True)

DB_PATH = os.path.join(DATA_DIR, "life_signals.db")
STATIC_UI_DIR = os.path.join(BASE_DIR, "ui")

HOST = "0.0.0.0"
PORT = 8000

# Signal Processing Defaults
ECG_SAMPLING_RATE = 250   # Hz
AUDIO_SAMPLING_RATE = 16000 # Hz
POWERLINE_FREQ = 50.0      # Hz (Europe / Romania)
WINDOW_SECONDS = 30.0      # Foundation token window length
