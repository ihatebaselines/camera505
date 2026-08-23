# CAMERA 505 — Presentation Kit

> **Theme:** *Signals that can shape our world*
> **Tagline:** *WE DON'T SUPPORT 67*

---

## What's in this folder

| File | What it is | Use it for |
|---|---|---|
| `slides.md` | Full technical deck, 16 slides, all real numbers | Source of truth, jury Q&A prep, reading |
| `deck.html` | Self-contained HTML slideshow of all 16 slides (1280×720) | **Main projection deck** — keyboard navigation |
| `PITCH_SCRIPT.md` | 2:30 pitch script in ROMÂNIAN, with pause/demo cues | The spoken pitch (deck stays on pitch_deck.html) |
| `pitch_deck.html` | Minimal 6-slide big-visual deck (max 8 words/slide) | Background during the 2:30 pitch |
| `README.md` | This file | Index + timing plans |

**No .pptx binaries** — the team asked for PowerPoint, but self-contained HTML decks are better: single shareable files, exact app styling (monochrome brutalist), versionable in git, and they **print to PDF** (see below). If a jury strictly needs `.pptx`, print `deck.html` to PDF and import.

---

## How to present

### Open a deck

1. Double-click `deck.html` (or `pitch_deck.html`) — opens in any browser.
2. Press **F11** for fullscreen.
3. Navigate:
   - `→` / `Space` / `PgDn` — next slide
   - `←` / `PgUp` — previous
   - `Home` / `End` — first / last
   - On-screen `◀ ▶` buttons bottom-right
4. Slides are fixed **1280×720** and auto-scale to any screen.

### Print to PDF (handout / submission)

1. Open the deck in Chrome/Edge.
2. `Ctrl+P` → Destination: **Save as PDF** → Layout: **Landscape**.
3. Enable **Background graphics**.
4. Every slide exports as one page (print layout is built in).

> Fonts: JetBrains Mono loads from Google Fonts — needs internet once. Offline it falls back to system monospace (still fine).

---

## Timing plans

### Track A — 2:30 jury pitch (follow `PITCH_SCRIPT.md`)

Keep **pitch_deck.html** on screen. Do NOT slide-chase — the 6 pitch slides map to script beats:

| Beat | Time | Pitch slide | Action |
|---|---|---|---|
| Hook | 0:00–0:15 | 1 — hook question | Ask the room, raise your own hand first |
| Problem twist | 0:15–0:35 | 2 — 1 MILIARD / 80% | [beat] before "tăcere" |
| What it is | 0:35–1:05 | 3 — product | **[show demo]** switch to `/demo/live`, hit REPLAY, narrate the 40s |
| How | 1:05–1:35 | 4 — 5 lei + telefon | Hold up the actual sensor |
| AI moment | 1:35–1:55 | 5 — AI local | "zero cloud" |
| Close | 1:55–2:10 | 6 — tagline | Say it, pause, "întrebați-ne după", stop talking |

Buffer 20s for laughter/reactions → 2:30 total.

### Track B — 10 min technical walkthrough (`deck.html`, all 16 slides)

| Slides | Time | Content |
|---|---|---|
| 1–3 | 1:30 | Title → problem → our signal |
| 4–7 | 3:00 | Architecture, DSP, RoPE transformer, CatBoost cohorts |
| 8–9 | 1:30 | Personalization + phone-as-sensor |
| 10–12 | 3:00 | Demo map → **run 40s jury mode live** → results |
| 13–16 | 1:30 | Local-first, roadmap, ask, tagline |

### Track C — 40s jury mode demo (while on slides 10–12)

`http://localhost:6767/demo/live` — deterministic, replayable:

| Phase | Seconds | What jury sees |
|---|---|---|
| BOOT | 0–4 | COM3 probe, DSP armed, 50 Hz lock |
| SIGNAL | 4–14 | Live ECG + Mel waterfall |
| ANOMALY | 14–20 | HR drops to 54, respiration → 0, correlated alert |
| AI | 20–34 | 1,440,000 frames / 412,800 beats inference log |
| REPORT | 34–40 | Stability 62/100, AHI 5.0 — MILD APNEA SUSPECT |

---

## Correlation: script ↔ tech deck

If a judge asks for depth after the pitch, jump straight to the matching slide:

| Pitch line | Tech slide |
|---|---|
| "aplicație care ascultă" | 9 (phone-as-sensor), 5 (DSP) |
| "1 miliard / 80% / 20 de fire" | 2 (problem) |
| "senzor de 5 lei + telefon" | 3 (our signal), 4 (architecture) |
| "inima încetinește la 54" | 11 (jury mode), 12 (results) |
| "matematică pe laptopul nostru" | 5–7 (DSP / transformer / CatBoost) |
| "AI care doarme lângă tine" | 13 (local-first) |
| "*WE DON'T SUPPORT 67*" | 16 — never explain it unprompted |

---

## Before you go on stage

- [ ] `START_CAMERA_505.bat` running (backend :8000, UI :6767, Ollama :11434)
- [ ] `/demo/live` opened once, REPLAY verified
- [ ] `deck.html` + `pitch_deck.html` preloaded in two browser tabs
- [ ] Physical sensor + electrodes in pocket (hold up at 1:05)
- [ ] Phone paired as bedside mic (QR on dashboard)
