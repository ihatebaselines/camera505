# AI — `src/ai/*`

Singurul modul LLM; totul rulează on-device.

---

## 1. `src/ai/ollama_engine.py` — engine local

### 1.1 Config & helpers (`ollama_engine.py:15-44`)
- `OLLAMA_HOST=http://localhost:11434` (env override) (`:15`), `PREFERRED_MODELS=["llama3.2","llama3.2:1b","mistral","phi3","gemma2:2b"]` (`:16`).
- `is_ollama_installed():19` — `shutil.which("ollama")`.
- `is_ollama_running():24` — `GET /api/tags timeout 3s ==200`.
- `get_available_model():33` — `GET /api/tags` → lista `models[].name`, prima potrivire pe prefix (`split(":")[0]`), fallback `models[0]`.

### 1.2 Instalare & start (`ollama_engine.py:47-100`)
- `install_ollama_windows():47` — `urllib.urlretrieve https://ollama.com/download/OllamaSetup.exe → %TEMP%/OllamaSetup.exe`, `subprocess.run([exe,"/S"],timeout120)` (`:56`).
- `start_ollama_server():65` — `Popen(["ollama","serve"], CREATE_NO_WINDOW)` + 15× sleep 1s până `is_ollama_running()`.
- `pull_model(name):87` — `subprocess.run(["ollama","pull",name],timeout600)`.

### 1.3 `ensure_ollama_ready():103-137`
Ordine **tolerantă la PATH Windows** (`:111-114` comentariu):
1. `running=is_ollama_running()` — dacă deja up, nu cere binarul.
2. Dacă `!running && !is_installed()` → `install_ollama_windows()` pe win32 altfel fail.
3. Dacă `!running && !is_running()` (încă offline) → `start_ollama_server()`.
4. `model=get_available_model()`; dacă `None` → `pull_model("llama3.2:1b") ~1.3GB`.

Returnează `model: str | None`.

### 1.4 `generate_sleep_report` — prompt-ul care duce la WHY IT FIRED (`ollama_engine.py:140-241`)
**Intrări:** `session_data` (din `app.py:stop` → `report_payload`) cu `estimated_ahi, respiratory_stability_score, summary{mean_heart_rate,mean_rmssd_hrv,mean_respiratory_rate,total_duration_minutes}, sleep_stages{deep_pct,rem_pct,light_pct,awake_pct}, total_events_count, alert_events?`, plus `user_profile{name, cohort{name}}`, `model`.

**Pasul alert_events → prompt (`:176-191`):**
- Extrage `top_alerts = [a for a in alert_events if message][:3]` (`:180`).
- Dacă există → `alert_list="; ".join("[time] message")`, `alert_block` cu instrucțiune explicită:
  ```
  Live alert events fired ... [02:14] Respiratory pause + bradycardia ...
  For EACH alert above, explain WHY it fired by causally linking the alert message to this night's metrics
  (e.g. "bradycardia 54 BPM co-occurring with respiratory pause inside a 3-s window = obstruction pattern",
  "HR 74 vs cohort norm", "anomaly burden vs AHI 5.0").
  ```
  și `alert_json_key` adaugă cheia `alert_explanations: ["one line per alert: [time] + causal explanation"]` (`:187`).
- Fără alerts → `alert_block=""` și cheia lipsește.

**Prompt final (`:193-206`):**
- System: `You are a clinical sleep AI for CAMERA 505. Write a UNIQUE, personalized report. Vary phrasing every time — never repeat the same sentences.`
- Data line: `Patient: {user_name} | Cohort: {cohort}` + `Data: {duration}(h), HR, HRV, Resp, Stability/100, AHI, Sleep Deep/REM/Light/Awake%, Events` + `alert_block`.
- Cerință JSON strict: `{narrative 1-2 paragrafe max140 cuvinte, insights 4-5 legate de numbers, recovery_score 0-100, recommendation 1 tip, mood_forecast 1-2 propoziții, signature_message, [alert_explanations]}`.

**Call Ollama (`:209-213`):** `POST {OLLAMA_HOST}/api/generate {model,prompt,stream:false, options:{temperature:0.85, num_predict:620, top_p:0.92, repeat_penalty:1.15}} timeout 70s`. Strip fences ` ``` `, `json.loads` direct sau regex `\{[\s\S]*\}`, validează `narrative/insights/recovery_score` prezente; normalizează `insights` string→list și `alert_explanations` string→list (`:226-235`). La eșec → fallback.

### 1.5 Fallback variat determinist (`_fallback_report` `ollama_engine.py:244-339`)
- Seed: `md5(f"{ahi:.1f}|{stability}|{hr:.0f}|{hrv:.0f}|{events}")` hex→int (`:260`) — aceeași noapte → același text, nopți diferite → text diferit.
- 3 `narratives` cu `stability>70` vs fragmentat, `ahi<5` etc. (`:262-266`).
- 7 `insights_pool` (AHI, Stability, HR/RMSSD, Resp, Deep, Events, Duration) (`:267-275`), alege 4 cu `(seed+i*3)%len`, garantează cel puțin un AHI și un Stability (`:298-304`).
- 6 `recommendations`, 4 `moods`, 5 `signatures` (incl. `*WE DON'T SUPPORT 67*`) (`:276-296`), index `seed % len`.
- `recovery_score = min(100, stability*0.85 + (5-min(ahi,5))*3 + hrv/100*5)` (`:309`).
- Returnează `{narrative, insights, recovery_score, recommendation, mood_forecast, signature_message, alert_explanations:_fallback_alert_explanations(...)}`.

### 1.6 `_fallback_alert_explanations` (`ollama_engine.py:317-339`)
Rule-engine pentru top 3 alerts:
- `pause/bradycardia/obstructive` → `bradycardia + respiratory pause co-occurrence = obstruction pattern (HR X BPM, AHI Y/h)`
- `anomaly` → `window anomaly burden pushed composite score past theta vs stability N/100`
- `range/heart rate` → `HR excursion outside personal Gaussian band (mean X BPM)`
- else → `signal deviation vs personal baseline (stability, AHI)`. Format `[{time}] {message} — {why}`.

---

## 2. Cum ajunge `alert_events` în raport (flux complet)

1. **Live în `life-mobile/app/dashboard/night/page.tsx:740`:** `finishStop` colectează `liveAlerts.slice(0,5).map(a=>{time:a.slice(1,7), message:a.split("] ")[1]})` → `alert_events` în payload-ul către `POST /api/ai/report`.
2. **Backend `src/backend/app.py:259-270`:** `POST /api/ai/report` primește `data{...alert_events, user_profile}`, cheamă `ensure_ollama_ready()` + `generate_sleep_report(data, user_profile, model)` → `{status:"ok", ai_report, model_used}`; la excepție returnează fallback dict cu `recovery_score=data.respiratory_stability_score`.
3. **Frontend afișează:** `night/page.tsx:133-142` `aiReport {narrative, insights, ... alert_explanations?}` + `Alert why: WHY IT FIRED` secțiune sub narrative dacă cheia există; la `aiStatus=loading` arată spinner, la `error` fallback.

---

## 3. Endpoint status

- `GET /api/ai/status` (`app.py:288-300`): `{ollama_installed, ollama_running, available_model, status:"ready"|"unavailable"}` din cele 3 helpers.

