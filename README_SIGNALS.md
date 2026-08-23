```
 ██████╗ █████╗ ███╗   ███╗███████╗██████╗  █████╗      ███████╗ ██████╗ ███████╗
██╔════╝██╔══██╗████╗ ████║██╔════╝██╔══██╗██╔══██╗     ██╔════╝██╔═████╗██╔════╝
██║     ███████║██╔████╔██║█████╗  ██████╔╝███████║     ███████╗██║██╔██║███████╗
██║     ██╔══██║██║╚██╔╝██║██╔══╝  ██╔══██╗██╔══██║     ╚════██║████╔╝██║╚════██║
╚██████╗██║  ██║██║ ╚═╝ ██║███████╗██║  ██║██║  ██║     ███████║╚██████╔╝███████║
 ╚═════╝╚═╝  ╚═╝╚═╝     ╚═╝╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝     ╚══════╝ ╚═════╝ ╚══════╝
```
> **CAMERA 505** — *Contact-free Adaptive Medical Evaluation & Recording Architecture*  
> Medical-grade wireless sleep sensing platform · *WE DON'T SUPPORT 67* ☕

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Signal Pipeline — Arduino ECG via Serial](#2-signal-pipeline--arduino-ecg-via-serial)
3. [WiFi CSI Radar — Contactless Respiration](#3-wifi-csi-radar--contactless-respiration)
4. [AD8232 ECG Sensor Wiring](#4-ad8232-ecg-sensor-wiring)
5. [3-Electrode Placement Guide](#5-3-electrode-placement-guide)
6. [CatBoost Cohort Classification](#6-catboost-cohort-classification)
7. [Ollama AI Personalised Reports](#7-ollama-ai-personalised-reports)
8. [Catppuccin Mocha Design System](#8-catppuccin-mocha-design-system)
9. [Running CAMERA 505](#9-running-camera-505)

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        CAMERA 505 PLATFORM                              │
│                                                                         │
│  ┌─────────────┐     Serial/UDP      ┌──────────────────────────────┐  │
│  │ AD8232 ECG  │────────COM3────────▶│                              │  │
│  │ (hardware)  │                     │   FastAPI Backend            │  │
│  └─────────────┘                     │   src/backend/app.py         │  │
│                                      │   :8000                      │  │
│  ┌─────────────┐    UDP :3333        │                              │  │
│  │ ESP32 ECG   │────────WiFi────────▶│   StreamManager              │  │
│  │ (wireless)  │                     │   ├─ EcgDspProcessor         │  │
│  └─────────────┘                     │   ├─ AudioDspProcessor       │  │
│                                      │   ├─ Transformer Backbone    │  │
│  ┌─────────────┐  ESP-NOW RF beams   │   ├─ CatBoost Classifier     │  │
│  │ ESP32 TX    │─────────────────┐   │   └─ Ollama Report Gen       │  │
│  │ (Beacon)    │                 │   └──────────────┬───────────────┘  │
│  └─────────────┘                 │                  │ WebSocket        │
│                                  │                  │ /ws/live          │
│  ┌─────────────┐    CSI Serial   │   ┌─────────────▼───────────────┐  │
│  │ ESP32 RX    │◀────────────────┘   │   Next.js Frontend           │  │
│  │ (CSI Radar) │──────COM4──────────▶│   ui/  :3000                 │  │
│  └─────────────┘   921600 baud       │   Catppuccin Mocha UI        │  │
│                                      └─────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Signal Pipeline — Arduino ECG via Serial

```
AD8232 Analog Out
      │  3.3 V biopotential (millivolt-scale)
      ▼
Arduino Uno / ESP32
  firmware/arduino_uno_camera505_ecg.ino
  firmware/esp32_camera505_ecg.ino
      │  115200 baud  COM3
      │  Output: raw ADC integer per line  e.g. "2048\n"
      ▼
src/ingestion/serial_stream.py  →  SerialEcgReader
      │  pyserial readline loop (daemon thread)
      │  Converts ADC → millivolts:  mV = (adc / 4095) * 3.3 - 1.65
      ▼
src/ingestion/stream_manager.py  →  StreamManager._process_ecg_sample()
      │  Accumulates into 30-second window buffer (7500 samples @ 250 Hz)
      ▼
src/dsp/ecg_dsp.py  →  EcgDspProcessor
      │  ├─ Bandpass filter  0.5–40 Hz (Butterworth 4th order)
      │  ├─ Baseline wander removal (median filter)
      │  ├─ Pan-Tompkins R-peak detection
      │  └─ HRV metrics: RMSSD, pNN50, LF/HF ratio
      ▼
src/models/transformer_backbone.py  →  LifeMultimodalTransformer
      │  512-dim embedding per 30-second window
      ▼
src/models/clinical_head.py  →  estimate_multimodal_risk_score()
      ▼
FastAPI WebSocket  /ws/live
      │  JSON frame every ~4 ms: {"ecg": 2.1, "hr": 72, "rmssd": 48, ...}
      ▼
Next.js  ui/
      │  Real-time waveform chart (Recharts)
      └─ Dashboard metrics panel
```

### Serial Frame Format

| Field    | Source                      | Unit          |
|----------|-----------------------------|---------------|
| `ecg`    | ADC converted to mV         | millivolts    |
| `hr`     | R-R interval (Pan-Tompkins) | bpm           |
| `rmssd`  | HRV short-term variability  | ms            |
| `pnn50`  | HRV parasympathetic index   | %             |
| `spo2`   | Estimated (model proxy)     | %             |

---

## 3. WiFi CSI Radar — Contactless Respiration

The WiFi CSI (Channel State Information) subsystem enables **completely
contact-free respiration monitoring** — no electrode, no sensor touching
the patient.

```
┌──────────────────────────────────────────────────────────────────┐
│                    WiFi CSI RF Pipeline                          │
│                                                                  │
│  firmware/camera505_beacon_tx.ino                                │
│  ┌───────────────────────────────────────────┐                   │
│  │  ESP32 TX (Beacon Node)                   │                   │
│  │  • ESP-NOW broadcast on Channel 6         │                   │
│  │  • 100 Hz packet rate (10 ms interval)    │                   │
│  │  • MCS0 LGI PHY rate for max multipath    │                   │
│  └──────────────────────┬────────────────────┘                   │
│                         │ 2.4 GHz RF waves                       │
│                         │ (bounce off patient's chest)           │
│                         ▼                                        │
│  firmware/camera505_radar_rx.ino                                 │
│  ┌───────────────────────────────────────────┐                   │
│  │  ESP32 RX (CSI Node)                      │                   │
│  │  • Promiscuous mode + CSI hardware extractor                  │
│  │  • 52 OFDM subcarrier amplitudes + phases │                   │
│  │  • Filters by paired TX MAC address       │                   │
│  │  • Streams: timestamp,rssi,len,I0;Q0;...  │                   │
│  │  • Baud rate: 921600                      │                   │
│  └──────────────────────┬────────────────────┘                   │
│                         │ Serial COM4 (921600 baud)              │
│                         ▼                                        │
│  src/ingestion/wifi_csi_stream.py                                │
│  ┌───────────────────────────────────────────┐                   │
│  │  WifiCsiPacketParser                      │                   │
│  │  • Splits I/Q bytes → amplitude + phase   │                   │
│  │  • amp = sqrt(I²+Q²), phase = atan2(Q,I)  │                   │
│  └──────────────────────┬────────────────────┘                   │
│                         ▼                                        │
│  src/ingestion/esp32_wifi_stream.py                              │
│  ┌───────────────────────────────────────────┐                   │
│  │  WiFiCSIBreathDetector                    │                   │
│  │  • 150-frame sliding window (7.5 s)       │                   │
│  │  • Variance across 52 subcarriers/frame   │                   │
│  │  • Savitzky-Golay smoothing               │                   │
│  │  • Zero-crossing → RPM (clamp 8–30)       │                   │
│  └──────────────────────┬────────────────────┘                   │
│                         ▼                                        │
│         respiration_rpm, motion_energy                           │
│         injected into StreamManager telemetry                    │
└──────────────────────────────────────────────────────────────────┘
```

### CSI Packet Wire Format

```
<timestamp_ms>,<rssi>,<len>,<I0>;<Q0>;<I1>;<Q1>;...<In>;<Qn>
```

**Example line:**
```
4827361,-62,128,12;-8;15;-3;22;11;...
```

### WiFi ECG over UDP (Alternative to COM3)

```
ESP32 (esp32_camera505_ecg.ino)
    │  WiFi UDP → 0.0.0.0:3333
    │  JSON: {"ecg": 2048, "hr": 74, "ts": 12345}
    ▼
src/ingestion/esp32_wifi_stream.py → ESP32WiFiECGStream
    │  Daemon thread, 2 s socket timeout
    │  Auto-detects ESP32 presence (5 s heartbeat)
    ▼
StreamManager callback (same as serial path)
```

**Check WiFi stream availability:**
```
GET http://localhost:8000/api/wifi/status
→ {"wifi_available": true, "esp32_detected": false, "udp_port": 3333, ...}
```

---

## 4. AD8232 ECG Sensor Wiring

```
AD8232 Module          Arduino Uno / ESP32
──────────────         ──────────────────
  3.3V ─────────────▶  3.3V
  GND  ─────────────▶  GND
  OUTPUT ───────────▶  A0  (analog in)
  LO+  ─────────────▶  D10 (lead-off +)
  LO-  ─────────────▶  D11 (lead-off -)
  SDN  ─────────────▶  D12 (shutdown, active-low)
```

> **⚠️ Power:** Always use 3.3 V — the AD8232 is NOT 5 V tolerant on OUTPUT.  
> **⚠️ Isolation:** In any clinical or demo setting, power the Arduino from a  
> USB power bank (battery), **never** directly from a mains-powered laptop.

---

## 5. 3-Electrode Placement Guide

```
            ┌─────────────────────────────────────┐
            │          Patient (Supine)            │
            │                                     │
            │     🔴 RA                   🟡 LA   │
            │   Right Arm              Left Arm    │
            │  (Right Clavicle)    (Left Clavicle) │
            │                                     │
            │                                     │
            │                                     │
            │                          🟢 RL      │
            │                       Right Leg     │
            │                  (Lower Right Rib)  │
            └─────────────────────────────────────┘
```

| Electrode | Colour | Placement                    | Function              |
|-----------|--------|------------------------------|-----------------------|
| **RA**    | 🔴 Red  | Right clavicle / right arm   | Positive lead         |
| **LA**    | 🟡 Yellow | Left clavicle / left arm  | Negative lead         |
| **RL**    | 🟢 Green | Lower right rib / right leg | Ground / shield       |

**Tips for good signal:**
- Clean skin with alcohol wipe and allow to dry before applying electrodes
- Use pre-gelled disposable snap electrodes (Ag/AgCl)
- Minimise cable slack — coil and clip excess to clothing
- If **LO+** or **LO-** go HIGH, lead-off is detected; firmware suppresses output

---

## 6. CatBoost Cohort Classification

CAMERA 505 uses a **gradient-boosted tree ensemble (CatBoost)** trained on
overnight polysomnography-derived features to classify each 30-second epoch
into one of five cohort archetypes.

```
30-second epoch features (per window):
  ├─ ECG HRV: RMSSD, pNN50, LF power, HF power, LF/HF
  ├─ Respiration: rate (rpm), regularity variance
  ├─ Motion: CSI energy, actigraphy proxy
  ├─ SpO2 proxy (transformer-estimated)
  └─ Circadian: hour-of-night, sleep-cycle index

        ▼ CatBoost predict_proba()

Cohort Label          Description
──────────────────    ────────────────────────────────────────────
  NORMAL_SLEEPER      Healthy restorative sleep architecture
  LIGHT_SLEEPER       Fragmented, shallow sleep; elevated micro-arousals
  SNORER              Upper-airway obstruction; inspiratory effort artifact
  APNEA_RISK          Cyclic hypoxic dip pattern; desaturation events
  HYPERAROUSAL        Elevated sympathetic tone; insomnia phenotype
```

**Training:**
```bash
python scripts/train_catboost.py --epochs 500 --depth 8
# or
TRAIN_ALL_CAMERA_505.bat
```

Checkpoints saved to `checkpoints/catboost_sleep_cohort_*.cbm`

---

## 7. Ollama AI Personalised Reports

At the end of each session, CAMERA 505 queries a **locally-running Ollama**
LLM to generate a personalised clinical narrative report in plain English.

```
Session ends
    │
    ▼
Structured summary assembled:
  • Cohort label + confidence
  • Mean HR, RMSSD, SpO2 proxy
  • Respiration rate (CSI)
  • Apnea event count, duration
  • HRV LF/HF trend over night

    │  HTTP POST → http://localhost:11434/api/generate
    │  Model: llama3 / mistral / gemma2 (configurable)
    ▼
Prompt template (src/models/report_generator.py):
  "You are a sleep physician. Summarise the following overnight
   polysomnography data for the patient in clear, empathetic language..."

    ▼
Streamed Markdown response → FastAPI → WebSocket → UI Report Panel
```

**Configure model:**
```python
# src/backend/config.py
OLLAMA_MODEL = "llama3"          # or "mistral", "gemma2:9b"
OLLAMA_BASE_URL = "http://localhost:11434"
```

**Start Ollama:**
```bash
ollama serve
ollama pull llama3
```

---

## 8. Catppuccin Mocha Design System

The CAMERA 505 frontend (`ui/`) uses the **Catppuccin Mocha** palette — a
warm dark theme optimised for low-light clinical environments and long
overnight monitoring sessions.

```
Base Palette (Mocha)
────────────────────────────────────────────────────
  Base       #1e1e2e   ██  App background
  Mantle     #181825   ██  Secondary background
  Crust      #11111b   ██  Deepest surface
  Surface 0  #313244   ██  Cards, panels
  Surface 1  #45475a   ██  Borders, dividers
  Overlay 1  #7f849c   ██  Muted text
  Text       #cdd6f4   ██  Primary text
  Lavender   #b4befe   ██  Headings, links
  Blue       #89b4fa   ██  ECG waveform trace
  Sapphire   #74c7ec   ██  HRV / secondary metric
  Sky        #89dceb   ██  CSI respiration wave
  Teal       #94e2d5   ██  Normal-state indicators
  Green      #a6e3a1   ██  Good / healthy status
  Yellow     #f9e2af   ██  Warning / attention
  Peach      #fab387   ██  Mild anomaly
  Red        #f38ba8   ██  Critical alert / apnea event
  Maroon     #eba0ac   ██  Elevated risk
  Mauve      #cba6f7   ██  AI / model output accent
  Flamingo   #f2cdcd   ██  HRV stress marker
  Pink       #f5c2e7   ██  SpO2 trace
  Rosewater  #f5e0dc   ██  Tooltip backgrounds
────────────────────────────────────────────────────
```

Tailwind config (`ui/tailwind.config.ts`) maps these as custom colours
under the `ctp-*` prefix (e.g. `bg-ctp-base`, `text-ctp-text`).

---

## 9. Running CAMERA 505

### Quick Start (Windows)

```bat
:: One-shot launcher — starts backend + frontend + Ollama check
START_CAMERA_505.bat
```

### Manual Start

```bash
# 1. Install Python dependencies
pip install -r requirements.txt

# 2. Start Ollama (separate terminal)
ollama serve

# 3. Start all services via Python orchestrator
python scripts/start_all.py

# 4. Or start individually:
#    Backend (FastAPI)
uvicorn src.backend.app:app --host 0.0.0.0 --port 8000 --reload

#    Frontend (Next.js)
cd ui && npm run dev
```

### Service Map

| Service       | URL / Port                     | Description                       |
|---------------|--------------------------------|-----------------------------------|
| FastAPI       | http://localhost:8000          | REST + WebSocket backend          |
| API Docs      | http://localhost:8000/docs     | OpenAPI / Swagger UI              |
| Next.js UI    | http://localhost:3000          | Live dashboard & reports          |
| Ollama        | http://localhost:11434         | Local LLM inference               |
| ESP32 ECG UDP | udp://0.0.0.0:3333             | WiFi ECG stream ingestion         |
| CSI Serial    | COM4 @ 921600                  | WiFi CSI radar (breath detector)  |
| ECG Serial    | COM3 @ 115200                  | Arduino/ESP32 ECG via USB         |

### API Endpoints Quick Reference

```
GET  /api/com_ports          → List available serial ports
GET  /api/wifi/status        → Check ESP32 WiFi stream readiness
POST /api/session/start      → Begin monitoring session
POST /api/session/stop       → End session + generate report
GET  /api/sessions           → Session history
GET  /api/report/{id}        → Fetch AI-generated night report
WS   /ws/live                → Real-time telemetry stream (JSON)
```

### Environment Variables

```env
# .env (project root)
CAMERA505_COM_PORT=COM3
CAMERA505_CSI_COM_PORT=COM4
CAMERA505_ECG_UDP_PORT=3333
CAMERA505_OLLAMA_MODEL=llama3
CAMERA505_DB_PATH=data/camera505.db
```

---

```
  ╔══════════════════════════════════════════════════════╗
  ║   CAMERA 505 · Medical Sleep Platform                ║
  ║   "We Don't Support 67" ☕                           ║
  ║   Built with ESP32 · FastAPI · Next.js · Ollama      ║
  ╚══════════════════════════════════════════════════════╝
```
