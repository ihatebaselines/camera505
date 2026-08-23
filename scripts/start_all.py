#!/usr/bin/env python3
"""
CAMERA 505 - Medical Sleep Monitoring Platform - Master Launcher
Starts:
  - FastAPI High-Performance Backend & WebSocket Streamer (localhost:8000)
  - Next.js 15 Full-Screen Web Dashboard (localhost:6767)
Automatically opens the browser to http://localhost:6767.
"""

import subprocess
import sys
import os
import time
import threading
import webbrowser

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FRONTEND_DIR = os.path.join(BASE, "life-mobile")

BANNER = r"""
==============================================================================
    ____    _    __  __ _____ ____      _         ____   ___   ____
   / ___|  / \  |  \/  | ____|  _ \   / \        | ___|/ _ \ | ___|
  | |     / _ \ | |\/| |  _| | |_) | / _ \       |___ \| | | ||___ \
  | |___ / ___ \| |  | | |___|  _ < / ___ \   _   ___) | |_| | ___) |
   \____/_/   \_\_|  |_|_____|_| \_\/_/   \_\(_) |____/ \___/ |____/

              CAMERA 505 - Medical Sleep Monitoring Platform
              Hardware: ESP32 + AD8232 ECG + Microphone Array
              Dashboard : http://localhost:6767
              API Docs  : http://localhost:8000/docs
==============================================================================
"""

def stream_output(proc, prefix):
    """Stream process output with a prefix label."""
    try:
        for line in iter(proc.stdout.readline, b""):
            decoded = line.decode("utf-8", errors="replace").rstrip()
            if decoded:
                print(f"[{prefix}] {decoded}")
        proc.stdout.close()
    except Exception:
        pass

def stream_stderr(proc, prefix):
    try:
        for line in iter(proc.stderr.readline, b""):
            decoded = line.decode("utf-8", errors="replace").rstrip()
            if decoded:
                print(f"[{prefix}][ERR] {decoded}")
        proc.stderr.close()
    except Exception:
        pass

def start_backend():
    print("[LAUNCHER] Launching FastAPI Backend on http://localhost:8000 ...")
    proc = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "src.backend.app:app",
         "--host", "0.0.0.0", "--port", "8000"],
        cwd=BASE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    threading.Thread(target=stream_output, args=(proc, "BACKEND"), daemon=True).start()
    threading.Thread(target=stream_stderr, args=(proc, "BACKEND"), daemon=True).start()
    return proc

def initialize_database():
    """Create tables on every launch; recordings remain local and untracked."""
    from src.storage.database import LifeDatabase
    db = LifeDatabase()
    print(f"[LAUNCHER] Database ready: {db.db_path}")

def start_frontend():
    npm_cmd = "npm.cmd" if sys.platform == "win32" else "npm"
    print("[LAUNCHER] Launching Next.js Web Dashboard on http://localhost:6767 ...")
    proc = subprocess.Popen(
        [npm_cmd, "run", "dev"],
        cwd=FRONTEND_DIR,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    threading.Thread(target=stream_output, args=(proc, "FRONTEND"), daemon=True).start()
    threading.Thread(target=stream_stderr, args=(proc, "FRONTEND"), daemon=True).start()
    return proc

def open_browser_delayed(url, delay=4.0):
    time.sleep(delay)
    print(f"\n[LAUNCHER] Opening {url} in your default browser...\n")
    try:
        webbrowser.open(url)
    except Exception as e:
        print(f"[LAUNCHER] Could not auto-open browser: {e}")

if __name__ == "__main__":
    initialize_database()
    print(BANNER)
    print("  [1] FastAPI Backend Engine   -> http://localhost:8000")
    print("  [2] Next.js Web Dashboard    -> http://localhost:6767")
    print("  [3] Live WebSocket Stream    -> ws://localhost:8000/ws/live")
    print("=" * 78 + "\n")
    
    backend  = start_backend()
    time.sleep(2)
    frontend = start_frontend()
    
    # Start Ollama AI engine in background thread
    def _init_ollama():
        try:
            sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
            from src.ai.ollama_engine import ensure_ollama_ready
            model = ensure_ollama_ready()
            if model:
                print(f"[CAMERA 505 AI] ✓ Ollama ready — model: {model}")
            else:
                print("[CAMERA 505 AI] ⚠ Ollama unavailable — AI reports will use fallback mode")
        except Exception as e:
            print(f"[CAMERA 505 AI] ⚠ Ollama init error: {e}")

    ollama_thread = threading.Thread(target=_init_ollama, daemon=True)
    ollama_thread.start()

    # Launch browser after short delay
    threading.Thread(target=open_browser_delayed, args=("http://localhost:6767", 5.0), daemon=True).start()
    
    print("\n[LAUNCHER] CAMERA 505 System is running!")
    print("[LAUNCHER] Dashboard: http://localhost:6767")
    print("[LAUNCHER] API Docs:  http://localhost:8000/docs")
    print("[LAUNCHER] Press Ctrl+C at any time to stop all services.\n")
    
    try:
        while True:
            time.sleep(1)
            if backend.poll() is not None:
                print("[LAUNCHER] Backend stopped. Restarting...")
                backend = start_backend()
            if frontend and frontend.poll() is not None:
                print("[LAUNCHER] Frontend stopped. Restarting...")
                frontend = start_frontend()
    except KeyboardInterrupt:
        print("\n[LAUNCHER] Shutting down services...")
        if backend:
            backend.terminate()
        if frontend:
            frontend.terminate()
        print("[LAUNCHER] All services stopped cleanly. Bye!")
