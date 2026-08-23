# Backend — `src/backend/*` + `src/storage/*`

FastAPI gateway-ul leagă StreamManager, DB, WS și AI. Totul pe :8000.

---

## 1. `src/backend/app.py` — 870 linii, toate rutele

### 1.1 Lifespan & globale (`app.py:32-66`)
- `db = LifeDatabase(DB_PATH)` + `stream_manager = StreamManager(db)` + `continual_engine = ContinualLearningEngine()` (`:32-36`).
- `lifespan:40-58` — la startup scanează `list_available_com_ports()` → dacă `COM3` există alege `source=serial` altfel `synthetic`, `start_session(user_id="demo_user", mode="dual", source_type, com_port)`; la shutdown `stop_session()`.
- `app = FastAPI(title="LIFE...", version="2.0.0", lifespan=lifespan)` (`:61-66`), CORS `allow_origins=["*"]` (`:69-75`).

### 1.2 REST — status & surse

| Metodă | Rută | Funcție | Ce face |
|---|---|---|---|
| GET | `/api/status` | `get_system_status:80` | `{status, session_active, current_session, source_type, mode, available_com_ports}` |
| GET | `/api/com_ports` | `get_com_ports:93` | `{ports:[device], details:raw}` din `serial_stream` |
| GET | `/api/com-ports` | alias `854` | legacy, aceleași date |
| GET | `/api/wifi/status` | `get_wifi_status:104` | probe bind UDP `0.0.0.0:3334` (main e 3333) → `{wifi_available, esp32_detected, udp_port, message}` |
| GET | `/api/network_info` | `get_network_info:407` | `socket.getaddrinfo` + fallback `8.8.8.8:80` → `{primary_ip, all_ips, mobile_url:6767, backend_url:8000, qr_pairing_code:"LIFE-XXX"}` |
| GET | `/api/ai/status` | `get_ai_status:288` | `is_ollama_installed/running/get_available_model` |

### 1.3 REST — sesiuni

| Metodă | Rută | Detalii |
|---|---|---|
| POST | `/api/session/start` | `start_monitoring_session:133` body `SessionCreate{user_id,mode,source_type,com_port,baud_rate}` → `stream_manager.start_session` → `{status:"started", session}` |
| POST | `/api/session/stop` | `stop_monitoring_session:146` — vedetă: generează raport night complet (vezi §1.4) |
| GET | `/api/session/current` | `get_current_session_info:317` → `{is_running, session, latest_telemetry, latest_token, hrv_metrics, baseline}` |
| GET | `/api/session/history` | `get_session_history:302` cu `?user_id&limit` |
| GET | `/api/history/sessions` | `list_past_sessions:357` → `db.list_sessions(limit)` |
| GET | `/api/history/tokens/{session_id}` | `get_session_tokens:363` → `db.get_window_tokens` |
| GET | `/api/history/anomalies/{session_id}` | `get_session_anomalies:369` → `db.get_session_anomalies` |
| GET | `/api/history/summary/{session_id}` | `get_session_night_summary:376` → `db.get_night_summary` 404 dacă lipsă |
| POST | `/api/scenario` | `set_scenario:330` body `{scenario}` → `SimulationScenario(enum)` + `stream_manager.set_simulation_scenario`; 400 dacă invalid |

### 1.4 `POST /api/session/stop` în detaliu (`app.py:146-256`)
1. Salvează `active_session_id/user_id`, `summary=stream_manager.stop_session()` + `anomalies=db.get_session_anomalies` + `tokens=db.get_window_tokens` (`:149-155`).
2. **Sleep stages** (`:157-173`): `awake=t.anomaly>0.4||hr>85`, `deep=rmssd>45 && hr<65`, `rem=30<=rmssd<=45 && anomaly<0.25`, rest light; apoi normalizează la 100% clamp-uri 5/15/40/18.
3. **Summary fallback** dacă DB gol (`:175-190`): `6.8min, HR73.5, RMSSD38.4, Resp15.1, AHI2.4, ...`.
4. `calc_stability = max(50, 100 - risk_score*0.9)`, `ahi_status` Normal/Mild/Moderate (`:193-195`).
5. **Continual adapt** (`:198-207`): `continual_engine.adapt_after_session(user_id, mins, hr, resp, rmssd, stability, ahi, #anomalies)`.
6. **Foundation fine-tune** (`:210-227`): `UserFoundationModelManager(user_id)`; construiește `session_windows` din tokens (`resp=mean_resp_rate, motion=drift_score, audio=anomaly_score` — 64/48/128), `fine_tune_on_session(3 epoci)` dacă ≥4 windows else `insufficient_windows`.
7. **Acoustic analytics** (`:230`): `stream_manager.compute_acoustic_analytics()` → `{snore_burden_index, cough_count, avg_noise_db, noise_hr_correlation}`.
8. Returnează `report_payload:232-254` cu 13 chei + `ai_diagnostic_synthesis` text.

### 1.5 Audio

| Metodă | Rută | Funcție |
|---|---|---|
| POST | `/api/audio/chunk` | `receive_microphone_chunk:384` `{pcm:[]}` → `stream_manager.push_external_audio` |
| POST | `/api/audio/upload_chunk` | `upload_audio_chunk:694` alias `{samples/pcm}` → `audio_dsp.push_audio_chunk` + `push_external_audio` |
| POST | `/api/audio/upload_file` | `upload_audio_file:708` — preset `snoring/cough/normal` sintetizează 5s @16k (snoring 110+220+330 Hz envelope 0.3Hz; cough bursts la 1.2/2.8/4.0s), sau raw `samples`; chunk 3200 (200ms) prin `audio_dsp` + `push_external_audio`; return `{avg_snore, max_cough, classification, acoustic_verdict}` |

### 1.6 AI & Quiz

| Metodă | Rută |
|---|---|
| POST | `/api/ai/report` | `generate_ai_report:259` — `ensure_ollama_ready()` + `generate_sleep_report(data,user_profile,model)`; fallback json la eroare |
| GET | `/api/quiz/personas` | `get_demo_personas:441` → `DEMO_PERSONAS` din `health_quiz_cohort` |
| POST | `/api/quiz/evaluate` | `evaluate_quiz:447` — `CatBoostCohortClassifier(userName).predict_cohort` + `continual_engine.initialize_user_baseline` → `{matchedCohort{cohortKey, cohortName, apneaRiskPrior, thresholdOffsetTheta, temperatureTau, expectedHr/Resp}, catboost_details}` |
| GET | `/api/user/model_status/{user_id}` | `get_user_model_status:484` — verif `respiratory_foundation_model.pt` + `catboost_classifier.cbm` size KB + `total_sessions/cumulative_hours/theta` |
| GET | `/api/user/trajectory/{user_id}` | `get_user_learning_trajectory:633` → `continual_engine.get_trajectory` |
| POST | `/api/user/initialize_baseline` | `initialize_user_baseline_endpoint:649` |
| GET | `/api/federated/cohort_stats` | `get_federated_cohort_stats:659` — vezi §3 |

### 1.7 Adaptive / Training

| Rută | Funcție |
|---|---|
| GET `/api/adaptive/cohorts` | `list_all_cohort_baselines:511` → `COHORT_PROFILES` (12, 206318 h) |
| GET `/api/adaptive/thresholds?cohort=` | `get_adaptive_thresholds:522` → `threshold_offset/temperature/weights/typical_hr/resp` |
| GET `/api/adaptive/response_curve?cohort&theta_override&tau_override` | `get_soft_sigmoid_response_curve:539` — `P=1/(1+exp(-(score-theta)/tau))` 40 pct |
| POST `/api/adaptive/custom_cohort` | `create_or_update_custom_cohort:561` — scrie în `COHORT_PROFILES` |
| POST `/api/training/train_catboost_esrs` | `train_catboost_esrs_endpoint:580` |
| GET `/api/training/esrs_metrics` | `get_esrs_metrics_endpoint:594` → `foundation_models/catboost_metrics.json` |
| POST `/api/training/run_parallel` | `trigger_parallel_training:608` `?epochs=20` → `run_parallel_cohort_training` |
| GET `/api/training/benchmark_results` | `get_latest_benchmark_results:619` |
| GET `/api/benchmarks/run` | `run_automated_benchmarks:394` → `run_life_benchmarks(3)` |
| GET `/api/launch-ecg-studio` | `launch_ecg_studio:831` — `Popen([sys.executable, scripts/desktop_ecg_plotter.py], CREATE_NEW_CONSOLE)` |

### 1.8 WebSocket (`app.py:791-828`)
- `@app.websocket("/ws/live")` + alias `/ws/session`. `await accept`, `queue=asyncio.Queue(50)`, `stream_manager.subscribers.append(queue)`.
- Loop: `try receive_text timeout 0.001s` → dacă `action=="change_scenario"` → `set_simulation_scenario`; `await queue.get()` → `send_json`. Pe `WebSocketDisconnect` curăță `subscribers.remove`.

### 1.9 Static
- Dacă `STATIC_UI_DIR` există → `mount("/static", StaticFiles)` (`:865`), `GET /` → `index.html` (`:868`).

---

## 2. `src/storage/database.py` — 6 tabele WAL

**Conexiune (`database.py:33-39`):** `sqlite3.connect(check_same_thread=False)`, `row_factory=Row`, `PRAGMA journal_mode=WAL` + `synchronous=NORMAL`.

**Schema (`_init_db:41-154`):**

| Tabel | Coloane cheie | Index |
|---|---|---|
| `sessions` | `id PK, user_id, start_time, end_time, mode, source_type, status` | — |
| `telemetry_chunks` | `id, session_id FK, start_ts_ms, end_ts_ms, sample_count, raw_data_json` | — |
| `window_tokens` | `id, session_id FK, window_idx, start/end_ts, mean_hr, sdnn, rmssd, pnn50, lf_hf_ratio, mean_resp_rate, stability, reconstruction_error, prediction_error, drift_score, anomaly_score, is_suspect_episode, suspect_reasons(JSON), embedding_512(JSON)` | `idx_tokens_session(session_id,window_idx)` |
| `anomaly_events` | `id, session_id FK, timestamp_ms, event_type, severity, duration_sec, description, metrics_snapshot(JSON)` | `idx_anomalies_session(session_id,timestamp_ms)` |
| `night_summaries` | `session_id PK FK, user_id, date_str, duration, mean/min/max_hr, mean_rmssd, mean_resp, apnea_screening_index, snoring_minutes, cough_count, risk_score, risk_level, stability_grade, disclaimer` | — |
| `user_baselines` | `user_id PK, hr_mean/std, rmssd_mean/std, resp_mean/std, night_count, recent_night_embeddings(JSON), last_updated` | — |

**API:**
- `create_session/close_session/get_session/list_sessions` (`:157-186`).
- `save_telemetry_chunk(session_id, frames:TelemetryFrame[])` (`:189-200`): `json.dumps([f.model_dump()])`.
- `save_window_token/get_window_tokens` (`:203-234`): `is_suspect 0/1`, `suspect_reasons/embedding` JSON.
- `record_anomaly_event/get_session_anomalies` (`:237-257`).
- `get_user_baseline/save_user_baseline` (`:260-309`): upsert `ON CONFLICT(user_id) DO UPDATE`, creează default `UserBaselineRecord` dacă absent.
- `save_night_summary/get_night_summary` (`:312-336`): `INSERT OR REPLACE`.

**Modele Pydantic (`src/storage/models.py`):** `SessionRecord, TelemetryFrame, WindowToken30s, AnomalyEventRecord, UserBaselineRecord, NightReportSummary`. DB le serializează via `model_dump()`.

---

## 3. Broadcast & federated (detalii fina)

- **`StreamManager._broadcast_telemetry` (`stream_manager.py:514`)** chemat la 50 Hz; payload include `mel_column` pentru `MelWaterfall` + `baseline` (hr/rmssd/resp mean) pentru radar + `latest_token` pentru AHI live.
- **`GET /api/federated/cohort_stats` (`app.py:659-691`):** scanează `local_user/*/model/personal_history.json` (creat de `continual_learning_engine`), agregă `{cohorts: {cohort_key:{users:int, avg_theta:round(mean(theta_offset),4)}}}` — fără date fiziologice brute. Fallback `{"cohorts":{}}` la eroare.

---

## 4. Alte module legate

- `src/storage/duckdb_analytics.py` — query-uri OLAP pe chunks (opțional, nu expus direct).
- `src/training/*` — apelate via `/api/training/*` (vezi `src_ingestion.md` pentru pipeline master).
- `src/datasets/*` — loaders BIDMC/PSG + `benchmark_runner.py` pentru `/api/benchmarks/run`.

