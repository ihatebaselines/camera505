# DSP — `src/dsp/*`

Procesare semnal real, fără ML: filtrare + detecție vârfuri + HRV + audio.

---

## 1. `src/dsp/ecg_dsp.py` — ECG 250 Hz

### 1.1 Filtre (`EcgDspProcessor.__init__` `ecg_dsp.py:102-122`)
- **Notch 50 Hz Q=30:** `signal.iirnotch(w0=powerline/nyquist, Q=30)` (`:111`). `w0 = f0/(fs/2)`. Dacă `w0` în (0,1) folosește `b,a` + `zi` din `lfilter_zi`; altfel passthrough.
- **Bandpass 0.5–40 Hz Butterworth ordin 2:** `signal.butter(2, [0.5/nyq, min(40, fs*0.45)/nyq], btype='bandpass')` (`:118-121`). Highcut limitat la `fs*0.45` ca să nu depășească Nyquist la fs mic.
- Ambele filtre rulează sample-by-sample cu stare `zi` prin `lfilter(b,a,[val],zi=zi)` (`:153-156`) — fără latență de bloc.

### 1.2 Pan-Tompkins (`PanTompkinsDetector` `ecg_dsp.py:17-94`)
Implementare streaming conform literaturii:

1. **Derivative 5pct (`:53-55`):** `y[n]=(2x[n]+x[n-1]-x[n-3]-2x[n-4])/8` pe `deque d_x[5]`.
2. **Square (`:58`):** `y²` — amplifică QRS.
3. **MWI 150ms (`:60-66`):** media glisantă `window=0.15*fs` (=38 la 250 Hz) cu sumă incrementală `mwi_sum`.
4. **Threshold adaptiv dual (`:72-92`):**
   - Inițializare după 0.5s: `SPKI=mwi*2, NPKI=mwi*0.5, thr=NPKI+0.25*(SPKI-NPKI)` (`:72-75`).
   - Refractar 200ms (`:24,78`): `sample_count - last_r > 0.2*fs`.
   - Dacă `mwi>thr` → `is_r_peak=True`, `SPKI=0.125*mwi+0.875*SPKI`; altfel `NPKI=0.125*mwi+0.875*NPKI`. Recalculează `thr` identic.
   - Returnează `(is_r_peak, mwi_val)` (`:94`).

### 1.3 `process_sample` (`ecg_dsp.py:136-188`)
- La `leads_off=True` → returnează `filtered=0, hr=0, rr=None, edr=0` (`:140-148`) — nu alimentează filtre/detector.
- `recent_raw/filtered` dej 10s (`:126-127`), `r_peak_timestamps` + `rr_intervals` + `qrs_amplitudes` dej 100 (`:128-130`).
- După filtrare (`:152-157`) → Pan-Tompkins → dacă `is_r_peak` calculează `rr = ts - last_ts`, validează 300-2000ms (30-200 BPM), `rr_intervals.append`, `instant_hr=60000/rr`, netezire `hr=0.7*hr+0.3*instant` (`:173`). Apoi `_update_edr()`.

### 1.4 EDR — ECG-Derived Respiration (`_update_edr` `ecg_dsp.py:190-212`)
- Necesită ≥8 QRS amplitudini și ≥12 RR (`:195,203`).
- `edr_val = (amp_last - mean(amps_16)) / (std(amps)+1e-6)` (`:200`).
- Estimare RPM prin zero-crossing pe `diff(RR_24)`: `avg_crossing_interval * mean(RR)/1000` → `60/(interval*2)`, filtrat EMA `0.8*old+0.2*new` dacă 6-36 RPM (`:206-212`).

### 1.5 HRV (`calculate_hrv_metrics` `ecg_dsp.py:219-290`)
- Fallback dacă `<4 RR`: `mean_hr 72, sdnn35, rmssd30, pnn50 8, lf_hf 1.5, sd1 21.2, sd2 45.1` (`:229-237`).
- **SDNN** `std(RR, ddof=1)`, **RMSSD** `sqrt(mean(diff²))`, **pNN50** `% |diff|>50ms`, **Poincaré** `SD1=sqrt(0.5*RMSSD²)`, `SD2=sqrt(2*SDNN² -0.5*RMSSD²)` (`:244-255`).
- **LF/HF** (`:257-280`): dacă ≥16 RR, resample tachogramă la 4 Hz (`np.interp` pe `cumsum(RR)/1000`), detrend, Welch `fs=4, nperseg=min(len,64)`, integrare `LF 0.04-0.15` / `HF 0.15-0.40`, `ratio=clip(LF/HF,0.1,10)`. Default 1.5 la eroare.

### 1.6 Offline helper
- `extract_edr_signal` (`ecg_dsp.py:293-302`): bandpass 0.1-0.5 Hz pe fereastră întreagă (6-30 BPM) cu `filtfilt`.

---

## 2. `src/dsp/audio_dsp.py` — audio 16 kHz

### 2.1 Mel filterbank (`create_mel_filterbank` `audio_dsp.py:25-47`)
- 128 triunghiuri `fmin=50, fmax=8000, n_fft=512` → `mel=2595 log10(1+hz/700)`, `hz=700(10^{mel/2595}-1)` (`:17-22`). Bin `floor((n_fft+1)*hz/fs)`, interpolare lineară între `f_m-1, f_m, f_m+1`.

### 2.2 `AudioDspProcessor` (`audio_dsp.py:50-140`)
- **Config:** `fs=16k, n_mels=128, n_fft=512, hop=160 (10ms)`, fereastră Hann 512, `audio_buffer deque 5s`, `recent_mel_frames 300`, `recent_rms 50`, `noise_floor -55 dB` (`:51-66`).
- **`push_audio_chunk` (`:68-140`):** normalize int16→float, append în buffer, `rms=sqrt(mean(chunk²))`, `energy_db=20 log10(rms)`, adaptează `noise_floor` (0.95/0.05 dacă sub, 0.999/0.001 dacă peste).
  - **Mel col live:** dacă buffer ≥512 → `windowed = slice*Hann`, `spec=|RFFT|²`, `mel=dot(fb,spec)`, `mel_db=10 log10(max(1e-6,mel))`, `mel_column=clip((mel_db+80)/80,0,1)` (`:101-109`).
  - **Snore (`:111-120`):** `low=mean(mel[5:35])` (80-500 Hz), `high=mean(mel[45:100])`, `ratio=low/(high+1e-6)`. Dacă `energy > floor+6dB` și `ratio>3.5` → `snore=clip((ratio-3.5)/10 + (energy-floor)/30,0,1)` else 0.
  - **Cough (`:122-128`):** dacă `recent_rms≥5`, `delta=energy - rms[-5]`, `broadband=mean(mel[30:100])`; dacă `delta>12 && broadband>1e-3 && energy>-35` → `cough=clip(delta/20,0,1)`.
  - **Pause (`:130-132`):** `energy < floor+2dB` → `True`.
  - Returnează `{energy_db, snore_probability, cough_probability, respiratory_pause, mel_column}`.

### 2.3 `extract_mel_spectrogram` (`audio_dsp.py:143-163`)
- Offline batch: pad dacă `<n_fft`, `num_frames=1+(len-n_fft)//hop`, loop STFT Hann → `|RFFT|²` → `dot(fb)` → `10 log10` → matrice `128 × n_frames`. Folosit în `StreamManager._process_30s_window` pentru 480k audio / 30s.

---

## 3. Cum se leagă de StreamManager

- `stream_manager.py:224-231` cheamă `ecg_dsp.process_sample` 5× per frame 20ms (250 Hz) și `audio_dsp.push_audio_chunk` 1× per chunk 320 sample-uri (20ms @16k).
- HRV live din `get_hrv_snapshot()` alimentează `TelemetryFrame.rmssd/sdnn/pnn50/lf_hf/stress` la 50 Hz (`stream_manager.py:237-275`).
- Audio live alimentează `TelemetryFrame.snore/cough/pause/energy_db` + `mel_column` către WS.

