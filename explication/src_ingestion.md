# src/ingestion — Signal Ingestion & Stream Management

> All files under `src/ingestion/` — Purpose · Inputs/Outputs · Key functions · Dependencies · Demo · Run.

---

## `src/ingestion/__init__.py`
- **Purpose:** Package marker re-exporting public symbols.
- **Run:** `python -c "import src.ingestion; print(src.ingestion.__all__)"` (if defined)

---

## `src/ingestion/serial_stream.py:SerialEcgReader` (176 lines)
- **Purpose:** USB-serial ingestion for AD8232 via Arduino Uno / ESP32 (`firmware/arduino_uno_camera505_ecg.ino`, `firmware/esp32_camera505_ecg.ino`). Daemon thread with auto-reconnect (3 s), handles 5 framing formats (ADC int, `ECG:2048,BPM:72`, CSV, JSON `{"v":..,"lo":}`, binary), strips banners/lead-off `!`.
- **Inputs:** `port` (default `COM3`), `baud_rate` 115200, `callback(ecg_val, leads_off, ts_ms)`.
- **Outputs:** Parsed tuple `(ecg_val:float 0..4095, leads_off:bool, ts_ms:int)`; ring `recent_samples: deque(maxlen=2000)` consumed by `StreamManager._stream_loop:186`; `list_available_com_ports() -> List[Dict{device,description,hwid}]` used by `GET /api/com_ports`.
- **Key functions:** `list_available_com_ports`, `SerialEcgReader.start/stop/_read_loop/_parse_line` (5 parsers in priority order).
- **Dependencies:** `pyserial`, `threading`, `deque`, `json`, `logging`.
- **Demo:** Hardware LED on dashboard shows SENSOR ONLINE only when `leads_off==False` and `source_type==serial` (`life-mobile/app/dashboard/page.tsx:184`). `leads_off` scenario sets this permanently true → UI shows NO SIGNAL (no fake signal, see `stream_manager:188`).
- **Run:** `python -c "from src.ingestion.serial_stream import list_available_com_ports; print(list_available_com_ports())"`

---

## `src/ingestion/esp32_wifi_stream.py` (ESP32WiFiECGStream + WiFiCSIBreathDetector)
- **Purpose:** Two UDP/CSI WiFi paths:
  1) **ECG over WiFi UDP** — ESP32 `esp32_camera505_ecg.ino` sends JSON `{ecg:2048, hr:74, ts:..}` to `0.0.0.0:3333`; daemon thread with 2 s socket timeout + 5 s heartbeat → auto-detect `esp32_detected` exposed by `GET /api/wifi/status`.
  2) **CSI breath detector** — parses CSI frames `timestamp,rssi,len,I0;Q0;...` from `firmware/camera505_radar_rx.ino` @921600; computes `amp=sqrt(I²+Q²), phase=atan2(Q,I)` via `WifiCsiPacketParser`, then 150-frame (~7.5 s) sliding variance across 52 OFDM subcarriers + Savitzky-Golay → zero-crossing → `respiration_rpm` clamped 8–30 + `motion_energy`.
- **Inputs/Outputs:** UDP datagrams / serial CSI lines → callbacks `on_ecg(ecg_val)` / `on_breath(rpm, energy)` injected into `StreamManager.latest_telemetry` (see `README_SIGNALS.md:146`).
- **Key classes:** `ESP32WiFiECGStream`, `WifiCsiPacketParser`, `WiFiCSIBreathDetector`.
- **Demo:** CSI radar → contact-free respiration appears as `respiration_rate_rpm` on Night active tiles; motion_energy contributes to stability score. WiFi status tile on dashboard.
- **Run:** `python scripts/run_esp32_live.py` (probes both UDP + CSI); or `curl http://localhost:8000/api/wifi/status`

---

## `src/ingestion/wifi_csi_stream.py`
- **Purpose:** Dedicated CSI serial reader (thin wrapper over `esp32_wifi_stream.WiFiCSIBreathDetector` focused on `COM4 @921600`). Splits the comma/semicolon CSI wire format, converts I/Q bytes to amplitude/phase, feeds breath detector.
- **Wire format:** `<timestamp_ms>,<rssi>,<len>,<I0>;<Q0>;<I1>;<Q1>;...` e.g. `4827361,-62,128,12;-8;15;-3;...` (`README_SIGNALS.md:164`).
- **Run:** (opened automatically when `source_type==wifi` or via `scripts/scan_ports.py` to verify COM4)

---

## `src/ingestion/synthetic_generator.py:SyntheticPhysiologicalGenerator` (223 lines)
- **Purpose:** Deterministic simulator — synchronized ECG (P-Q-R-S-T @2048 baseline, RSA ±6 BPM, QRS amplitude modulation `1+0.15*sin(phase_resp)`, baseline wander `80*sin`) + 16 kHz audio (ambient -55 dB, breath airflow, snore 120/240/360 Hz resonance 80–500 Hz, cough broadband bursts) + 6 clinical scenarios. Emulation is the fallback when hardware absent; also used for controlled jury demos.
- **Inputs:** `ecg_fs=250`, `audio_fs=16000`, scenario enum.
- **Outputs:** `generate_step(dt) -> (ecg_raw 0..4095, audio_pcm float32[320], leads_off, meta{target_hr, apnea_active, snore_active, cough_active})`; `generate_sample() -> {ecg, ecg_raw, leads_off, meta}` with normalized `ecg=(raw-2048)/2048`.
- **Key:** `class SimulationScenario` (healthy_rest, sleep_apnea 40s/20s/10s cycle with bradycardia 54→tachy 95 + jitter, snoring_episode, cough_attack every 6 s, arrhythmia ectopic, leads_off); `set_scenario()`, `generate_step()`. Backward alias `SyntheticBiometricGenerator`.
- **Dependencies:** `numpy`, `math`.
- **Demo:** `POST /api/scenario` {scenario:sleep_apnea} in Night idle (`dashboard/night/page.tsx:472`) selects deterministic pathology; `POST /api/audio/upload_file` {preset:snoring/cough} feeds same `AudioDspProcessor` to keep ECG+audio aligned. `dashboard/page.tsx` local fallback also synthesizes same waveform if backend offline & scenario ≠ leads_off.
- **Run:** `python -c "from src.ingestion.synthetic_generator import *; g=SyntheticPhysiologicalGenerator(); g.set_scenario(SimulationScenario.SLEEP_APNEA); print(g.generate_step(0.02))"`

---

## `src/ingestion/stream_manager.py:StreamManager` (437 lines) — Central engine
- **Purpose:** Real-time orchestrator linking ingestion → DSP → transformer → adaptive baseline → SQLite → WebSocket. 50 Hz emission loop (`dt=0.02`, 5 `EcgDspProcessor.process_sample` calls per tick to satisfy 250 Hz / 7500-sample window — `src_ingestion:198`), batches telemetry (flush every 5 s), slices 30-s windows (7500 ECG + 480k audio), runs foundation model, computes 4-quadrant anomaly, persists, broadcasts.
- **Inputs:** `db:LifeDatabase`, `start_session(user_id, mode, source_type, com_port, baud)` → creates `SessionRecord`; `push_external_audio(pcm)` from `POST /api/audio/chunk` (phone mic); `set_simulation_scenario()`.
- **Outputs:** `TelemetryFrame` (raw/filtered ECG, HR, RR, EDR, audio energy/snore/cough/pause, anomaly) → `subscribers: List[asyncio.Queue]` → `/ws/live` payload `{type:telemetry, source_type, data:frame, mel_column, baseline, latest_token}`; `WindowToken30s` per 30 s (512-D JSON); `NightReportSummary` on `stop_session()`; `latest_telemetry/latest_window_token`.
- **Key methods:** `start_session/stop_session` (RLock-safe, resets `EcgDspProcessor/AudioDspProcessor`, handles `serial`/`hardware` aliases), `_stream_loop` (core 50 Hz), `_process_30s_window` (Mel + transformer + `PersonalizedAdaptiveBaseline.compute_window_anomalies` + suspect `AnomalyEventRecord`), `_generate_night_summary` (avg HR/RMSSD/resp/stab/drift → `estimate_multimodal_risk_score` + `add_night_embedding`), `_broadcast_telemetry`.
- **Dependencies:** `torch`, `numpy`, `asyncio`, `threading.RLock`, `src.dsp.*`, `src.models.*`, `src.storage.*`.
- **Demo:** This is the invisible heart — every live number on `life-mobile/app/dashboard/*` comes from `latest_telemetry`. Watch it via `GET /api/session/current` or `scripts/test_live_samples.py`.
- **Run:** (auto-started in `src/backend/app.py:lifespan` as `StreamManager(db)`); manual: `python -c "from src.storage.database import LifeDatabase; from src.ingestion.stream_manager import StreamManager; m=StreamManager(LifeDatabase(':memory:')); s=m.start_session(); print(s)"`

---

## How the four ingestion sources resolve

| `source_type` in `POST /api/session/start` | Actual reader | Dashboard badge |
|---|---|---|
| `synthetic` (default) | `SyntheticPhysiologicalGenerator` | SIMULATOR MODE |
| `serial` / `hardware` (alias) | `SerialEcgReader(COM3)` | SENSOR ONLINE vs NO ECG SIGNAL |
| `wifi` | `ESP32WiFiECGStream` + CSI | WiFi tile / sensor online |
| phone mic | `push_external_audio` → `AudioDspProcessor` | Acoustic % moves |

All converge on the same `_stream_loop` → DSP → transformer pipeline, so demo scenarios are interchangeable for the jury.
