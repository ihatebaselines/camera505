"""
LIFE Platform - One-Click Launcher
Starts the FastAPI backend and live dashboard server on http://localhost:8000
"""

import sys
import os
import uvicorn

# Add project root to sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.backend.config import HOST, PORT

def main():
    print("=" * 70)
    print("  [LIFE] Starting LIFE: Multimodal Adaptive Physiological Intelligence")
    print("  [INFO] Signals That Can Change The World -- Camera 505 Hackathon")
    print(f"  [WEB]  Dashboard & API Live at: http://localhost:{PORT}")
    print("=" * 70)
    
    uvicorn.run("src.backend.app:app", host=HOST, port=PORT, reload=False, log_level="info")

if __name__ == "__main__":
    main()
