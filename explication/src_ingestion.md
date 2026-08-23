# Ingestion — `src/ingestion/*`

Fluxul brut intră aici și iese normalizat la 50 Hz transport / 250 Hz DSP.

---

## 1. `src/ingestion/serial_stream.py` — cititor COM

**Rol:** thread background care ține deschis portul serial și livrează `ecg_val, leads_off, timestamp_ms` prin callback.

- **Clasa `SerialEcgReader` (`serial_stream.py:38`):** `port="COM3"`, `baud_rate=115200`, `callback`, `recent_samples=deque(2000)`, `reconnect_interval=3.0s`. `start():55` lansează `_read_loop` daemon; `stop():66` închide port + join 1s.
- **`_read_loop` (`serial_stream.py:77`):** loop `while running`: deschide `serial.Serial(port, baud, timeout=1.0)`, flush 0.1s, apoi `readline().decode('utf-8', errors='ignore').strip()`. La eroare închide și sleep 3s — reconectare automată.
- **Parser `_parse_line` (`serial_stream.py:110-176`):** 5 formate în ordine:
  1. Banner skip: `READY`/`ESP-32`/`#` → `None` (`:122`).
  2. Leads-off: `LEADS OFF`/`LEADSOFF`/`!` → `(0.0, True, now_ms)` (`:126`).
  3. `ECG:2048,BPM:72` → extrage float după `ECG:` (`:130-141`).
  4. JSON `{"v":2048,"lo":0,"t":...}` cu aliasuri `ecg`/`leads_off`/`timestamp_ms` (`:144-152`).
  5. CSV `val,bpm` sau `val,lo,t` (`:154-169`).
  6. Raw numeric `2048` (`:172-176`).
- **`list_available_com_ports` (`serial_stream.py:24`):** `serial.tools.list_ports.comports()` → `[{device, description, hwid}]`. Folosit în `app.py:lifespan` și `/api/com_ports`.
- **Dependență:** `pyserial`; dacă lipsește `SERIAL_AVAILABLE=False` și `start()` returnează `False` fără crash.

---

## 2. `src/ingestion/synthetic_generator.py` — generator fiziologic 50 Hz

**Rol:** sursă deterministă pentru demo/juriu când hardware lipsește. Generează ECG + audio sincron la `dt=0.02s`.

- **`SimulationScenario` (`synthetic_generator.py:16`):** 8 valori:
  - `healthy_rest`, `sleep_apnea`, `arrhythmia`, `cough_attack`, `snoring_episode`, `leads_off` — cele 6 vechi
  - `breathing_exercise` — nou: 6 RPM (0.1 Hz), RSA 10 BPM, audio respirație blândă (`:125-130,151`)
  - `stress_test` — nou: ciclu 15s (5s normal / 5s snore / 5s cough, repeat), HR 88 RPM (`:132-141`)

- **`SyntheticPhysiologicalGenerator` (`synthetic_generator.py:27`):** `ecg_fs=250, audio_fs=16000`, stare `phase_ecg/phase_resp/time_sec`, `target_hr/target_resp_rate`, `apnea_active/cycle_timer`.

- **`set_scenario` (`synthetic_generator.py:47`):** setează HR/resp per scenariu: healthy 68/14, apnea 65/15→54 în pauză→95 recovery, arrhythmia 85, breathing 65/6, stress 88/16.

- **`generate_step(dt_sec)` (`synthetic_generator.py:67`):** returnează `(ecg_raw 0..4095, audio_chunk 16kHz, leads_off, meta)`.
  - **Scenarii detaliate:**
    - `LEADS_OFF` (`:84`): `leads_off=True` permanent.
    - `SLEEP_APNEA` (`:87-108`): ciclu `%70s` = 40s normal (HR 66±1) → 20s pauză apnea (HR 54±1.2 + drift 0→1, `apnea_active=True`, `snore` silent) → 10s gasp (HR 95±1.8, `snore_active=True`). Variabilitate per episod via `np.random.normal`.
    - `SNORING_EPISODE` (`:110-113`): snore când `sin(phase_resp)>0.3`.
    - `COUGH_ATTACK` (`:115-118`): burst 0.6s la fiecare 6s (`cycle_timer%6<0.6`).
    - `ARRHYTHMIA` (`:120-123`): avansează `phase_ecg+=0.8` la `phase>4.5` și `cycle%4==0` (ectopic prematur).
    - `BREATHING_EXERCISE` (`:125-130`): `resp=6`, RSA 10 BPM — sunet normal branch.
    - `STRESS_TEST` (`:132-141`): `HR 88` constant, ciclul 15s snore/cough.
  - **RSA (`:149-155`):** `rsa=10*sin(phase_resp)` la breathing_exercise else `6*sin` (0 în apnea). `instant_hr = clamp(target+rsa,40)`.
  - **Sinteză ECG (`:157-192`):** baseline 2048 + wander 80*sin(resp) + P(160), Q(-120), R(1500*qrs_mod 1+0.15*sin resp), S(-320), T(340) pe faza `p=phase_ecg%(2π)`, + zgomot gauss 10 LSB. Clip 0..4095. Leads-off → 0.
  - **Sinteză audio (`:194-228`):** chunk `int(16000*dt)`, noise floor -55 dB (`0.002`), apoi: normal breath (max(0,sin)·0.01 filtrat), snore (120+240+360 Hz + rumble 0.05, var 0.85-1.15), cough (gauss 0.45). Clip -1..1. `meta` include `scenario/target_hr/apnea_active/snore/cough`.
  - **`generate_sample()` (`:240-249`):** wrapper 50 Hz dt=0.02 + `ecg_norm=(raw-2048)/2048`.

---

## 3. `src/ingestion/stream_manager.py` — orchestrator real-time

**Rol:** singurul loc care leagă ingestion+DSP+model+DB+WS. Rulează ` _stream_loop` la 20ms.

- **Config (`stream_manager.py:34-90`):**
  - `is_running`, `current_session:SessionRecord`, `source_type` (`synthetic`/`serial`/`dataset`), `mode` (`dual`/`ecg_only`/`audio_only`).
  - Procesoare: `EcgDspProcessor(fs=250)`, `AudioDspProcessor(16000)`, `SyntheticPhysiologicalGenerator`, `SerialEcgReader` (creat la `start_session` dacă `source in ('serial','hardware')` — alias legacy `:144`).
  - Modele: `LifeMultimodalTransformer(d_model=512).eval()`, `PersonalizedAdaptiveBaseline()`.
  - Buffer-e fereastră 30s: `window_ecg_buffer` (țintă 7500), `window_audio_buffer` (480k), `window_start_ts`, `window_index`, `last_predicted_embedding`.
  - WS: `subscribers: List[asyncio.Queue]`, `latest_telemetry`, `latest_window_token`.
  - Lock: `threading.RLock()` (`:75`) — previne deadlock când `start_session` oprește sesiune auto din lifespan.
  - Batch DB: `db_telemetry_batch`, `last_db_flush` 5s.
  - Acoustic counters: `session_snore_events/cough/noise_db_history/hr_history` + cooldown-uri `_prev_snore_prob/_last_snore_event_ts` etc. (`:81-90`).

- **`start_session` (`:92-154`):** cu `lock`: oprește sesiune veche dacă rulează, creează `SessionRecord(id=life_sess_{hex}_{ts})`, `db.create_session`, încarcă baseline user din DB, resetează DSP+buffer-uri, resetează acoustic counters, pornește `SerialEcgReader` dacă serial, setează `is_running=True` și thread `_stream_loop` daemon.

- **`stop_session` (`:156-183`):** oprește reader+thread (join 1s), `db.close_session`, flush telemetry, `_generate_night_summary` → `db.save_night_summary` + `db.save_user_baseline`.

- **`push_external_audio` (`:188-191`):** injectează PCM live din browser (mic) în `window_audio_buffer` — calea `MicrophoneAudioStreamer` → `app.py:/api/audio/chunk`.

- **`_stream_loop` (`:193-298`):** inima sistemului, `dt=0.02` (50 Hz):
  1. **Ingest (`:203-217`):** synthetic → `generate_step(dt)`; serial → `pop()` din `recent_samples` else `(0.0, True)` — niciodată fallback fals 2048; altfel synthetic.
  2. **5× upsample (`:219-230`):** transport 50 Hz → 5 sample-uri DSP @250 Hz (offset `now_ms+sample_idx*4`) prin `ecg_dsp.process_sample`. Umple corect fereastra 7500 fără starvare. Audio: `audio_dsp.push_audio_chunk`.
  3. **HRV live (`:237-253`):** `get_hrv_snapshot()` → `rmssd/sdnn/pnn50/lf_hf`; stress derivat `100 - rmssd*1.2 + (lf_hf-1.5)*8` clip 0-100. La leads_off toate 0.
  4. **TelemetryFrame (`:256-278`):** construiește frame cu `raw/filtered/is_r_peak/hr/rr/leads_off/edr/resp/snore/cough/pause/anomaly/rmssd/sdnn/pnn50/lf_hf/stress`. `_update_acoustic_counters` + batch DB. Flush DB la 5s (`:282-286`).
  5. **Fereastră 30s (`:289-290`):** când `len(window_ecg_buffer)>=7500` → `_process_30s_window`.
  6. **Broadcast (`:293`):** `_broadcast_telemetry` către WS.
  7. **Sleep precis (`:296-298`):** `sleep(max(0.001, dt - elapsed))`.

- **`_process_30s_window` (`:300-386`):** taie 7500 ECG + 480k audio (sau zero dacă lipsă), `extract_mel_spectrogram` → `LifeMultimodalTransformer` → `embedding 512`. `get_hrv_snapshot` + `baseline_engine.compute_window_anomalies` → `WindowToken30s` salvat în DB. Dacă `is_suspect_episode` → `AnomalyEventRecord` în `anomaly_events`.

- **`_generate_night_summary` (`:388-458`):** din token-uri calculează `duration_mins=tokens*0.5`, `avg_night_embedding=mean(embeddings)`, `estimate_multimodal_risk_score` → `NightReportSummary` (risk 0-100, AHI, grades).

- **`_update_acoustic_counters` (`:460-483`):** snore event la `snore>0.5` rising edge + 30s cooldown; cough >0.5 + 10s cooldown; sample noise/HR la 5s (max 2000).

- **`compute_acoustic_analytics` (`:485-512`):** `snore_burden_index = snore_events / duration_hrs`, `avg_noise_db=mean`, `noise_hr_correlation` Pearson pe perechi cu HR>0 (≥3 sample-uri, std>1e-9).

- **`_broadcast_telemetry` (`:514-538`):** payload `{type, source_type, is_simulated, data:frame, mel_column, baseline:{hr_mean,rmssd_mean,resp_mean}, latest_token}`; drop dacă `q.qsize()>=20`.

---

## 4. Alte stream-uri (completare)

- `src/ingestion/esp32_wifi_stream.py` — listener UDP :3333 JSON `{"ecg":2048,"hr":74}` + `WiFiCSIBreathDetector` (CSI).
- `src/ingestion/wifi_csi_stream.py` — parser pachete `t,rssi,len,I;Q;` pentru radar respirație.
- Ambele sunt alternative la `serial_stream`; StreamManager alege la boot via `lifespan`.

