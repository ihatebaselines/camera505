# CAMERA 505 — Explication Overview

> **Theme:** *Signals that can shape our world* — contact-free & contact ECG + ambient audio → adaptive multimodal intelligence for sleep.
> **Stack:** ESP32/AD8232 → FastAPI (`src/backend/app.py` on `:8000`) → Next.js Life-Mobile (`life-mobile/` on `:6767`) + desktop Tk plotter → Ollama LLM.

---

## 1. Project Map

```
camera 505 hackathon/
├── firmware/                  # ESP32/Arduino sketches (AD8232, CSI TX/RX, BLE GATT, ESP-NOW)
├── cpp/                       # C++ USB/serial helpers (life_db_engine.cpp, life_hardware_interface.cpp)
├── src/
│   ├── ingestion/             # Serial / WiFi / synthetic ingestion → StreamManager
│   ├── dsp/                   # ECG + Audio DSP (Pan-Tompkins, HRV, EDR, Mel 128)
│   ├── models/                # Transformer 512-D, CatBoost cohort, adaptive thresholds
│   ├── ai/                    # Ollama local LLM report engine
│   ├── backend/               # FastAPI gateway + WebSocket /ws/live
│   ├── storage/               # SQLite + Pydantic models + DuckDB analytics
│   ├── training/              # CatBoost ESRS + parallel cohort trainer
│   ├── datasets/              # BIDMC, PSG, benchmark runners
│   └── data/                  # ESRS generator
├── scripts/                   # 25+ orchestration/diagnostics/training helpers
├── life-mobile/               # Next.js 16 / React 19 mobile dashboard (app/, components/, lib/)
├── ui/                        # Legacy static frontend (served at /static if present)
├── data/                      # life_signals.db (WAL), catboost_esrs_dataset.csv, user_baselines/
├── foundation_models/         # catboost_esrs_classifier.cbm, respiratory_foundation_512.pt
├── local_user/                # per-user fine-tuned models (local_user/{user}/model/)
├── docs/                      # ARCHITECTURE.md, HACKATHON_PITCH.md
└── explication/               # ← this folder (reading guide, no code)
```

Detailed per-area docs:
- `explication/scripts/README.md` — every `scripts/*.py` and `*.bat`
- `explication/src_ingestion.md` — `src/ingestion/*`
- `explication/src_dsp.md` — `src/dsp/*`
- `explication/src_models.md` — `src/models/*`
- `explication/src_ai.md` — `src/ai/*`
- `explication/src_backend.md` — `src/backend/*` + `src/storage/*` + `src/training/*` + `src/datasets/*`
- `explication/life_mobile.md` — `life-mobile/app/*` + `life-mobile/components/*`

---

## 2. Architecture Diagram

From `README_SIGNALS.md:30` — canonical diagram:

```
 AD8232 ECG ──COM3 115200──┐
 ESP32 ECG  ──UDP :3333────┤──▶ FastAPI  src/backend/app.py  ──▶ /ws/live WebSocket
 ESP32 TX Beacon ─ESP-NOW──┤    StreamManager ─ EcgDsp ─ AudioDsp ─ Transformer ─ CatBoost ─ Ollama
 ESP32 RX CSI   ──COM4 921600─────────────────────┘                              │
                                                                                 ▼
                                                            Next.js  life-mobile/:6767  +  ui/:3000
```

DSP detail (`docs/ARCHITECTURE.md`): Notch 50 Hz Q=30 → Butterworth 0.5–40 Hz → Pan-Tompkins (derivative → square → MWI 150 ms → dual adaptive threshold SPKI/NPKI) → HRV (SDNN/RMSSD/pNN50/LF-HF/Poincaré) → EDR (QRS amplitude modulation + RSA).

Foundation model (`src/models/transformer_backbone.py:141`): 7500 ECG pts → 1-D CNN (stride 125) → 60×512 tokens; Mel 128×~3000 → 2-D CNN → 60×512 tokens; + CLS + RoPE → 3× Transformer layers → 512-D window embedding (+ aux heads for resp/snore). Four self-supervised losses: masked reconstruction, cross-modal InfoNCE, future dynamics, temporal consistency.

---

## 3. Signal Flow (end-to-end, 50 Hz)

```
firmware/arduino_uno_camera505_ecg.ino  (ADC 0..4095 → "ECG:2048,BPM:72" or raw int)
        │ serial 115200  /  WiFi UDP JSON {"ecg":2048,"hr":74}
        ▼
src/ingestion/serial_stream.py:SerialEcgReader  /  src/ingestion/esp32_wifi_stream.py
        │ callback(ecg_val, leads_off, ts_ms) — 5× upsample per 20 ms frame (see stream_manager:198)
        ▼
src/ingestion/stream_manager.py:StreamManager._stream_loop  (50 Hz, 20 ms tick)
        ├── src/dsp/ecg_dsp.py:EcgDspProcessor (notch+bp → Pan-Tompkins → HR/EDR)
        ├── src/dsp/audio_dsp.py:AudioDspProcessor (Mel 128 + snore 80–500 Hz + cough transient)
        │         ↑ src/ingestion/synthetic_generator.py or push_external_audio() from phone mic
        ▼
30-s window full (7500 ECG + 480k audio) every 30 s
        ▼
src/models/transformer_backbone.py:LifeMultimodalTransformer → 512-D embedding
        ▼
src/models/adaptive_baseline.py:PersonalizedAdaptiveBaseline → 4-quadrant anomaly radar
        (stability, recon error, pred error, drift) → composite score → is_suspect_episode
        ▼
src/storage/database.py:LifeDatabase (telemetry_chunks, window_tokens, anomaly_events, night_summaries)
        ▼
src/models/clinical_head.py:estimate_multimodal_risk_score → AHI, risk 0–100, LOW/ELEVATED/HIGH
        ▼
WebSocket  /ws/live  →  life-mobile/components/EcgOscilloscope.tsx + MelWaterfall.tsx
        │ on POST /api/session/stop → src/models/continual_learning_engine.py adapts baseline
        │                         + src/models/thores_foundation_model.py fine-tunes local_user/{user}/model/
        ▼
POST /api/ai/report → src/ai/ollama_engine.py → Ollama :11434  llama3.2/mistral → JSON {narrative, insights, recovery_score}
        ▼
life-mobile/app/dashboard/night/page.tsx  scoring terminal → report (AHI, hypnogram, sleep stages)
```

**WiFi CSI parallel path:** `firmware/camera505_beacon_tx.ino` (ESP-NOW 100 Hz, ch 6) → RF chest bounce → `firmware/camera505_radar_rx.ino` (promiscuous CSI 52 subcarriers, I/Q → `t,rssi,len,I0;Q0;...` @921600) → `src/ingestion/wifi_csi_stream.py` / `esp32_wifi_stream.py:WiFiCSIBreathDetector` (150-frame window, variance + Savitzky-Golay → RPM 8–30) → injected as `respiration_rpm, motion_energy` into `StreamManager` telemetry.

---

## 4. How to Run

### One-shot (Windows)
```bat
START_CAMERA_505.bat        :: backend :8000 + frontend checks + Ollama probe (see README_SIGNALS.md:365)
:: or
menu.bat                    :: Python menu_trainer wrapper
```

### Manual
```bash
pip install -r requirements.txt          # fastapi, uvicorn, torch, pyserial, scipy, catboost, duckdb, wfdb
ollama serve & ollama pull llama3.2     # optional, for AI reports (src/ai/ollama_engine.py:103)

# backend (lifespan auto-starts synthetic serial COM3 if present)
uvicorn src.backend.app:app --host 0.0.0.0 --port 8000 --reload
# or orchestrator
python scripts/start_all.py
# or helper
python scripts/run_server.py

# mobile frontend
cd life-mobile && npm install && npm run dev   # http://localhost:6767 (package.json:6 dev => next dev -p 6767)
# legacy static ui (if present) auto-mounted at /static -> http://localhost:8000/

# desktop oscilloscope
python scripts/desktop_ecg_plotter.py
# or HTTP trigger
curl http://localhost:8000/api/launch-ecg-studio
```

### Service map
| Service | URL | Code |
|---|---|---|
| FastAPI | http://localhost:8000 | `src/backend/app.py` |
| Swagger | http://localhost:8000/docs | FastAPI |
| Life-Mobile | http://localhost:6767 | `life-mobile/app/` |
| Ollama | http://localhost:11434 | `src/ai/ollama_engine.py` |
| ESP32 ECG UDP | `0.0.0.0:3333` | `src/ingestion/esp32_wifi_stream.py` |
| CSI serial | COM4 @921600 | `src/ingestion/wifi_csi_stream.py` |
| ECG serial | COM3 @115200 | `src/ingestion/serial_stream.py` |

### Key API (from `src/backend/app.py`)
```
GET  /api/status  /api/com_ports  /api/wifi/status  /api/network_info
POST /api/session/start  /api/session/stop  /api/scenario  /api/audio/upload_file
GET  /api/session/current  /api/baseline  /api/history/*  /api/benchmarks/run
POST /api/ai/report  /api/quiz/evaluate  /api/adaptive/*  /api/training/*
WS   /ws/live  (/ws/session alias)
```

---

## 5. Demo Script (for jury)

1. **Onboarding quiz** `life-mobile/app/quiz/page.tsx` → `POST /api/quiz/evaluate` → `src/models/catboost_cohort_classifier.py` picks 1/12 cohorts → `continual_learning_engine.initialize_user_baseline()` → calibrates `threshold_offset/temperature` (12 cohorts, 206k h registry).
2. **Live night** `life-mobile/app/dashboard/night/page.tsx` START → `POST /api/session/start` (synthetic/serial/wifi) + optional `POST /api/scenario` (healthy_rest/apnea/arrhythmia/cough/snoring/leads_off) + `POST /api/audio/upload_file` {preset:snoring/cough} → WebSocket 50 Hz draws `EcgOscilloscope` + `MelWaterfall` + correlated alerts (pause+bradycardia).
3. **Stop → scoring terminal** `POST /api/session/stop` computes `NightReportSummary` → `estimate_multimodal_risk_score()` → AHI + risk/stability → `ContinualLearningEngine.adapt_after_session` + `UserFoundationModelManager.fine_tune_on_session` (local_user/).
4. **AI report** `POST /api/ai/report` → `ollama_engine.generate_sleep_report()` (llama3.2 streaming, temp 0.85) or deterministic `_fallback_report()` hashed on metrics → narrative/insights/recovery_score.
5. **History** `life-mobile/app/dashboard/history` shows localStorage + SQLite; `EcgStudioOverlay` replays 50 Hz trace in-page (mirrors `scripts/desktop_ecg_plotter.py`).

---

## 6. Data & Models at Rest

- `data/life_signals.db` (WAL+NORMAL) — 6 tables (`src/storage/database.py:45`): sessions, telemetry_chunks (JSON batches, flushed every 5 s), window_tokens (512-D JSON), anomaly_events, night_summaries, user_baselines (see `src/storage/models.py`).
- `data/catboost_esrs_dataset.csv` — 10k ESRS rows used by `src/training/train_esrs_catboost.py`.
- `foundation_models/catboost_esrs_classifier.cbm` + `catboost_metrics.json` + `respiratory_foundation_512.pt` (from `src/training/*`).
- `local_user/{user}/model/` — per-user `respiratory_foundation_model.pt` + `catboost_classifier.cbm` managed by `src/models/thores_foundation_model.py`.
- `data/user_baselines/{user}_baseline.json` — EMA learning trajectory (50 entries) (`src/models/continual_learning_engine.py:24`).

---

## 7. Conventions & Pitfalls

- **Leads-off never faked:** `StreamManager._stream_loop:188` returns `leads_off=True` when serial queue empty — UI shows NO SIGNAL (not 2048 baseline). Simulator fallback disabled for `leads_off` demo.
- **Lock is RLock:** `StreamManager.lock` prevents deadlock when `start_session` stops an auto-started session inside lifespan (`src/ingestion/stream_manager.py:75`).
- **Ollama path:** `ensure_ollama_ready()` tolerates missing binary if service already on `:11434` (`src/ai/ollama_engine.py:114`).
- **5× ECG upsample:** each 20 ms transport frame emits 5 DSP samples to fill the 7500-sample window (`stream_manager.py:198`).
