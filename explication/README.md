# CAMERA 505 — Hartă generală & Flux semnal

> **Repo root:** `C:\Users\cercu\.gemini\antigravity\scratch\camera 505 hackathon`
> **Stack real:** AD8232/ESP32 → `src/ingestion` → `src/dsp` → `src/models` → `src/storage` → `src/backend` (FastAPI :8000) → WebSocket `/ws/live` → `life-mobile` (Next.js :6767) + `scripts/desktop_ecg_plotter.py` (Tk) → `src/ai/ollama_engine.py` → :11434

---

## 1. Hartă proiect (ce există pe disc)

```
camera 505 hackathon/
├── START_CAMERA_505.bat          # launcher 1-click (init_db + start_all.py)
├── scripts/start_camera505_full.bat # variantă cu wait 6s + open browser
├── start.bat / menu.bat / TRAIN_ALL_CAMERA_505.bat
├── firmware/                     # .ino: AD8232, CSI TX/RX, BLE GATT, ESP-NOW
├── cpp/                          # life_db_engine.cpp, life_hardware_interface.cpp
├── src/
│   ├── ingestion/  serial_stream.py, synthetic_generator.py, stream_manager.py, esp32_wifi_stream.py, wifi_csi_stream.py
│   ├── dsp/        ecg_dsp.py, audio_dsp.py
│   ├── models/     transformer_backbone.py, thores_foundation_model.py, adaptive_baseline.py,
│   │               differentiable_adaptive_threshold.py, catboost_cohort_classifier.py, clinical_head.py, continual_learning_engine.py
│   ├── ai/         ollama_engine.py
│   ├── backend/    app.py, config.py
│   ├── storage/    database.py, models.py, duckdb_analytics.py
│   ├── training/   train_esrs_catboost.py, parallel_cohort_trainer.py
│   ├── datasets/   bidmc_loader.py, psg_audio_loader.py, benchmark_runner.py, dataset_catalog.py
│   └── data/       generate_esrs_dataset.py
├── scripts/        ~25 fișiere .py/.bat — vezi explication/scripts/README.md
├── life-mobile/    Next.js 16 / React 19 (app/, components/, lib/)
├── data/           life_signals.db (WAL), catboost_esrs_dataset.csv, user_baselines/*.json
├── foundation_models/ catboost_esrs_classifier.cbm, respiratory_foundation_512.pt, cohort_baselines_12.json
├── local_user/{user}/model/  per-user checkpoint-uri
└── explication/    documentație (acest folder)
```

Detalii per modul:
- `explication/src_ingestion.md` — `src/ingestion/*`
- `explication/src_dsp.md` — `src/dsp/*`
- `explication/src_models.md` — `src/models/*`
- `explication/src_ai.md` — `src/ai/*`
- `explication/src_backend.md` — `src/backend/*` + `src/storage/*` + `src/training/*` + `src/datasets/*`
- `explication/life_mobile.md` — `life-mobile/app/*` + `life-mobile/components/*`
- `explication/scripts/README.md` — tabel complet `scripts/*`

---

## 2. Diagrama flux semnal (50 Hz → 30s → WS → UI → Ollama)

```
┌─────────────────┐  COM3 115200 / UDP :3333  ┌──────────────────────┐
│ HARDWARE        ├──────────────────────────►│  StreamManager        │
│ AD8232 (ADC     │  "ECG:2048,BPM:72" / JSON │  src/ingestion/       │
│  0..4095)       │  serial_stream.py:110-176 │  stream_manager.py:93 │
│ ESP32 ECG (WiFi)│  esp32_wifi_stream.py     │  _stream_loop @20ms   │
│ TX Beacon ESP-NOW│  wifi_csi_stream.py: CSI │  5× upsample 50→250Hz │
└─────────────────┘  921600 CSI               │  (198,224)            │
                                              └──────┬───────────────┘
                                                     │ ecg_val + audio_chunk
                                              ┌──────▼───────────────┐
                                              │ DSP                   │
                                              │ ecg_dsp.py:102-188   │
                                              │ notch 50Hz Q30 →     │
                                              │ Butter 0.5-40Hz →    │
                                              │ Pan-Tompkins → HR/RR │
                                              │ HRV (SDNN/RMSSD/...) │
                                              │ EDR 6-30 RPM         │
                                              │ audio_dsp.py:50-140  │
                                              │ Mel 128, 512 FFT     │
                                              │ snore 80-500Hz       │
                                              └──────┬───────────────┘
                                                     │ 7500 ECG + 480k audio / 30s
                                              ┌──────▼───────────────┐
                                              │ TRANSFORMER 512-D    │
                                              │ transformer_        │
                                              │ backbone.py:141-244  │
                                              │ 60 ECG tokens + 60   │
                                              │ audio tokens + CLS   │
                                              │ + RoPE → 3 layer →  │
                                              │ window_embedding 512 │
                                              │ aux: resp/snore heads│
                                              └──────┬───────────────┘
                                                     │
                                              ┌──────▼───────────────┐
                                              │ ADAPTIVE BASELINE    │
                                              │ adaptive_baseline.py │
                                              │ 4 metrici: stability │
                                              │ recon/pred/drift →   │
                                              │ composite →          │
                                              │ is_suspect_episode   │
                                              └──────┬───────────────┘
                                                     │
                                              ┌──────▼───────────────┐
                                              │ STORAGE (SQLite WAL) │
                                              │ database.py:41-154   │
                                              │ sessions, telemetry_ │
                                              │ chunks, window_tokens│
                                              │ anomaly_events,      │
                                              │ night_summaries,     │
                                              │ user_baselines       │
                                              └──────┬───────────────┘
                                                     │ 30s token → anomaly_events
                                              ┌──────▼───────────────┐
                                              │ CLINICAL HEAD        │
                                              │ clinical_head.py:38  │
                                              │ estimate_multimodal_ │
                                              │ risk_score → AHI     │
                                              │ risk 0-100 LOW/ELEV/ │
                                              │ HIGH, stability grade│
                                              └──────┬───────────────┘
                                                     │ WebSocket broadcast
                                              ┌──────▼───────────────┐
                                              │ BACKEND WS /ws/live  │
                                              │ app.py:791-828       │
                                              │ stream_manager:514-  │
                                              │ _broadcast_telemetry │
                                              │ + POST /ai/report    │
                                              └──────┬───────────────┘
                                                     │
                              ┌──────────────────────┼──────────────────────┐
                              ▼                      ▼                      ▼
                    life-mobile/:6767      desktop_ecg_plotter.py    Ollama :11434
                    EcgOscilloscope        Tk 60 FPS + FFT           ollama_engine.py:140
                    MelWaterfall           500 samples 10s           generate_sleep_report
                    RppgCameraCard         Pan-Tompkins live         alert_explanations
                    ActigraphyCard
                    EcgStudioOverlay        ┌─────────────────┐
                    MicrophoneAudioStreamer │ WHY IT FIRED    │
                                            │ top 3 alert_   │
                                            │ events în prompt│
                                            │ → narrative +  │
                                            │ alert_explanations│
                                            └─────────────────┘
```

**Calea CSI paralelă (WiFi radar):** `firmware/camera505_beacon_tx.ino` (ESP-NOW 100 Hz ch6) → `firmware/camera505_radar_rx.ino` (CSI 52 subcarriers `t,rssi,len,I;Q;` @921600) → `src/ingestion/wifi_csi_stream.py` / `esp32_wifi_stream.py:WiFiCSIBreathDetector` (fereastră 150 frame-uri, varianță + Savitzky-Golay → RPM 8-30) → injectat ca `respiration_rpm, motion_energy` în telemetrie.

---

## 3. Cum rulezi

### 3.1 One-shot Windows (recomandat juriu)
```bat
START_CAMERA_505.bat
:: face: python scripts\init_db.py  → python scripts\start_all.py
:: start_all.py: backend :8000 + frontend :6767 + ollama probe + auto-open browser
:: alternativa:
scripts\start_camera505_full.bat  :: wait 6s apoi open http://localhost:6767
menu.bat                          :: wrapper peste scripts\menu_trainer.py
```

### 3.2 Manual (3 terminale)
```bash
pip install -r requirements.txt          # fastapi, uvicorn, torch, pyserial, scipy, catboost, duckdb, wfdb
ollama serve & ollama pull llama3.2     # opțional — src/ai/ollama_engine.py:103 tolerează missing

# terminal 1 — backend
uvicorn src.backend.app:app --host 0.0.0.0 --port 8000 --reload
# sau
python scripts/run_server.py             # src/backend/config.py: HOST/PORT
# sau orchestrator complet
python scripts/start_all.py              # lifecycle auto COM3→serial else synthetic

# terminal 2 — frontend
cd life-mobile && npm install && npm run dev   # package.json:7 -> next dev --turbo -p 6767

# terminal 3 — oscilloscop desktop (opțional)
python scripts/desktop_ecg_plotter.py
# sau trigger HTTP
curl http://localhost:8000/api/launch-ecg-studio
```

### 3.3 Harta servicii & porturi

| Serviciu | URL | Cod sursă |
|---|---|---|
| FastAPI | http://localhost:8000 | `src/backend/app.py:60` |
| Swagger | http://localhost:8000/docs | FastAPI auto |
| Life-Mobile | http://localhost:6767 | `life-mobile/package.json:7` |
| Ollama | http://localhost:11434 | `src/ai/ollama_engine.py:15` |
| ESP32 ECG UDP | 0.0.0.0:3333 | `src/ingestion/esp32_wifi_stream.py` |
| CSI serial | COM4 @921600 | `src/ingestion/wifi_csi_stream.py` |
| ECG serial | COM3 @115200 | `src/ingestion/serial_stream.py:42` |

Lifespan (`app.py:40-55`): la boot scanează `list_available_com_ports()` → dacă găsește COM3 pornește `source=serial` altfel `synthetic`.

---

## 4. Cele 9 demo-uri (script juriu, 40s–6min fiecare)

| # | Demo | Unde în UI | Ce arată tehnic | Script relevant |
|---|---|---|---|---|
| 1 | **Onboarding quiz** | `/` → `/quiz` | STOP-BANG + 9 câmpuri → `POST /api/quiz/evaluate` → `catboost_cohort_classifier.py:154` alege 1/12 cohorte → `continual_learning_engine:37` inițializează `theta/tau` (206k h registry) | `scripts/verify_demos.py` (verifică 7 scenarii distincte) |
| 2 | **`/demo/live` jury autoplay** | `/demo/live` | 40s, 5 faze (boot 0-4s → live 4-14s → apnea 14-20s bradycardie 54 BPM → AI inference 20-34s → report 34-40s), generator local PQRST, split-screen cohort priors Healthy vs OSA, REPLAY offline-safe fără backend | `life-mobile/app/demo/live/page.tsx:14-18` |
| 3 | **Dashboard live** | `/dashboard` | Osciloscop 50 Hz (`EcgOscilloscope.tsx:17`), sensor honesty chip (SENSOR ONLINE vs SIMULATOR), cohort banner, last-night snapshot AHI/stability | `scripts/desktop_ecg_plotter.py` (oglinda desktop) |
| 4 | **Night START** | `/dashboard/night` idle → START | `POST /api/session/start` (serial/synthetic/wifi) + `POST /api/scenario` (healthy_rest/apnea/arrhythmia/cough/snoring/leads_off) + `POST /api/audio/upload_file` preset → WS 50 Hz → electrode quality bar 0-100, Mel waterfall + sync line | `scripts/test_live_samples.py`, `diagnose_arduino_com.py` |
| 5 | **Phone-as-sensor** | carduri în night active | `RppgCameraCard` (fingertip red-channel @10 Hz, MA bandpass 0.7-3.5 Hz, BPM + Δ vs AD8232) + `ActigraphyCard` (DeviceMotion \|a\| varianță /30s → STILL/RESTLESS/ACTIVE) | `scripts/test_hardware_connection.py` (validare multi-protocol) |
| 6 | **Mic streaming** | `MicrophoneAudioStreamer` | live 16 kHz → `audio_dsp.py:50` Mel 128 + snore 80-500Hz + cough transient → snore spikes pe waterfall + LIVE DETECTION LOG corelat (pause+bradycardia 3s window) | `scripts/scan_ports.py` (pre-check COM) |
| 7 | **END NIGHT → scoring** | POST `/api/session/stop` | scoring terminal animat (Pan-Tompkins/RoPE/CatBoost/AHI) în timp ce rulează inferența reală: `_generate_night_summary` + `compute_acoustic_analytics` → `estimate_multimodal_risk_score` → adapt baseline | `scripts/evaluate_clinical_test_patients.py`, `run_advanced_stress_tests.py` |
| 8 | **Report** | night state=report | stability, AHI, **acoustic indices** (SBI events/hr, cough count, noise↔HR r), narrative Ollama + **WHY IT FIRED** (top 3 alerts → `alert_explanations`), mood forecast, **EXPORT PDF** (A4 monochrome print window + `@media print` în `globals.css`) | `scripts/train_demo_model.py` (antrenare fallback) |
| 9 | **History** | `/dashboard/history` | AHI trend chart, **3-night forecast** (least-squares pe stability), session logs, **FEDERATED footer** (`GET /api/federated/cohort_stats` — doar cohort keys + avg theta) + `EcgStudioOverlay` replay 50 Hz | `scripts/fetch_fatn_repo.py` (opțional), `run_advanced_stress_tests.py` |

---

## 5. Text pentru fiecare slide (pitch 5-7 min)

**Slide 1 — Titlu:** *CAMERA 505 — Signals That Can Shape Our World* / Subtitlu: contact-free + contact ECG + audio ambiental → inteligență multimodală pentru somn. Stack pe slide: ESP32/AD8232 → FastAPI :8000 → Next.js :6767 → Ollama llama3.2. Notă jos: `START_CAMERA_505.bat` one-shot.

**Slide 2 — Problema:** Apneea nediagnosticată (>80% cazuri), PSG scump, purtabile zgomotoase, praguri fixe nu țin cont de cohortă (atlet vs senior COPD). Soluția noastră: semnale brute 50 Hz + DSP medical + transformer 512-D + baseline personalizat per utilizator.

**Slide 3 — Arhitectură (diagrama de mai sus):** Subliniază: Hardware → StreamManager (`stream_manager.py:193` loop 20ms, 5× upsample) → DSP (notch + Butterworth + Pan-Tompkins) → Transformer RoPE 10 pași (`transformer_backbone.py`) → Adaptive Baseline (4 metrici) → SQLite WAL → WS → UI + Ollama. A doua cale: WiFi CSI radar (fără contact).

**Slide 4 — Ingestion (de ce 50 Hz):** COM3 115200 parsează 5 formate (`serial_stream.py:110` — ECG: val, JSON, CSV, raw), WiFi UDP JSON, synthetic cu 8 scenarii (healthy, apnea ciclul 40s/20s/10s, arrhythmia, cough 6s, snoring, leads_off, breathing_exercise 6 RPM, stress_test 15s). StreamManager emite 5 sample-uri DSP per frame ca să umple fereastra 7500.

**Slide 5 — DSP:** ECG: `ecg_dsp.py:102` notch 50 Hz Q30 → Butter 0.5-40 Hz → Pan-Tompkins (derivative 5pct `2x[n]+x[n-1]-x[n-3]-2x[n-4]/8` → square → MWI 150ms → SPKI/NPKI adaptive) → RR 300-2000ms → HR EMA 0.7/0.3 + HRV Welch LF/HF + EDR (QRS amplitude + RSA). Audio: `audio_dsp.py:50` STFT 512 hop 160 → Mel 128 dB → snore 80-500Hz ratio >3.5 + cough Δ>12dB.

**Slide 6 — Modele:** Transformer `LifeMultimodalTransformer` 60 ECG tokens (Conv1d stride 5×5×5) + 60 audio tokens (Conv2d → AdaptiveAvgPool 1×60) + CLS + RoPE 512-D + 3 layere MHSA 8 heads. Al doilea backbone `thores_foundation_model.py` (resp/motion/audio 512-D, 4 SSL losses). Adaptive: 12 cohorte `differentiable_adaptive_threshold.py:112` (theta/tau/weights), CatBoost 9 feature-uri → top3 cohorte, ClinicalHead AHI (rule 60% + neural 40% MLP 512→128→32→1), Continual EMA alpha 0.95.

**Slide 7 — Backend:** `app.py` 25+ endpointuri (status/com_ports/wifi/status, session/start+stop, scenario, audio/upload_file+chunk, ai/report, federated/cohort_stats, quiz/evaluate, adaptive/response_curve, training/*, WS /ws/live). DB `database.py:41` 6 tabele WAL/NORMAL + 2 indexuri. Broadcast WS coadă 20, drop dacă plin.

**Slide 8 — Mobile UI:** `life-mobile/app/page.tsx` redirect logic (fără user→/login, first_time→/quiz, altfel /dashboard). `night/page.tsx` state machine idle→active→scoring→report, correlate pause+bradycardia 3s + vibrate. Componente: EcgOscilloscope (canvas HiDPI, autoscale EMA, leads_off roșu), MelWaterfall (32 benzi, sync line 50Hz), RppgCameraCard (10 Hz, Δ BPM), ActigraphyCard (30s varianță, watchdog 4s), EcgStudioOverlay (overlay full-screen + FFT), MicrophoneAudioStreamer (16kHz chunk upload).

**Slide 9 — AI / Ollama:** `ollama_engine.py:140` generate_sleep_report — prompt cu HR/HRV/resp/stability/AHI/stages/cohort + top 3 alert_events → cere explicație cauzală per alert. Model pref `llama3.2` temp 0.85 top_p 0.92 repeat 1.15. Fallback `_fallback_report` hash MD5 determinist (narratives/insights variate, `alert_explanations` rule-based). `ensure_ollama_ready` tolerează binar lipsă dacă :11434 deja up.

**Slide 10 — Demo live:** Arată `/demo/live` 40s pe proiector (offline-safe), apoi treci pe `/dashboard/night` cu hardware real sau Simulator+apnea, pornește mic, arată rPPG + actigraphy, END NIGHT → arată scoring + report cu WHY IT FIRED + PDF.

**Slide 11 — Validare:** `evaluate_clinical_test_patients.py` (PhysioNet A01-C03, 100 phenotipuri, ESRS 2k holdout), `run_advanced_stress_tests.py` 20 teste (electrode disconnect, RoPE norm, BERT 40%, InfoNCE, gradient explosion, posture, latency p50/p95, checkpoint size). `verify_demos.py` distincție 7 demo-uri pe HR/leads/acoustic.

**Slide 12 — Ce urmează / Întrebări:** Roadmap: CSI vital signs multi-persoană, EDR vs bandă toracică gold-standard, federated learning real (nu doar stats). QR pairing ` /api/network_info` → mobile_url. Invită juriul să apese START NIGHT.

---

## 6. Convenții & capcane (de știut la demo)

- **Leads-off nu se falsifică:** `stream_manager.py:210` → `leads_off=True` când coada serial e goală; UI arată NO SIGNAL, nu 2048 (`ecg_dsp.py:140` returnează hr 0). `EcgStudioOverlay.tsx:380` + `night/page.tsx:380` dezactivează fallback simulator pentru `leads_off`.
- **Lock e RLock:** `stream_manager.py:75` permite `start_session` să cheme `stop_session` în lifespan fără deadlock.
- **Ollama fără binar:** `ollama_engine.py:114` verifică `is_ollama_running()` înainte de `is_ollama_installed()` — suficient dacă serviciul deja rulează.
- **5× upsample nu e opțional:** fără el fereastra de 7500 la 250 Hz nu se umple (`stream_manager.py:198,224`).

