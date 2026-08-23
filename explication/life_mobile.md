# life-mobile — Next.js Mobile Dashboard

> Next.js 16 (Turbopack `-p 6767`) + React 19 + Tailwind 4 + TypeScript 5 — the jury-facing UI. All real data over `ws://{host}:8000/ws/live` at 50 Hz.

**Package:** `life-mobile/package.json:2` name `life-web v2.0.0` — deps `next@16.3.2, react@19, qrcode@1.5.4` — scripts `dev: next dev --turbo -p 6767`, `build`, `start -p 6767`.

---

## `life-mobile/app/` — Routing (App Router)

### `app/layout.tsx`
- Root layout — Catppuccin/Mocha+brutalist shell, loads `globals.css`, wraps `<AppShell>`. Fonts mono, antialiased, `bg-black text-white`.

### `app/page.tsx` (`app/page.tsx:7`)
- **Purpose:** Entry gate — reads `localStorage: camera505_user, camera505_first_time, camera505_profile` → `router.replace` to `/login` (no user), `/quiz` (first-time or missing profile), or `/dashboard`. Shows `CAMERA 505 INITIALIZING SLEEP INTELLIGENCE…` heartbeat splash (`IconHeart` pulse).
- **Demo:** First screen jury sees; controls onboarding flow without backend round-trip.

### `app/login/page.tsx` & `app/register/page.tsx`
- **Purpose:** Auth forms (localStorage-only, no backend) — sets `camera505_user {name,user_id}` + `camera505_first_time=true`, `AuthContext` (`components/auth/AuthContext.tsx`) hydrates `getBackendUserId()`. Login → quiz.
- **Run:** Visit `http://localhost:6767/login`

### `app/quiz/page.tsx`
- **Purpose:** Health onboarding survey — collects 9 CatBoost features (age, gender, BMI category, sleep position, snore frequency, fatigue, choking awakenings, smartwatch, STOP-BANG derived) → `POST /api/quiz/evaluate` → `CatBoostCohortClassifier` → persists cohort to `camera505_profile {cohort:{name,risk,theta,tau}}` + `GET /api/quiz/personas` for demo shortcuts. Routing: quiz → `/dashboard`.
- **Demo:** Jury picker for persona — e.g. `senior_high_risk` immediately recalibrates thresholds shown on dashboard banner.
- **Run:** `curl http://localhost:8000/api/quiz/personas`

### `app/dashboard/layout.tsx`
- **Purpose:** Dashboard shell — side/nav, `AppShell`, parallax background layer, outlet for nested pages.

### `app/dashboard/page.tsx` (448 lines)
- **Purpose:** Home dashboard — **live telemetry + historical snapshot** in one view. Parallax 505 watermark + sensor status chip, cohort banner, last-night card, 4-tile telemetry grid, live ECG oscilloscope, studio button.
- **State:** `connected`, `sourceType: serial|synthetic|wifi|unknown`, `ecgData: number[500]`, `frame{hr_bpm,edr_resp_rpm,snore_prob,anomaly}`, `userName, cohortName/Risk, history[NightSessionRecord]` from `lib/userStorage`.
- **WebSocket:** `initWS()` → `ws://${host}:8000/ws/live` with 2.5 s reconnect, handles `msg.data ?? msg`, extracts `filtered_ecg/raw_ecg`, pushes 500-pt window, maps `heart_rate_bpm/respiration_rate_rpm/snore_probability/anomaly_score` (zeroed if `leads_off`).
- **Components used:** `EcgOscilloscope` (dynamic no-SSR), `StudioLaunchButton`, `Parallax/Reveal`, `Icons`, `getProfile/getHistory`.
- **Visuals:** Last-night stability 72 px number color-coded `≥85 green / ≥70 amber / red`; sleep architecture 4-segment bar (white deep, blue REM, gray light, red awake); telemetry tiles heart=red, resp=blue, snore=amber, anomaly=white.
- **Demo:** Central jury view for live signal honesty (SIMULATOR MODE vs SENSOR ONLINE vs NO ECG SIGNAL) + history → `/dashboard/night`.

### `app/dashboard/night/page.tsx` (~1200 lines, largest file)
- **Purpose:** The 4-state night session machine — **idle → active → scoring → report** — orchestrating start/stop/scoring/AI.
- **States:** `nightState: idle|active|scoring|report`; `hardware: COM3 Hardware|WiFi CSI|Simulator`; `useMic, launchDesktopPlotter`, `elapsed, ecgData[500], frame{Risk}, melBands[80][128], liveAlerts[6], aiReport, sessionResult{stability,ahi,avg_hr,avg_resp,avg_rmssd,duration,events,sleep_stages}` + scoring `terminalLines`.
- **Idle:** 3-row config card (sensor select → `source_type` map serial/wifi/synthetic; desktop 60FPS plotter toggle; mic toggle; cohort row green badge); buttons `START NIGHT MONITORING` + `StudioLaunchButton`.
- **Active:** `handleStart()` → `POST /api/session/start {user_id:getBackendUserId(), mode:dual, source_type, com_port, baud}` then if synthetic: `POST /api/scenario {scenario:demoScenario}` + `POST /api/audio/upload_file {preset:demoAudio}` (keeps ECG+audio aligned) + optionally `GET /api/launch-ecg-studio`; opens `EcgStudioOverlay`. Effect opens WS, processes `filtered_ecg/heart_rate_bpm/respiration_rate_rpm/snore_probability/anomaly_score/leads_off`, paints `EcgOscilloscope` + `MelWaterfall` (mel_column[128]), records `samplesRef{hr,resp,snore,anomaly≤10000}` for offline fallback, emits `liveAlerts` including correlated `respiratory_pause_flag + bradycardia (<60) within 3 s → possible obstructive event`.
- **Stop:** `handleStop()` guards `isStopping`, flips to `scoring`, shows `STOP requested — freezing telemetry buffer...`, then `finishStop()` with 30 s `AbortController`: `POST /api/session/stop` (tolerates backend offline) → builds local fallback `computeLocalResult()` (HR variance→RMSSD proxy, `estAhi=anomaly*11+snore*7`, risk→stability, anomaly-driven sleep stages). Chooses backend result if `estimated_ahi` present else local; sets `sessionResult`, `inferenceReady=true`, fires `generateAIReport({summary,estimated_ahi,respiratory_stability_score,sleep_stages,events,data_source} + user_profile)`.
- **Scoring terminal:** Brutalist window (red/amber/green dots) animates `Result`-driven lines at 650 ms: `Phase EC G, Pan-Tompkins HR, RoPE 512D, CatBoost ESRS, Soft-F1 fine-tune, hypnogram deep/rem/light/awake, AHI X.X, Ollama llama3.2, classification ✓, complete` → auto `setNightState(report)` + `setHistory(history)`.
- **Report:** Score header 72 px stability/100, AHI pill, 4-segment bar, 5-row metrics grid (HR BPM, resp RPM, HRV ms, duration H M, AHI), AI narrative section (from `aiReport`), disclaimer.
- **Local fallback correctness:** simulator fallback disabled when `camera505_demo.scenario==leads_off` so `NO SIGNAL` is honest; WS fallback local sine only when `hardware=Simulator && !hasReceived`.
- **Run:** Visit `http://localhost:6767/dashboard/night`

### `app/dashboard/profile/page.tsx`, `app/dashboard/history/page.tsx` (implied), `app/not-found.tsx`, `app/globals.css`
- Profile shows `camera505_profile` details; history lists `getHistory()` sessions with links; 404 page brutalist; globals define Tailwind `@apply` for `btn-go` (blue) / `btn-stop` (red) and watermark.

---

## `life-mobile/components/` (21 files)

### Core live visuals
- **`EcgOscilloscope.tsx`** — Canvas 2D 500-pt scrolling trace (50 Hz, 1 px/pt), red on black, grid, leads_off blanks. Used in `dashboard/page.tsx` + `dashboard/night/page.tsx`. Props `data:number[], leads_off:boolean`.
- **`EcgStudioOverlay.tsx`** — In-page resizable overlay (vs desktop `scripts/desktop_ecg_plotter.py`) sharing same rendering engine, opened by `studioOpen` state in Night active.
- **`MelWaterfall.tsx`** — Horizontal waterfall of `melBands: number[80][128]` (oldest→newest left→right), blue→red colormap, 36 px height. Fed by `mel_column` at 50 Hz. Note in UI: *Spectrograma Mel (128 benzi) este eșantionată la același 50Hz ca ECG-ul*.

### Telemetry & control
- **`MelWaterfall` + `MicrophoneAudioStreamer.tsx`** — mic permission, `AudioWorklet`/`ScriptProcessor` chunking at 16 kHz, `POST /api/audio/upload_chunk {samples}` live + mute toggle, used when `useMic=true`.
- **`StudioLaunchButton.tsx`** — triggers `GET /api/launch-ecg-studio` (opens `scripts/desktop_ecg_plotter.py` new console via FastAPI `subprocess.CREATE_NEW_CONSOLE`).
- **`HardwareConnectionStatus.tsx`** — polls `GET /api/com_ports` + `GET /api/wifi/status` + `GET /api/session/current`, shows badge logic matching dashboard chip.
- **`QrCodePairingCard.tsx`** — fetches `GET /api/network_info` → renders `qrcode` QR for `http://{primary_ip}:6767` phone pairing (uses `qrcode` dep).

### Clinical modals / analytics
- **`ClinicalNightReportModal.tsx`** — modal wrapper for final report (AHI, risk, disclaimer).
- **`AdaptiveBaselineStudioModal.tsx`** — plots `GET /api/adaptive/response_curve?cohort=&theta=&tau=` soft-sigmoid `P=1/(1+exp(-(score-theta)/tau))` (40 pts) with slider overrides.
- **`FoundationModelStudioModal.tsx`** — shows `GET /api/user/model_status/{user}` (exists/size_kb/catboost/sessions/theta) + `GET /api/user/trajectory/{user}`.
- **`UserContinualLearningModal.tsx`** — sparkline of `learning_trajectory: {session_idx, theta, temperature, hr_mean, stability, ahi}` from `ContinualLearningEngine`.
- **`ParallelTrainingBenchmarkModal.tsx`** — triggers `POST /api/training/run_parallel` + polls `GET /api/training/benchmark_results`, displays per-cohort Soft-F1.
- **`MultimodalFusionInspector.tsx`** — inspects last `WindowToken30s` fusion: ECG+Audio token attention, `stability/recon/pred/drift/composite`, suspect reasons.
- **`AnomalyRadar.tsx`** — 4-quadrant radar chart for stability/reconstruction/prediction/drift.
- **`HypnogramTimeline.tsx`** — 30-s resolution hypnogram from `window_tokens` history.
- **`OnboardingQuizModal.tsx`** / **`NightStartModal.tsx`** — modal counterparts to `app/quiz/page.tsx` and night start.

### Layout & UI primitives
- **`layout/AppShell.tsx`** — chrome with nav links (Dashboard, Night, History, Profile), user badge, logout clearing `camera505_*`.
- **`auth/AuthContext.tsx`** — `AuthContext`, `getBackendUserId()`, localStorage sync, login gate.
- **`ui/Icons.tsx`** — SVG icon set (Heart, Moon, Wave, Mic, Bolt, Dna, ArrowRight, Monitor, Activity, Stop, Shield…) used everywhere.
- **`ui/Parallax.tsx`** — `Parallax({speed, className})` (translateY on scroll) + `Reveal({delay})` (fade-up), used for 505/ECG watermarks.

### `life-mobile/lib/userStorage.ts` (referenced, not listed above)
- Helpers `getProfile/setProfile`, `getHistory/setHistory`, `getBackendUserId`, `getDemo/setDemo` — localStorage JSON wrappers central to all pages.

---

## `life-mobile/tsconfig.json`, `postcss.config.mjs`, `tsconfig.tsbuildinfo`
- TS strict, path alias `@/*` → `*`, `esModuleInterop`. PostCSS wraps `@tailwindcss/postcss`.

---

## How it appears in the demo

1. `/` → `/login` → `/quiz` (pick e.g. `snoring_mild`) → **Dashboard** sees cohort `SNORING_MILD` green APNEA_RISK badge, SENSOR ONLINE/SIMULATOR MODE chip, last-night stability card, 50 Hz oscilloscope.
2. Dashboard **START NIGHT** → **Night idle** config (choose Simulator + scenario apnea to guarantee visible events) → `START NIGHT MONITORING` opens EcgStudioOverlay, WS at 50 Hz shows HR/RPM/snore/anomaly + correlated alerts.
3. **END NIGHT → scoring terminal** (10 lines, 650 ms each) while backend computes + AI generates; source badge `FASTAPI DSP + SQLITE` vs `ON-DEVICE BUFFER` confirms real vs fallback.
4. **Report** shows 72 px stability, AHI pill, 4-bar hypnogram, 5-row vitals grid, Ollama/queued narrative (with `*WE DON'T SUPPORT 67*` closings), and Jump to `/dashboard` where history now includes new night.

### Run
```bash
cd life-mobile && npm install && npm run dev   # http://localhost:6767
# paired phone:
curl http://localhost:8000/api/network_info   # copy mobile_url
# build for prod
npm run build && npm start
```
