# src/ai — Local LLM Narrative Layer

---

## `src/ai/__init__.py`
Package marker.

---

## `src/ai/ollama_engine.py` — Ollama Local LLM Engine (288 lines)

### Purpose
Auto-detects/installs/starts **Ollama** (local `http://localhost:11434`) and generates **personalized, varied sleep narrative reports** from structured session metrics. Works offline with a deterministic fallback when Ollama is absent — no cloud calls, data stays on-device.

### Inputs / Outputs

#### Helpers
- `is_ollama_installed() -> bool` — `shutil.which("ollama")` or common paths.
- `is_ollama_running() -> bool` — `GET /api/tags` (timeout 3 s).
- `get_available_model() -> Optional[str]` — intersects server model list with `PREFERRED_MODELS = ["llama3.2","llama3.2:1b","mistral","phi3","gemma2:2b"]` (prefix match).
- `install_ollama_windows()` — downloads `OllamaSetup.exe` from `https://ollama.com/download/OllamaSetup.exe` to `%TEMP%` → silent `/S` install (120 s timeout).
- `start_ollama_server()` — `Popen(["ollama","serve"], CREATE_NO_WINDOW)` → poll 15×1 s for readiness.
- `pull_model(name)` — `ollama pull {name}` (600 s).
- `ensure_ollama_ready() -> Optional[str]` — full flow: running? → installed? → start → pull `llama3.2:1b` (~1.3 GB) if none. Returns chosen model or `None`. Tolerates Windows PATH miss if service already on `:11434` (`ollama_engine:114`).

#### Main entry
- `generate_sleep_report(session_data: dict, user_profile: Optional[dict], model: Optional[str]) -> dict{narrative, insights[4-6], recovery_score 0-100, recommendation, mood_forecast, signature_message}`
  - **Extracts:** `estimated_ahi, respiratory_stability_score, summary{mean_heart_rate, mean_rmssd_hrv, mean_respiratory_rate, total_duration_minutes}, sleep_stages{deep_pct,rem_pct,light_pct,awake_pct}, total_events_count`, plus `user_profile.cohort.name`.
  - **Prompt construction** (`ollama_engine:174`): concise clinical instruction + patient line + numbers → demands *valid JSON only* with exact 6 keys.
  - **Call:** `POST {OLLAMA_HOST}/api/generate` with `{model, prompt, stream:False, options:{temperature:0.85, num_predict:620, top_p:0.92, repeat_penalty:1.15}}` timeout 70 s.
  - **Parse:** strips ``` fences, `json.loads`, fallback regex `\{[\s\S]*\}` → validates `narrative+insights+recovery_score`.
  - **Fallback:** `_fallback_report(session_data)` when model missing / call fails / JSON invalid.

#### Fallback deterministic generator `_fallback_report(dict) -> dict`
- Seeded `md5(f"{ahi:.1f}|{stability}|{hr:.0f}|{hrv:.0f}|{events}")[:8]` → same night → same varied text, different night → different text (guaranteed not generic).
- 3 rotated narratives (mention `stability, AHI, HR, HRV, resp, deep%, events, 512-D drift, CatBoost re-tune`), 7-entry insight pool (AHI, stability, HR/RMSSD, resp, deep, events, duration) → deterministic 4 picks with AHI+stability forced, 6 recommendations, 4 moods, 5 signature closes including `*WE DON'T SUPPORT 67*`. Recovery score `= min(100, stability*0.85 + (5−min(ahi,5))*3 + hrv/100*5)`.

### Dependencies
`requests`, `shutil`, `subprocess`, `urllib.request`, `hashlib`, `json`, `time`.

### Demo appearance
- **Scoring → Report:** `life-mobile/app/dashboard/night/page.tsx:537 generateAIReport()` fires in parallel with terminal animation after `POST /api/session/stop`; calls `POST /api/ai/report` with `{summary..., estimated_ahi, respiratory_stability_score, sleep_stages, total_events_count, data_source}` + `user_profile` from localStorage. Terminal line `[AI] Ollama LLM synthesizing clinical narrative (llama3.2)...` tracks it; result renders in report section (`app/dashboard/night/page.tsx:1049 AI Narrative Section`) with `aiStatus: idle/loading/ready/error`.
- **Health endpoint:** `GET /api/ai/status` (from `is_ollama_*`) drives `aiStatus` badge in scoring view (`ai: OLLAMA READY` vs `OFFLINE`).
- **Fallback visible:** When Ollama absent, jury still sees a non-trivial varied report (not "please install..." generic), proving on-device intelligence end-to-end. Rule-based prelude `ai_diagnostic_synthesis` also returned directly from `POST /api/session/stop:240`.

### Run
```bash
# check availability
curl http://localhost:8000/api/ai/status
# generate (requires backend running, or via Python)
python -c "from src.ai.ollama_engine import is_ollama_running, get_available_model; print(is_ollama_running(), get_available_model())"
python -c "from src.ai.ollama_engine import generate_sleep_report; print(generate_sleep_report({'estimated_ahi':2.3,'respiratory_stability_score':92,'summary':{'mean_heart_rate':71,'mean_rmssd_hrv':38,'mean_respiratory_rate':14.8,'total_duration_minutes':10},'sleep_stages':{'deep_pct':22,'rem_pct':24,'light_pct':46,'awake_pct':8},'total_events_count':0}))"
# full flow with model auto-pull
python -c "from src.ai.ollama_engine import ensure_ollama_ready; print(ensure_ollama_ready())"
# install manually if needed
ollama serve & ollama pull llama3.2
```

### Configuration
- Env `OLLAMA_HOST` (default `http://localhost:11434`) read at import (`ollama_engine:15`).
- Model preference order in `PREFERRED_MODELS:16` — override via `ensure_ollama_ready` argument or by pre-pulling desired model.
- Prompt temperature 0.85 / top_p 0.92 tuned for varied clinical tone without hallucinating numbers.
