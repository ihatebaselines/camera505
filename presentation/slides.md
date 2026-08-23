# CAMERA 505 — Technical Deck (16 slides)

> Monochrome, print-safe, all numbers real. Mirrored 1:1 in `deck.html`.
> Theme: *Signals that can shape our world* · Tagline: *WE DON'T SUPPORT 67*

---

## Slide 1 — TITLE

- **CAMERA 505** — Sleep Intelligence Platform
- Theme: *Signals that can shape our world*
- One line: **the cheapest full cardiorespiratory signal on Earth** — a $5 ECG front-end + the phone you already own
- Stack: ESP32 + AD8232 · FastAPI + SQLite · RoPE 512-D transformer · CatBoost 12 cohorts · Ollama llama3.2 · Next.js
- On-screen numbers: **9** demo scenarios · **12** clinical cohorts · **206,318 h** calibration registry
- *WE DON'T SUPPORT 67*

---

## Slide 2 — PROBLEM: the night is a blind spot

- **1 BILLION** people snore worldwide — the loudest symptom of a silent disease
- **80%** of obstructive sleep apnea (OSA) cases are **undiagnosed**
- Gold standard PSG = hospital lab, **20+ wires**, one night, **thousands of euros**, months of waiting
- Undiagnosed OSA drives hypertension, atrial fibrillation, stroke, 2–3× traffic accident risk
- Consumer wearables: PPG wrist proxies — no electrical cardiac signal, population averages

---

## Slide 3 — OUR SIGNAL: cheapest full cardiorespiratory view

- **AD8232 Lead-II ECG** (~$5, 3 gel electrodes, ESP32 on COM3 @ 115200): R-peaks, RR intervals, arrhythmia morphology — the *electrical truth* of the heart
- **Phone microphone** (already on the nightstand, 16 kHz): respiration, snore band **80–500 Hz**, cough bursts — the *acoustic truth* of breathing
- Fusion rule: apnea flagged **only when both modalities agree** — ECG bradycardia + acoustic silence → post-apnea gasp
- Full bill of materials **< $15**. No cloud. No subscription sensor.

---

## Slide 4 — ARCHITECTURE: one Python process, end to end

```
┌ SENSORS ──────────────────────────────┐
│ AD8232 LEAD-II ECG · COM3 @115200     │
│ PHONE MIC · 16 kHz chunks             │
│ ESP32 CSI RADAR · COM4 @921600        │
└───────────────┬───────────────────────┘
                ▼
┌ PIPELINE — FASTAPI :8000 (one process) ────────────┐
│ DSP:  notch 50 Hz → BP 0.5–40 Hz →                 │
│       Pan-Tompkins → HRV · EDR · Mel-128           │
│ AI:   RoPE 512-D transformer (60+60 tokens / 30 s) │
│ ML:   CatBoost 12 cohorts (θ0, τ0 priors)          │
│ DB:   SQLite life_signals.db · WAL · 6 tables      │
└───────────────┬─────────────────────┬──────────────┘
                ▼ WS /ws/live @ 50 Hz ▼ :11434
      NEXT.JS life-mobile :6767  OLLAMA llama3.2
```

- Every 30 s window = **7,500 ECG samples @ 250 Hz + Mel-128 audio** → one 512-D embedding
- Telemetry pushed at **50 Hz** over WebSocket; SQLite persists everything locally

---

## Slide 5 — DSP: classic algorithms do the heavy lifting

- Clean-up chain: **notch 50 Hz (Q=30)** → **Butterworth 0.5–40 Hz** → baseline-wander removal
- **Pan-Tompkins** QRS detector: derivative → square → 150 ms moving-window integration → dual adaptive thresholds (SPKI/NPKI)
- HRV per window: **SDNN, RMSSD, pNN50**, LF/HF, Poincaré SD1/SD2 — autonomic tone from the same 3 electrodes
- **EDR** (ECG-Derived Respiration): breathing rate from QRS amplitude modulation + respiratory sinus arrhythmia — **no chest strap**
- Audio: Mel-128 spectrogram; snore energy **80–500 Hz** (120/240/360 Hz harmonics); cough = broadband transients

---

## Slide 6 — AI STACK: multimodal RoPE transformer

- 30 s ECG (7,500 pts) → 1D-CNN encoder (stride 125) → **60 tokens × 512 D**
- 30 s Mel (128 × ~3000) → 2D-CNN encoder (stride 50) → **60 tokens × 512 D**
- + [CLS] + **RoPE** rotary positional encoding → 3 transformer layers → **one 512-D embedding per 30 s window**
- **4 self-supervised losses**: masked token reconstruction (40% masking), cross-modal **InfoNCE**, future-window prediction, temporal consistency
- Apnea = ECG deceleration + acoustic silence, **confirmed in shared latent space** — verified, not guessed

---

## Slide 7 — CATBOOST: 12 clinical cohorts, 206,318 hours

- 9-question intake quiz → CatBoost classifier → **1 of 12 clinical cohorts** in seconds
- Priors calibrated on a **206,318-hour** registry: **SHHS, MESA, UCDDB, DREAMS, BIDMC, APNEA-ECG, Fantasia**
- Each cohort ships **θ₀ (apnea prior), τ₀ (temporal prior), baseline HR / respiration**:

| Cohort | Risk | θ₀ | HR |
|---|---|---|---|
| Athletic & High HRV (Fantasia) | LOW | 0.22 | 54 |
| Healthy Adult (APNEA-ECG) | LOW | 0.30 | 70 |
| Snoring & Mild Apnea (SHHS) | ELEVATED | 0.38 | 74 |
| Severe OSA Candidate (UCDDB) | HIGH | 0.55 | 80 |

- Trained via `TRAIN_ALL_CAMERA_505.bat` — macro Soft-F1 benchmarked across all 12 cohorts

---

## Slide 8 — PERSONALIZATION: the app learns YOU

- Your baseline is a distribution **N(μ, σ)**, thresholds are **μ ± kσ** — not population cutoffs
- Baseline updates **only when anomaly score < 0.35** — pathology can never become your "new normal"
- After every night: continual engine adapts θ/τ + per-user model fine-tuned into `local_user/{user}/model/`
- **Federated cohort stats** (`/api/federated/cohort_stats`): anonymized counts per cohort — raw signals never leave the device
- **3-night forecast**: least-squares trend over nightly stability scores — getting better or worse?

---

## Slide 9 — PHONE-AS-SENSOR: freemium, zero hardware

- **Bedside microphone mode**: phone on the nightstand → **Snore Burden Index** (snore events/hour, 80–500 Hz band)
- **rPPG**: finger-on-lens pulse in 30 s windows — PPG without buying anything
- **Actigraphy**: 30 s motion windows from the phone IMU — sleep/wake fragmentation proxy
- **Haptic alarm**: `navigator.vibrate` escalation on correlated apnea events — your phone becomes the alarm
- QR pairing: any phone on the Wi-Fi becomes the platform's acoustic sensor

---

## Slide 10 — DEMO MAP: 9 deterministic scenarios

All switchable live via `POST /api/scenario`; every one produces a **different** score, cohort, verdict:

| # | Demo | Scenario | Risk | θ₀ | HR |
|---|---|---|---|---|---|
| 1 | Healthy Rest · APNEA-ECG | healthy_rest | LOW | 0.30 | 70 |
| 2 | Snoring & Mild Apnea · SHHS | snoring_episode | ELEVATED | 0.38 | 74 |
| 3 | Obstructive Apnea · UCDDB | sleep_apnea | HIGH | 0.55 | 80 |
| 4 | Irregular Rhythm · BIDMC | arrhythmia | ELEVATED | 0.42 | 85 |
| 5 | Cough Cluster · PSG Audio | cough_attack | ELEVATED | 0.40 | 76 |
| 6 | Postmenopausal · DREAMS | healthy_rest | ELEVATED | 0.35 | 71 |
| 7 | Electrodes Detached | leads_off | NO SIGNAL | — | 0 |
| 8 | Breathing 6/min · Biofeedback | breathing_exercise | LOW | 0.28 | 65 |
| 9 | Stress Test · Snore+Cough Mix | stress_test | ELEVATED | 0.42 | 88 |

- Demo 7 is the honesty test: leads-off shows **NO SIGNAL** — we never fake a heartbeat

---

## Slide 11 — JURY MODE: 40 seconds, one URL

- `/demo/live` — full clinical narrative, auto-run, **40 s total**:

| Phase | Time | What happens |
|---|---|---|
| BOOT | 0–4 s | COM3 probe @ 115200, DSP armed, 50 Hz lock |
| SIGNAL | 4–14 s | Live ECG oscilloscope + Mel waterfall |
| ANOMALY | 14–20 s | HR → **54 BPM**, respiration → 0, correlated alert |
| AI | 20–34 s | 8 h night: **1,440,000 frames @ 50 Hz, 412,800 beats** |
| REPORT | 34–40 s | AHI **5.0** · 40 events → **MILD APNEA SUSPECT** |

- AHI thresholds: **< 5 normal · 5–15 mild · 15–30 moderate · > 30 severe**
- Deterministic + replayable — jury sees the exact same result every run

---

## Slide 12 — RESULTS: distinct scores per demo

- Jury report: stability **62/100**, hypnogram **Deep 18% · REM 21% · Light 47% · Awake 14%**, mean HR 64 BPM, respiration 11.2 RPM
- OSA demo: bradycardia **54 BPM** → compensatory tachycardia **95 BPM** per apnea cycle; Healthy demo stays LOW at θ₀ = 0.30
- **Snore Burden Index** per session from real acoustic energy — snoring, stress-mix and healthy nights give different SBI values
- Recovery score **0–100** + next-day mood forecast, generated from the night's own metrics
- **9/9 demos** end with different AHI, stability, cohort and report — no canned output

---

## Slide 13 — LOCAL-FIRST & CRAFT

- **Ollama llama3.2** on `:11434` writes the morning narrative — **zero cloud, zero data leaves the room**
- Deterministic fallback report if the LLM is absent — the demo never dies on stage
- SQLite WAL, 6 tables; **60 FPS** desktop studio (Tk + Matplotlib): oscilloscope + live FFT 0–20 Hz
- Next.js brutalist monochrome UI: `#000 / #111 / #222`, JetBrains Mono, tabular-nums — the deck you're watching IS the app
- Honest hardware states only: SIMULATOR MODE · SENSOR ONLINE · NO SIGNAL

---

## Slide 14 — ROADMAP

- **Now (hackathon MVP)**: 9 demos, 12 cohorts, local AI, phone-as-sensor — all running from `START_CAMERA_505.bat`
- **+1 month**: real-night pilots benchmarked against BIDMC / APNEA-ECG PSG corpora (already in repo)
- **+3 months**: WiFi CSI contactless radar productized — ESP-NOW 100 Hz firmware already written
- **+6 months**: federated learning across cohorts; CE marking pathway as a *screening* device (not diagnostic)
- **+12 months**: app stores + SDK; hospital screening pilots; band version

---

## Slide 15 — TEAM & ASK

- **Team CAMERA 505** — one room, full stack: firmware · DSP · ML · backend · UI
- What works today: live hardware ingestion, 50 Hz telemetry, transformer + CatBoost + local LLM, 9 demos
- **Ask 1**: clinical partner for validation nights against real PSG
- **Ask 2**: hardware seed for 50 pilot kits (≈ $15 each)
- **Ask 3**: mentors in regulatory (CE / MDR) for the screening pathway

---

## Slide 16 — TAGLINE

- ***WE DON'T SUPPORT 67***
- Signals that can shape our world — **CAMERA 505**
- (between us: ask us after)
