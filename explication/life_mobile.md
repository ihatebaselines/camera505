# Life-Mobile — `life-mobile/app/*` + `life-mobile/components/*`

Next.js 16 / React 19, `package.json:7` `next dev --turbo -p 6767`. Stil: brutalist mono, `JetBrains Mono`, `#000` bg, `#222` border, `#0080FF` accent.

---

## 1. Rute `life-mobile/app/*`

| Rută | Fișier | Ce face (cod real) |
|---|---|---|
| `/` | `app/page.tsx:7` | Redirect client: `localStorage camera505_user` lipsă → `/login`; `camera505_first_time=='true'` sau fără `camera505_profile` → `/quiz`; altfel → `/dashboard`. |
| `/login` | `app/login/page.tsx` | Form user/pass, scrie `camera505_user {name,userId}`, marchează `camera505_first_time=true` dacă nou. Link către `/register`. |
| `/register` | `app/register/page.tsx` | Form creare cont, validare, scrie același `camera505_user`. |
| `/quiz` | `app/quiz/page.tsx:30-432` | 9 întrebări ESRS (age, gender, bmi, sleepPosition, snore 0-3, fatigue 0-3, choking boolean, hypertension boolean, smartwatch boolean). `classifyToCohort:30` map 8 cohorte (obese_high_risk θ0.52 τ0.65, senior θ0.48, severe_osa θ0.55, snoring θ0.38, postmenopausal θ0.35, insomnia θ0.28, young_athlete θ0.22, wearable θ0.24, healthy θ0.30). La final `startAnalysis:258` scrie `camera505_profile {answers, cohort:{key,name,risk,theta,tau,hr,resp}}` + `camera505_first_time=false` și arată terminal 9 linii (CatBoost/Transformer) apoi `router.replace('/dashboard')` după 1.8s. Fallback `questions[step]??questions[0]` (`:342`) anti-crash. |
| `/dashboard` | `app/dashboard/page.tsx:38` | Greeting `GOOD morning/afternoon/evening {userName}` + cohort banner (`cohort.name/risk`). WS `ws://host:8000/ws/live` la 50 Hz → `ecgData 500` + `frame{hr,resp,snore,anomaly,leads_off}` (`:102-131`). 4 carduri live HR/RESP/SNORE/ANOMALY, oscilloscope `EcgOscilloscope`, last-night card cu AHI/stability/sleep stages bar (deep white, REM blue, light gray, awake red). |
| `/dashboard/night` | `app/dashboard/night/page.tsx:128` | State machine `NightState="idle"|"active"|"scoring"|"report"` (`:37`). Vezi §2. |
| `/dashboard/history` | `app/dashboard/history/page.tsx` | Listează `getHistory()` (localStorage) + `GET /api/history/sessions`; chart AHI trend, 3-night forecast (least-squares pe `stability_score`), tabel sesiuni, footer federated `GET /api/federated/cohort_stats`, modal `ClinicalNightReportModal`. |
| `/dashboard/profile` | `app/dashboard/profile/page.tsx` | Afișează `camera505_profile` + baseline din `GET /api/baseline?user_id` + traiectorie `GET /api/user/trajectory/{id}`. |
| `/demo/live` | `app/demo/live/page.tsx:54` | Jury autoplay 40s (vezi `README.md:demo 2`). Nu atinge backend — generator local 50 Hz. Progres bar 4s/10s/6s/14s/6s, REPLAY button resetează `startRef/genRef` (`:132-140`). |

**Layout & lib:**
- `app/layout.tsx` — `AppShell` wrapper (nav brutalist, `AuthContext`).
- `app/globals.css` — Tailwind 4, `@media print` ascunde nav/buttons, monochrome A4 pentru PDF.
- `lib/userStorage.ts` — `getProfile/getDemo/getHistory/setHistory/getBackendUserId/setNamespacedItem` (prefix `camera505_`).

---

## 2. `app/dashboard/night/page.tsx` — flow detaliat (1240 linii)

### 2.1 Idle (`nightState=="idle"` `night/page.tsx:828-951`)
- Header `TONIGHT'S MONITORING SESSION`, 4 rânduri config: **Sensor source** select (`COM3 Hardware/WiFi CSI/Simulator`) (`:860`), **Desktop plotter** toggle (`launchDesktopPlotter` `useMic`) (`:882`), **Acoustic snore** toggle, **Cohort** badge (`cohortName` din `getProfile()`), butoane `START NIGHT MONITORING` + `StudioLaunchButton` (`:934`).
- `useEffect:229` încarcă `cohortName/risk` + `demoScenario/audio` din `localStorage camera505_demo` → dacă există setează `hardware='Simulator'`.

### 2.2 Active (`nightState=="active"` `night/page.tsx:953-1173`)
- Top bar `OVERNIGHT MONITORING ACTIVE` + `ECG STUDIO` button + clock `formatTime(elapsed)` (`:964`).
- 4 metric cards HR/RESP/SNORE/RISK + HRV card complet (RMSSD/SDNN/pNN50/LF-HF/stress) (`:1030-1067`) cu formula `stress=clamp(100 - rmssd*1.2 + (lf_hf-1.5)*8)`.
- Oscilloscope + MelWaterfall + `RppgCameraCard` + `ActigraphyCard` + `MicrophoneAudioStreamer` (`isActive=useMic`).
- **WS connect (`:275-295`):** `new WebSocket(ws://host:8000/ws/live)`, parse `msg.data ?? msg`, `val=filtered_ecg/ecg_filtered/raw_ecg`, `hr/resp/snore/anomaly/leads_off`, `rmssd/sdnn/pnn50/lf_hf/stress` (fallback proxy `rmssd~32+rand8` dacă backend nu emite). Colectează `samplesRef{hr,resp,snore,anomaly}` cap 10000 pentru fallback scoring. `mel_column` → `melBands 80`.
- **Alerte corelate (`:329-347`):** `isPause=(respiratory_pause_flag||pause_flag)`, `isBrady=hr<60 && !leads_off`. Ține `lastPauseMs/lastBradyMs`; dacă ambele <3000ms → `recordAlert('apnea-correlated', "Respiratory pause + bradycardia (54 BPM) - possible obstructive event")` + `navigator.vibrate([200,100,200])`. Alte praguri: `anomaly>0.45 HIGH / >0.25 ELEVATED`, `hr<45||>110`, solo pause.
- **Fallback simulator (`:377-432`):** dacă `hardware includes 'simulator'` și `hasReceivedRef==false` după 1200ms → `setInterval 20ms` generează PQRST matematic + `frame` cu RMSSD 36-72, stress derivat; disabled dacă `camera505_demo.scenario=='leads_off'`.

### 2.3 Scoring & report
- **`handleStart:554`** → `setNightState("active")` + `setStudioOpen(true)` + `POST /api/session/start {user_id,mode:dual,source_type:serial/wifi/synthetic, com_port, baud}` + `POST /api/scenario` dacă synthetic + `POST /api/audio/upload_file {preset}` + `GET /api/launch-ecg-studio` dacă toggle.
- **`handleStop:648-741`** → `setNightState("scoring")` + terminal 3 linii inițiale, `POST /api/session/stop` timeout 30s, `computeLocalResult():475` (din `samplesRef`: `avgHr/Resp/Snore/Anomaly`, `hrVar→rmssdProxy`, `estAhi=clamp(anomaly*11+snore*7,0.3,40)`, `stability=clamp(100 - risk*0.9,50,99)`, sleep stages din anomaly). Alege `result` = backend dacă `estimated_ahi` prezent else local. `resultRef/result/setSessionResult/setInferenceReady(true)` + `generateAIReport({summary,estimated_ahi,stability,sleep_stages,events, source, alert_events:liveAlerts.slice(0,5)})`.
- **`generateAIReport:613`** → `POST http://host:8000/api/ai/report { ...payload, user_profile:{name, cohort}}` → `aiReport {narrative, insights, recovery_score, recommendation, mood_forecast, signature_message, alert_explanations?}`.
- **Terminal lines (`:442-471`):** 10 linii dinamice cu `avg_hr, ahi, sleep_stages` reale, animație 650ms per line, apoi `nightState="report"` + `saveCompletedSession` (`getHistory/setHistory`).
- **PDF (`exportReportToPDF:744-796`):** clonare `#printable-report` în popup `900×1100`, inject `@page A4` + monochrome, ascunde `button`, apoi `w.print()` cu 450ms delay; fallback `window.print()`.
- **Report metrics (`:807-812`):** `snoreBurdenIdx/coughCount/avgNoiseDb/noiseHrCorr` din `stopPayloadRef.current` (acoustic analytics backend).

---

## 3. Componente `life-mobile/components/*`

| Componentă | Fișier | Rol & detalii cheie |
|---|---|---|
| **EcgOscilloscope** | `EcgOscilloscope.tsx:17` | Canvas HiDPI (`dpr min 2`), 500 puncte, grid 6×12, baseline dashed, `leads_off` → overlay roșu `ELECTRODES DETACHED`, autoscale EMA `k=0.08` pe `range` + pad 18%, trace verde `#0E9F00` shadow 6 + dot roșu trailing 3.5px right-anchored. Normalizare `v>10? v/4095 : (v+1.5)/3`. |
| **EcgStudioOverlay** | `EcgStudioOverlay.tsx:30` | Full-screen overlay `z-[100]`, 2 canvas 50 Hz ECG + FFT 0-20Hz, calitate `quality 0-100` din `range/noise` + excludere R-peak ±8, 4 metric cards HR/RMSSD/SDNN/pNN50/LF-HF/stress, ws live + fallback simulator (`:153-207`), quality bar Good>75/Medium≥45/Poor. |
| **MelWaterfall** | `MelWaterfall.tsx:31` | Canvas `melBands: number[][]` 32 benzi, map dB→culoare 11 praguri `#080A12→#FF5E7E`, `colW=W/frames, rowH=H/bands`, sync line 50Hz (`ctx.stroke x=W-0.5` solid 1 + glow 3, `MelWaterfall.tsx:64-78`). |
| **RppgCameraCard** | `RppgCameraCard.tsx:63` | Fingertip on lens, `getUserMedia {facingMode:environment 320×240}`, sample 10 Hz (`FPS=10`), crop centru 16×16 → `redMean`, buffer 300 (30s), bandpass `MA3 - MA15` → 0.7-3.5Hz, `estimateBpm:32` threshold `mean+0.4*std`, peak gap 3-21, `Δ vs ecgHr` badge ≤5 verde/≤10 amber/>10 roșu. |
| **ActigraphyCard** | `ActigraphyCard.tsx:38` | `DeviceMotion |a|` @ `accelerationIncludingGravity`, varianță `/30s`, praguri `STILL<0.005, RESTLESS<0.16, ACTIVE≥0.16`, bar chart 6×30s, iOS `requestPermission` gate, watchdog 4s → `NO MOTION DATA` dacă 0 sample-uri. |
| **MicrophoneAudioStreamer** | `MicrophoneAudioStreamer.tsx:10` | `getUserMedia audio{echo:false, noise:false, gain:false}`, `AudioContext 16k`, `ScriptProcessor 4096` → `pcmBuffer`, upload la 200ms chunk 3200 → `POST /api/audio/upload_chunk {samples,fs:16000}`, meter `energy_db` + snore detect bin 80-500Hz>90, preset buttons snoring/cough/normal → `/api/audio/upload_file {preset}`, file upload cu `decodeAudioData` + decimate la 16k. |
| **StudioLaunchButton** | `StudioLaunchButton.tsx:8` | `fetch http://host:8000/api/launch-ecg-studio` timeout 6s via `AbortController`, stări `idle/launching/ok/error`, text `Backend offline — run start.bat` la fail. |
| **HardwareConnectionStatus** | `HardwareConnectionStatus.tsx` | Badge `SENSOR ONLINE / NO ECG SIGNAL / SIMULATOR MODE` din `source_type + leads_off`. |
| **AnomalyRadar** | `AnomalyRadar.tsx` | Radar 4 cadrane (stability/recon/pred/drift) din `latest_token`. |
| **HypnogramTimeline** | `HypnogramTimeline.tsx` | Timeline `sleep_stages` pe 0-8h. |
| **QrCodePairingCard** | `QrCodePairingCard.tsx` | QR din `GET /api/network_info` → `mobile_url` :6767. |

**Alte componente:** `MultimodalFusionInspector`, `FoundationModelStudioModal`, `AdaptiveBaselineStudioModal`, `ParallelTrainingBenchmarkModal`, `ClinicalNightReportModal`, `UserContinualLearningModal`, `NightStartModal`, `OnboardingQuizModal`, `layout/AppShell.tsx`, `ui/Icons.tsx` (+ `Parallax.tsx`).

---

## 4. Legături cu backend (rezumat)

- `ws://host:8000/ws/live` — 50 Hz `TelemetryFrame + mel_column` → toate componentele live.
- `POST /api/session/start|stop` — night flow.
- `POST /api/audio/upload_chunk|upload_file` — MicrophoneAudioStreamer + preset.
- `POST /api/ai/report` — alert_events în prompt → WHY IT FIRED.
- `GET /api/network_info` — QrCodePairing.
- `GET /api/federated/cohort_stats` — footer history.

