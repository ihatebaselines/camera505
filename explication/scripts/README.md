# scripts/ — All Runners, Diagnostics & Training Helpers

> Every file under `scripts/` — purpose, I/O, key functions, deps, demo role, one-liner.

---

## Orchestration / Launch

### `scripts/start_all.py`
- **Purpose:** Master orchestrator — starts FastAPI backend (`uvicorn src.backend.app:app`) + Life-Mobile frontend (`npm run dev`) and probes Ollama, mirroring `START_CAMERA_505.bat` but in Python.
- **Inputs/Outputs:** Reads `src/backend/config.py:HOST/PORT`, `life-mobile/package.json` dev script; spawns subprocesses, streams logs.
- **Key functions:** `main()`, port probes, process supervision.
- **Deps:** `subprocess`, `requests`, `psutil` (if present).
- **Demo:** One-command jury startup when `.bat` is not desired.
- **Run:** `python scripts/start_all.py`

### `scripts/run_server.py`
- **Purpose:** Minimal backend launcher — starts `uvicorn` on `src.backend.app:app` for devs who don't want frontend auto-start.
- **Run:** `python scripts/run_server.py` — then `http://localhost:8000/docs`

### `scripts/start_camera505_full.bat`
- **Purpose:** Windows `.bat` wrapper that calls Python orchestrator / uvicorn with correct venv. Duplicate of `START_CAMERA_505.bat` kept inside scripts for portability.
- **Run:** `scripts\start_camera505_full.bat`

### `scripts/run_esp32_live.py`
- **Purpose:** Standalone ESP32 live ingester — opens serial/WiFi ECG stream outside FastAPI, prints telemetry and optionally pushes to `StreamManager` for headless testing.
- **Key:** Argparse for `--port COM3 --baud 115200 --udp 3333`, loop reading `SerialEcgReader` / `ESP32WiFiECGStream`.
- **Run:** `python scripts/run_esp32_live.py --port COM3 --baud 115200`

### `scripts/menu_trainer.py`
- **Purpose:** Interactive TUI menu (used by `menu.bat`) — lets operator pick cohort training, benchmark, or launcher without remembering CLI flags.
- **Run:** `python scripts/menu_trainer.py`

---

## Training

### `scripts/train_all_pipeline.py`
- **Purpose:** End-to-end training pipeline — generates ESRS dataset → trains CatBoost ESRS → parallel cohort training (Soft-F1) → saves to `foundation_models/` + `checkpoints/`. Central entry called by `TRAIN_ALL_CAMERA_505.bat`.
- **Inputs:** `data/catboost_esrs_dataset.csv` (or generates via `src/data/generate_esrs_dataset.py`)
- **Outputs:** `foundation_models/catboost_esrs_classifier.cbm`, `foundation_models/catboost_metrics.json`, `checkpoints/trained_cohorts.json`
- **Key:** imports `src.training.train_esrs_catboost.train_esrs_catboost_model`, `src.training.parallel_cohort_trainer.run_parallel_cohort_training`
- **Run:** `python scripts/train_all_pipeline.py`  or  `TRAIN_ALL_CAMERA_505.bat`

### `scripts/train_demo_model.py`
- **Purpose:** Lightweight demo trainer — trains a tiny foundation model on synthetic windows (few epochs) so `local_user/demo_user/model/` exists before jury.
- **Run:** `python scripts/train_demo_model.py`

---

## Hardware Diagnostics

### `scripts/scan_ports.py`
- **Purpose:** Lists COM ports via `serial.tools.list_ports.comports()` (same helper as `src/ingestion/serial_stream.py:list_available_com_ports`). Used to confirm AD8232 on COM3 / CSI on COM4.
- **Run:** `python scripts/scan_ports.py`

### `scripts/inspect_usb_devices.py`
- **Purpose:** Verbose USB enumeration — device, description, HWID, VID/PID, driver — to debug CP210x / CH340 issues.
- **Run:** `python scripts/inspect_usb_devices.py`

### `scripts/diagnose_arduino_com.py`
- **Purpose:** Targeted Arduino/ESP32 check — opens COM port, reads lines, classifies framing (raw ADC vs `ECG:`, JSON, CSV) using same parser `SerialEcgReader._parse_line`.
- **Run:** `python scripts/diagnose_arduino_com.py --port COM3`

### `scripts/test_hardware_connection.py`
- **Purpose:** Unified hardware smoke-test — checks `GET /api/com_ports`, `GET /api/wifi/status`, and live `SerialEcgReader` samples; reports ONLINE vs SIMULATOR.
- **Run:** `python scripts/test_hardware_connection.py`

### `scripts/test_live_samples.py`
- **Purpose:** Pulls `GET /api/session/current` telemetry snapshot and prints HR/RR/snore/anomaly to console.
- **Run:** `python scripts/test_live_samples.py`

### `scripts/desktop_ecg_plotter.py`
- **Purpose:** Tkinter 60 FPS oscilloscope — desktop mirror of `life-mobile/components/EcgOscilloscope.tsx`. Subscribes to `ws://localhost:8000/ws/live` or reads serial directly; same path triggered by `GET /api/launch-ecg-studio`.
- **Run:** `python scripts/desktop_ecg_plotter.py`  (also `start_ecg_studio.bat`)

---

## Verification & Benchmarks

### `scripts/verify_demos.py`
- **Purpose:** Pre-demo checklist — hits `/api/status`, `/api/com_ports`, `/api/wifi/status`, `/api/ai/status`, `/api/benchmarks/run` and verifies score thresholds.
- **Run:** `python scripts/verify_demos.py`

### `scripts/test_dsp_and_models.py`
- **Purpose:** Offline DSP/model unit test — feeds synthetic 30-s ECG through `EcgDspProcessor`, `AudioDspProcessor`, `LifeMultimodalTransformer`, asserts HRV/RoPE/token shapes.
- **Run:** `python scripts/test_dsp_and_models.py`

### `scripts/evaluate_clinical_test_patients.py`
- **Purpose:** Cohort accuracy audit — generates synthetic patient profiles → `CatBoostCohortClassifier.predict_cohort()` → confusion matrix vs ground-truth cohort.
- **Run:** `python scripts/evaluate_clinical_test_patients.py`

### `scripts/run_advanced_stress_tests.py`
- **Purpose:** Stress suite — rapid scenario switches (apnea/arrhythmia/leads_off), high-rate WebSocket load, DB concurrent writes.
- **Run:** `python scripts/run_advanced_stress_tests.py`

---

## Driver / Installer

### `scripts/install_cp210x_driver.py`
- **Purpose:** Automates CP210x USB-to-UART driver install (downloads official SiLabs installer, silent `/S`).
- **Run:** `python scripts/install_cp210x_driver.py`  (admin needed — see `install_driver_admin.bat`)

### `scripts/get_cp210x_exe.py`
- **Purpose:** Downloader helper — fetches `CP210x_Universal_Windows_Driver.zip` / `OllamaSetup.exe` via `urllib.request.urlretrieve` to `%TEMP%`.
- **Run:** `python scripts/get_cp210x_exe.py`

---

## System Utilities / Git

### `scripts/find_locking_process.py`
- **Purpose:** Windows helper — finds which process holds `life_signals.db` lock (uses `psutil` / `handle.exe` equivalent) so DB WAL can be cleared.
- **Run:** `python scripts/find_locking_process.py`

### `scripts/fetch_fatn_repo.py`
- **Purpose:** Fetcher for external FaTN dataset repo (if configured) — clones/pulls reference datasets for `src/datasets/*`.
- **Run:** `python scripts/fetch_fatn_repo.py`

### `scripts/push_now.py` / `scripts/publish_github.py` / `scripts/init_and_push.py`
- **Purpose:** Git helpers — `init_and_push` inits repo + first commit, `push_now` does `git add/commit/push`, `publish_github` uses `gh` CLI / API to create remote repo. Mirrors `push_to_github.bat`.
- **Run:** `python scripts/push_now.py`  /  `python scripts/publish_github.py`  /  `python scripts/init_and_push.py`

### `scripts/__pycache__/` and `scripts/test_temp.db`
- **Purpose:** Generated artifacts — not source; ignore. `test_temp.db` is a disposable SQLite file for local DSP tests.

---

## Root-level launchers (not in scripts/ but referenced)

- `START_CAMERA_505.bat` / `start.bat` — entry launcher (backend + frontend + Ollama check).
- `start_ecg_studio.bat` — runs `python scripts/desktop_ecg_plotter.py` in new console.
- `TRAIN_ALL_CAMERA_505.bat` / `train_all.bat` — wrapper around `python scripts/train_all_pipeline.py`.
- `install_driver.bat` / `install_driver_admin.bat` — wrapper around `scripts/install_cp210x_driver.py` with elevation.
