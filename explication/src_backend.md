# src/backend & src/storage & src/training & src/datasets — API, Persistence, Training

---

## `src/backend/config.py` (21 lines)
- **Purpose:** Single source of truth for paths/ports/sampling constants.
- **Exports:** `BASE_DIR` (project root), `DATA_DIR` (`data/`), `DB_PATH` (`data/life_signals.db`), `STATIC_UI_DIR` (`ui/`), `HOST 0.0.0.0`, `PORT 8000`, `ECG_SAMPLING_RATE 250`, `AUDIO_SAMPLING_RATE 16000`, `POWERLINE_FREQ 50.0` (Romania), `WINDOW_SECONDS 30.0`.
- **Run:** `python -c "import src.backend.config; print(src.backend.config.DB_PATH)"`

---

## `src/backend/app.py` — FastAPI Gateway & WebSocket Server (828 lines)

### Purpose
The single HTTP+WebSocket entrypoint for the whole platform: REST session/audio/quiz/baseline/training/ai endpoints + high-rate `ws://…/ws/live` telemetry broadcast. Creates `LifeDatabase`, `StreamManager`, `ContinualLearningEngine` singletons and wires `lifespan` auto-session.

### Lifespan
`lifespan()` on startup probes `list_available_com_ports()` → if `COM3` present `source_type=serial` else `synthetic`, `mode=dual`, calls `stream_manager.start_session(user_id="demo_user", ...)` so UI has data immediately before any POST.

### REST — core
- `GET /api/status` — `{status, session_active, current_session, source_type, mode, available_com_ports}`.
- `GET /api/com_ports` (also duplicate `GET /api/com-ports` alias) — `{ports:[device], details:[{device,description,hwid}]}`.
- `GET /api/wifi/status` — socket probe on `0.0.0.0:3334` (3333 is listener, so probe 3334 avoids conflict) → `{wifi_available, esp32_detected, udp_port, message}`.
- `POST /api/session/start {user_id, mode, source_type, com_port, baud_rate}` → `SessionCreate` → `stream_manager.start_session`.
- `POST /api/session/stop` — closes session, collects tokens/anomalies, synthesizes sleep stages (HR>85/anomaly>0.4→awake, RMSSD>45&HR<65→deep, else rem/light), builds `summary` (fallback defaults if no tokens), computes `calc_stability=100−risk*0.9`, calls `ContinualLearningEngine.adapt_after_session` + `UserFoundationModelManager.fine_tune_on_session` (real windows → `resp[64],motion[48],audio[128]` or `insufficient_windows`), returns `{status, summary, respiratory_stability_score, estimated_ahi, ahi_classification, sleep_stages, suspected_events, adapted_user_baseline, foundation_model_fine_tuning, ai_diagnostic_synthesis}`.
- `GET /api/session/current` — `{is_running, session, latest_telemetry, latest_token, hrv_metrics, baseline}` (polled by `scripts/test_live_samples.py`).
- `POST /api/scenario {scenario}` — switches `SimulationScenario` (healthy_rest/apnea/arrhythmia/cough/snoring/leads_off).
- `POST /api/audio/chunk` (legacy) / `POST /api/audio/upload_chunk {samples/pcm}` / `POST /api/audio/upload_file {samples/preset,duration_sec}` — ingests phone mic PCM → `audio_dsp.push_audio_chunk` + `push_external_audio`; file endpoint synthesizes preset presets (snoring harmonics 110/220/330 Hz, cough bursts at 1.2/2.8/4.0 s, normal pink envelope) then chunk-feeds and classifies.
- `GET /api/network_info` — LAN IPs + `mobile_url http://{primary_ip}:6767` + `qr_pairing_code LIFE-XXX`.
- `GET/POST /api/user/*` — profile, `model_status/{user_id}` (exists/size/catboost/sessions/theta), `trajectory/{user_id}`, `initialize_baseline`.
- `GET /api/adaptive/*` — `cohorts`, `thresholds?cohort=`, `response_curve`, `POST custom_cohort`.
- `GET/POST /api/training/*` — `train_catboost_esrs` (10k rows MultiClass Softmax → `foundation_models/`), `esrs_metrics`, `run_parallel` (Soft-F1 multi-core), `benchmark_results`.
- `GET /api/benchmarks/run`, `GET /api/quiz/personas + POST /api/quiz/evaluate` (CatBoost), `GET /api/session/history`, `/api/baseline` & `reset`.

### REST — AI
- `POST /api/ai/report {summary, estimated_ahi, respiratory_stability_score, sleep_stages, user_profile}` → `ollama_engine.generate_sleep_report` streaming `mdl or fallback` → `{status:ok/fallback, ai_report, model_used}`. Fallback always returns populated dict.
- `GET /api/ai/status` → `{ollama_installed, ollama_running, available_model, status:ready/unavailable}`.

### WebSocket
- `@app.websocket("/ws/live")` alias `/ws/session` → `websocket_live_stream()` — accepts, pushes per-client `asyncio.Queue(maxsize=50)`, appends to `stream_manager.subscribers`, loop: non-blocking `receive_text` for `{action:change_scenario}`, `await queue.get()` → `send_json(telemetry_payload)`. Disconnect cleanup. Emits ~30–50 fps: `{type:telemetry, source_type, is_simulated, data:TelemetryFrame, mel_column[128], baseline{hr_mean,rmssd_mean,resp_mean}, latest_token}`. Queue drop policy `qsize<20` avoids lag.

### Static
If `STATIC_UI_DIR` exists mounts `/static` and `GET /` → `index.html`.

### Run
```bash
uvicorn src.backend.app:app --host 0.0.0.0 --port 8000 --reload
python scripts/run_server.py
python scripts/start_all.py
curl http://localhost:8000/docs
```

---

## `src/storage/database.py:LifeDatabase` (336 lines)

### Purpose
SQLite with **WAL + NORMAL** for concurrent 50 Hz ingestion. 6 tables + indexes. File `data/life_signals.db` (auto-created). Used by `StreamManager` + all `GET /api/history/*`.

### Schema (from `_init_db:42`)
- `sessions(id PK, user_id, start_time, end_time, mode, source_type, status)` — `create_session`, `close_session`, `get_session`, `list_sessions`.
- `telemetry_chunks(id, session_id FK, start_ts_ms, end_ts_ms, sample_count, raw_data_json)` — batched `TelemetryFrame` list, flushed every 5 s (`save_telemetry_chunk`).
- `window_tokens(id, session_id, window_idx, start_ts_ms, end_ts_ms, mean_hr, sdnn, rmssd, pnn50, lf_hf_ratio, mean_resp_rate, stability_score, reconstruction_error, prediction_error, drift_score, anomaly_score, is_suspect_episode, suspect_reasons JSON, embedding_512 JSON)` — `save_window_token`, `get_window_tokens` (idx `session,window_idx`).
- `anomaly_events(id, session_id, timestamp_ms, event_type, severity HIGH/MEDIUM, duration_sec, description, metrics_snapshot JSON)` — `record_anomaly_event`, `get_session_anomalies`.
- `night_summaries(session_id PK, user_id, date_str, total_duration_minutes, mean/max/min heart, mean_rmssd, mean_resp, apnea_screening_index, total_snoring_minutes, total_cough_count, multimodal_risk_score, risk_level, stability_grade, clinical_disclaimer)` — `save_night_summary`, `get_night_summary`.
- `user_baselines(user_id PK, baseline_hr_mean/std, baseline_rmssd_mean/std, baseline_resp_mean/std, night_count, recent_night_embeddings JSON, last_updated)` — `get_user_baseline` (auto-creates `UserBaselineRecord` defaults 72±8/42±10/15±2), `save_user_baseline` via `ON CONFLICT UPDATE`.

### Run
```bash
python -c "from src.storage.database import LifeDatabase; db=LifeDatabase(':memory:'); print(db.list_sessions())"
sqlite3 data/life_signals.db "SELECT id,status FROM sessions ORDER BY start_time DESC LIMIT 5;"
```

---

## `src/storage/models.py` — Pydantic Schemas (112 lines)
`SessionCreate`, `SessionRecord{id,user_id,start_time,end_time,mode,source_type,status}`, `TelemetryFrame{timestamp_ms,raw_ecg,filtered_ecg,is_r_peak,heart_rate_bpm,rr_interval_ms,leads_off,edr_respiration_val,respiration_rate_rpm,audio_energy_db,snore_probability,cough_probability,respiratory_pause_flag,anomaly_score}`, `WindowToken30s{session_id,window_idx,start/end_ts_ms,mean_hr,sdnn,rmssd,pnn50,lf_hf_ratio,mean_resp_rate,stability_score,reconstruction_error,prediction_error,drift_score,anomaly_score,is_suspect_episode,suspect_reasons,embedding_512[512]}`, `AnomalyEventRecord`, `UserBaselineRecord{baseline_hr_mean 72,std 8,...}`, `NightReportSummary{...risk_level,stability_grade,clinical_disclaimer}`. All `.model_dump()` → JSON over WS/REST.

## `src/storage/duckdb_analytics.py`
- **Purpose:** DuckDB columnar analytics on top of SQLite — fast cohort stats, histogram, trend queries over `window_tokens` for `docs/continual_adaptive_architecture.md`.
- **Run:** `python -c "import src.storage.duckdb_analytics; help(src.storage.duckdb_analytics)"`

---

## `src/training/*`

### `src/training/train_esrs_catboost.py`
- **Purpose:** Trains **CatBoost MultiClass Softmax** on `data/catboost_esrs_dataset.csv` (10k rows) → `foundation_models/catboost_esrs_classifier.cbm` + `catboost_metrics.json` (accuracy/confusion). Triggered by `POST /api/training/train_catboost_esrs` and `scripts/train_all_pipeline.py`.
- **Run:** `python -m src.training.train_esrs_catboost`  or  `curl -X POST http://localhost:8000/api/training/train_catboost_esrs`

### `src/training/parallel_cohort_trainer.py`
- **Purpose:** Multi-core parallel training over **12 cohort baselines** optimizing `DifferentiableSoftF1Loss` (differentiable threshold) → saves `checkpoints/trained_cohorts.json`. Endpoints `POST /api/training/run_parallel?epochs=20` and `GET /api/training/benchmark_results` (lazy-runs 15 epochs if missing).
- **Run:** `curl -X POST "http://localhost:8000/api/training/run_parallel?epochs=20"`

---

## `src/datasets/*` & `src/data/*`

- **`src/datasets/dataset_catalog.py`**, **`bidmc_loader.py`**, **`psg_audio_loader.py`** — PhysioNet dataset registry & loaders (BIDMC PPG/ECG, PSG audio) with caching in `src/data/physionet_cache/dataset_catalog.json`.
- **`src/datasets/benchmark_runner.py:run_life_benchmarks(num_epochs=3)`** — runs DSP/Transformer/Baseline benchmarks; exposed at `GET /api/benchmarks/run`.
- **`src/data/generate_esrs_dataset.py`** — generates synthetic ESRS cohort CSV deterministically (`catboost_info/*` tfevents + metrics derive from it).
- **Run:** `python scripts/test_dsp_and_models.py` (uses synthetic fallback if datasets absent); `curl http://localhost:8000/api/benchmarks/run`
