# src/dsp — Digital Signal Processing Engines

> ECG + Audio DSP that shapes every vital before the model sees it.

---

## `src/dsp/__init__.py`
- Re-exports `EcgDspProcessor`, `PanTompkinsDetector`, `calculate_hrv_metrics`, `AudioDspProcessor`, `create_mel_filterbank`, `extract_mel_spectrogram`.

---

## `src/dsp/ecg_dsp.py` — ECG Pipeline (302 lines)

### Purpose
Complete real-time ECG chain at `fs=250 Hz`: **Notch 50 Hz (Q=30, iirnotch)** → **Butterworth bandpass 0.5–40 Hz (order 2)** → **Pan-Tompkins streaming QRS** → **HR / RR / HRV / EDR**. Mirrors math in `docs/ARCHITECTURE.md:18`.

### Inputs / Outputs
- **In:** `process_sample(raw_val:float 0..4095, timestamp_ms:int, leads_off:bool) -> Dict{filtered,is_r_peak,hr,rr_ms,edr_val,edr_resp_rate}`
  - `leads_off=True` → returns `{filtered:0, hr:0, edr:0}` (never infers HR on detached leads — signal honesty).
  - Filters use `scipy.signal.lfilter` with persistent `zi` state (sample-by-sample, not block).
- **Out buffers:** `recent_raw/filtered: deque(10 s)`, `r_peak_timestamps: deque(100)`, `rr_intervals: deque(100)`, `qrs_amplitudes: deque(100)` for EDR.

### Key functions / classes
- **`PanTompkinsDetector(fs=250)`** (`ecg_dsp:17`): 5-point derivative `y[n]=(2x[n]+x[n-1]-x[n-3]-2x[n-4])/8` → square → MWI `W=0.150*fs` → dual adaptive `SPKI=0.125*Peak+0.875*SPKI`, `NPKI` similar, `Threshold_I1=NPKI+0.25*(SPKI-NPKI)`, refractory 200 ms, 0.5 s init stabilization.
- **`EcgDspProcessor.__init__(fs, powerline_freq=50.0)`** — designs `iirnotch(50/nyquist,Q=30)` + `butter(2,[0.5/nyq,40/nyq],bandpass)` via `scipy.signal`.
- **`process_sample()`** — notch → bandpass → detector → RR clamping 300–2000 ms (30–200 BPM), exponential HR smoothing `0.7*old+0.3*instant`, QRS amplitude save.
- **`_update_edr()`** — QRS Amplitude Modulation (RAM) `mod=amp-mean`, RSA via zero-crossings on `diff(RR)` → `resp_rpm=60/(avg_crossing_interval*2)` clamped 6–36, EWMA `0.8*old+0.2*new`.
- **`calculate_hrv_metrics(rr: List[float]) -> {mean_hr,sdnn,rmssd,pnn50,lf_hf_ratio,sd1,sd2}`** (`ecg_dsp:219`): time-domain `SDNN/RMSSD/pNN50`, Poincaré `SD1=sqrt(RMSSD²/2), SD2=sqrt(2*SDNN²−RMSSD²/2)`, freq-domain Welch on 4 Hz-resampled tachogram → `LF 0.04–0.15 / HF 0.15–0.40 → LF/HF` (fallback 1.5 if <16 RR).
- **`extract_edr_signal(ecg, fs)`** — offline `butter(3,[0.1,0.5],bandpass)` via `filtfilt` for 6–30 RPM isolation.
- **`get_hrv_snapshot()`** — live wrapper.

### Dependencies
`numpy`, `scipy.signal` (iirnotch, butter, lfilter, welch, detrend).

### Demo appearance
Every HR BPM, HRV RMSSD, respiration RPM, and filtered ECG trace on `life-mobile/app/dashboard` and `dashboard/night` active tiles comes from this module (via `StreamManager._stream_loop`). Night report `mean_rmssd_hrv` and `mean_respiratory_rate` are aggregated `get_hrv_snapshot()` windows. Leads-off → all HR tiles show `—`.

### Run
```bash
python scripts/test_dsp_and_models.py          # offline block test
python -c "from src.dsp.ecg_dsp import EcgDspProcessor; p=EcgDspProcessor(); print(p.process_sample(2048,0))"
```

---

## `src/dsp/audio_dsp.py` — Audio Pipeline (163 lines)

### Purpose
Ambient smartphone/mic audio at `fs=16000 Hz` → **128-band Mel spectrogram (50–8000 Hz)** + **3 acoustic detectors**: snore resonance (80–500 Hz), cough explosive transient, respiratory pause. Feeds `StreamManager` and `Transformer AudioPatchEncoder`.

### Inputs / Outputs
- **In:** `push_audio_chunk(pcm_chunk: np.ndarray float32/int16) -> Dict{energy_db, snore_probability, cough_probability, respiratory_pause, mel_column:List[128]}`
  - Normalizes int16 `/32768`, maintains `audio_buffer: deque(5 s)`, `recent_mel_frames: deque(300)`.
- **Out:** `energy_db = 20*log10(RMS)`, dB-adapted `baseline_noise_floor_db` (alpha 0.95/0.999), per-frame `mel_column` clipped `[-80dB→0..1]`, snore/cough probabilities `0..1`.

### Key functions / classes
- **`hz_to_mel / mel_to_hz`** — `2595*log10(1+f/700)`.
- **`create_mel_filterbank(n_mels=128, n_fft=512, fs=16000, fmin=50,fmax=8000) -> [128,257]`** — triangular filters via `floor((n_fft+1)*hz/fs)` (`audio_dsp:25`).
- **`AudioDspProcessor(fs=16000,n_mels=128,n_fft=512,hop=160)`** — 10 ms hop, `hanning(512)`, `recent_rms: deque(50)`, `baseline_noise_floor_db=-55`.
  - **STFT:** `windowed=rfft(slice*hanning) → spec=|fft|²` → `mel_spec=fb·spec` → `mel_db=10*log10(mel_spec)` → `mel_column=(mel_db+80)/80`.
  - **Snore:** bins `5:35` (80–500 Hz) ratio `low/high`; trigger `energy > floor+6dB && ratio>3.5` → `clip((ratio-3.5)/10 + (energy-floor)/30)`.
  - **Cough:** `delta_energy = energy - rms[-5] >12 dB` + broadband `mean(mel 30:100)>1e-3` + `energy>-35dB` → `clip(delta/20)`.
  - **Pause:** `energy < floor+2dB`.
- **`extract_mel_spectrogram(pcm, fs, hop) -> [128,n_frames]`** (`audio_dsp:143`) — offline matrix for 30-s windows (`480k` samples → ~3000 frames @ hop 160) used by `StreamManager._process_30s_window`.

### Dependencies
`numpy`, `scipy.signal`, `collections.deque`.

### Demo appearance
Acoustic snore % and pause-driven apnea flag on `dashboard/night` active tiles; `MelWaterfall` 80-column waterfall (`life-mobile/components/MelWaterfall.tsx`) draws `mel_column` streamed at 50 Hz alongside ECG, with note about time/frequency correlation. Preset `POST /api/audio/upload_file {preset:snoring}` synthesizes 80–500 Hz rumble + harmonics so Mel visibly lights up low bins; cough preset shows broadband explosion.

### Run
```bash
python scripts/test_dsp_and_models.py
python -c "import numpy as np; from src.dsp.audio_dsp import AudioDspProcessor; a=AudioDspProcessor(); print(a.push_audio_chunk(np.random.randn(320).astype('float32')*0.01))"
```

---

## Cross-DSP contract with `StreamManager`

```
StreamManager._stream_loop (50 Hz, dt=0.02):
  ecg_res = EcgDspProcessor.process_sample(x5 upsampled @4 ms)
  audio_res = AudioDspProcessor.push_audio_chunk(chunk 320 @16kHz)
  frame = TelemetryFrame(heart_rate_bpm=ecg_res.hr, respiration_rate_rpm=ecg_res.edr_resp_rate,
                         snore_probability=audio_res.snore_probability, ...)
  -- every 7500 ECG samples (≈30 s) --
  mel_matrix = extract_mel_spectrogram(window_audio_buffer[:480000])
  → transformer
```

Sampling constants canonical in `src/backend/config.py:18`: `ECG_SAMPLING_RATE=250`, `AUDIO_SAMPLING_RATE=16000`, `WINDOW_SECONDS=30.0`.
