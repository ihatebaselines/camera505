# CAMERA 505 — POWERPOINT STABIL (10 slide-uri, corelat 1:1 cu PITCH_SCRIPT.md v2.1)

> **Cum folosești:** Fiecare `## SLIDE` = 1 slide. `SCRIE PE SLIDE` = text gata de copy-paste (titlu + bullets, 8-12 linii). `CE ZICI` = replica exactă din `PITCH_SCRIPT.md` cât e slide-ul pe ecran — NU pui pe slide. `VIZUAL` = aranjare brutalist monochrome.
> Pitch total 2:40. Slide-urile 1-7 = identice ca titlu/timp cu pitch-ul. Slide 8 = interludiu scripturi (nu există în pitch, 15 sec). Slide 9 = Pitch Slide 8 (Canvas). Slide 10 = Pitch Slide 9 (Închidere). Fără hype, fără „5 lei / 400€”.

---

## SLIDE 1 — TITLE — 0:00

### SCRIE PE SLIDE

```
CAMERA 505
SLEEP INTELLIGENCE PLATFORM

*WE DON'T SUPPORT 67*

Signals that can shape our world
v2.1 · Edge-native · Clinical screening, not diagnosis
Hackathon 2026 · Single-lead ECG → triaj apnee
Dashboard  http://localhost:6767  ·  API  http://localhost:8000/docs
AD8232 + ESP32 · 50 Hz · WebSocket live · Ollama local
```

> **CE ZICI:** tăcere 2 secunde. Lași titlul să se așeze. [PITCH_SCRIPT.md — SLIDE 1 — TITLE 0:00] — „[tăcere 2 secunde]” — apoi treci la slide 2 fără să citești nimic de pe ecran.
> **VIZUAL:** bg solid #000000 pe tot slide-ul. Centrat vertical + orizontal. `CAMERA 505` — JetBrains Mono / Consolas Bold 72-80pt, #FFFFFF, tracking -2px, sharp 0 radius. `SLEEP INTELLIGENCE PLATFORM` — 16pt #888888 uppercase, letter-spacing 6px, sub titlu la 12px distanță. `*WE DON'T SUPPORT 67*` — 13pt #FFFFFF italic pe bandă #1A1A1A cu border 1px #333, padding 6px 14px, centrat. Restul footer — 11pt #888888 Mono, interlinie 1.4, la 40px de bandă. Nicio imagine, niciun logo. Tranziție: None.

---

## SLIDE 2 — CE E CAMERA 505 — De ce un singur canal ECG e suficient — 0:05-0:25

### SCRIE PE SLIDE

```
02  CE E CAMERA 505 — DE CE UN SINGUR CANAL ECG

> Platformă de triaj pentru apnee în somn, nu dispozitiv de diagnostic.

· Hardware minimal: AD8232 pe ESP32 — 3 electrozi (RA / LA / RL), Lead-II
· Achiziție: COM3 @ 115200 baud — 50 Hz continuu, pachete seriale brute
· Din 1 canal scoatem: HR (R-R) · HRV (RMSSD/SDNN) · EDR (respirație derivată) · pattern apnee
· Fără centură toracică, fără flux nazal, fără pulsoximetru obligatoriu
· Limitare asumată: triaj screening — decide cine are nevoie de PSG, nu înlocuiește PSG
· Cost / complexitate jos → poate rula toată noaptea acasă, edge-native

  Nu propunem hardware nou. Propunem un prag care învață.
```

> **CE ZICI:** [PITCH_SCRIPT.md — SLIDE 2 — CE ESTE CAMERA 505 0:05-0:25] — **„CAMERA 505 este o platformă de triaj pentru apneea în somn, care pleacă de la un singur canal ECG. Hardware-ul actual e simplu: un AD8232 pe ESP32, 3 electrozi, citit pe COM3 la 115200 baud cu 50Hz. Atât ne trebuie ca să scoatem ritm cardiac, variabilitate, respirație derivată și pattern-uri de apnee. Nu propunem hardware nou.”**
> **VIZUAL:** bg #000. Layout: header sus — `02` mare 64pt #0080FF Mono Bold stânga, titlul `CE E CAMERA 505 — DE CE UN SINGUR CANAL ECG` 22pt #FFF Bold lângă cifră, baseline aliniat. Subtitlu gri italic 13pt #888. Linie 1px #222 sub header, margine 24px. Corp: bullets `·` albastru #0080FF 14pt, text 15pt #FFF, interlinie 1.5, indent 24px. Ultima linie („Nu propunem...”) — 12pt #888 italic, cu border-left 2px #0080FF, padding-left 10px. Coloană dreaptă opțional: placeholder chenar 2px #222 cu text gri 10pt „AD8232 · Lead-II · 50 Hz” — fără foto reală dacă nu ai. Font: JetBrains Mono / Consolas peste tot, sharp 2px.

---

## SLIDE 3 — CUM LUĂM SEMNALUL — serial_stream vs synthetic, StreamManager 20ms — 0:25-0:50

### SCRIE PE SLIDE

```
03  CUM LUĂM SEMNALUL — două căi, același pipeline

HARDWARE (când ai placă):              SINTETIC (demo / test / fără placă):
  src/ingestion/serial_stream.py          src/ingestion/synthetic_generator.py
  → citește pachete COM3 → StreamManager  → generează 50 Hz, același format pachet
  → 50 Hz, raw ADC + leads_off flag       → morfologie P-QRS-T controlată, scenarii

AUDIO (opțional, paralel):
  src/ingestion/esp32_wifi_stream.py → 16 kHz → src/dsp/audio_dsp.py (Mel, 10-500 Hz sforăit/tuse)

StreamManager  src/ingestion/stream_manager.py
  loop 20 ms → ecg_dsp.py (Pan-Tompkins QRS) → R-R / HRV / EDR → fereastră 30 s → WS /ws/live
  → dashboard Next.js (life-mobile/) + desktop plotter 60 FPS + FFT 0-20 Hz
  Fallback automat: dacă COM3 nu răspunde → synthetic, fără să schimbi pipeline-ul.
```

> **CE ZICI:** [PITCH_SCRIPT.md — SLIDE 3 — CUM LUĂM SEMNALUL 0:25-0:50] — **„Semnalul intră pe două căi, dar pipeline-ul e același. Dacă avem hardware, `serial_stream.py` citește pachete seriale și le dă la `StreamManager`. Dacă nu, `synthetic_generator.py` generează același format la 50Hz — îl folosim pentru demo și pentru teste. `StreamManager` face un loop la 20 de milisecunde: fiecare eșantion trece prin `ecg_dsp.py` cu Pan-Tompkins pentru detecția QRS, de acolo scoatem R-R, HRV și EDR pentru respirație. În paralel, microfonul intră pe 16kHz prin `audio_dsp.py` pentru sforăit. Totul iese live pe WebSocket spre dashboard și spre plotter-ul desktop.”**
> **VIZUAL:** bg #000. Header ca slide 2 (`03` #0080FF 64pt). Corp pe 2 coloane sus (HARDWARE stânga / SINTETIC dreapta) — fiecare chenar border 1px #222, header gri 10pt uppercase #888, text 12pt #FFF Mono, fundal #0A0A0A. Săgeți `→` albastre #0080FF 14pt care converg în blocul central `StreamManager` (border 2px #0080FF, bg #0A0A0A, text 13pt). Sub bloc, linie mică gri 11pt: „20 ms · 30 s windows · /ws/live”. Ultima linie fallback — 11pt #888 italic. Toate căile mono, fără culori suplimentare.

---

## SLIDE 4 — QUIZ → COHORTĂ → THRESHOLD — CatBoost 12 cohorte, theta0/tau0 — 0:50-1:10

### SCRIE PE SLIDE

```
04  QUIZ → COHORTĂ → PRAG (de unde pleacă, nu unde ajunge)

Quiz 9 întrebări  life-mobile/app/quiz/page.tsx
  ↓  (vârstă, sex, BMI, gat, poziție somn, sforăit, oboseală, treziri, smartwatch)
CatBoost  src/models/catboost_cohort_classifier.py — 12 cohorte clinice
  SHHS · MESA · UCDDB · DREAMS · +8 (tineri / seniori / obezi / COPD / AFib / sarcină / central / pediatric)
  ↓  alege 1 cohortă → baseline personalizat
Prag adaptiv  src/models/differentiable_adaptive_threshold.py
  → theta0 = prag inițial apnee (ex: 0.35)  ·  tau0 = constantă temporală (ex: 0.52)
  → baseline HR/Resp/RMSSD per cohortă (ex: DREAMS postmenopauzal → HR 71, Resp 14.5, RMSSD 28)

  Quiz-ul NU e decorativ. Setează punctul de plecare al pragului care apoi învață noapte de noapte.
  Pragul final ≠ theta0. Theta0 e doar inițializarea corectă.
```

> **CE ZICI:** [PITCH_SCRIPT.md — SLIDE 4 — QUIZ-UL ALEGE PRAGUL 0:50-1:10] — **„Înainte de prima noapte există un quiz de 9 întrebări — `app/quiz/page.tsx`. El nu e decorativ. E un clasificator CatBoost antrenat pe 12 cohorte clinice care alege una dintre cohorte și ne dă doi parametri: theta0 și tau0 din `differentiable_adaptive_threshold.py`. Theta0 e pragul inițial de apnee, tau0 e constanta temporală. Cu alte cuvinte, quiz-ul setează de unde pleacă pragul personalizat, nu pragul final.”**
> **VIZUAL:** bg #000. Header `04` #0080FF. Flux vertical centrat, săgeți `↓` gri #888 18pt între blocuri. Bloc Quiz: bg #111, border 1px #222, padding 8px, text 12pt. Bloc CatBoost: bg #0A0A0A, border 1px #0080FF, lista cohortelor 11pt #FFF, „+8 (…)” gri 10pt. Bloc Prag: două coloane `theta0` / `tau0` — cifre 28pt #0080FF Bold, etichetă 10pt #888 uppercase. Exemplul DREAMS — chenar punctat 1px #333, text 11pt #BBB. Ultimele 2 linii — footer gri italic 11pt cu border-top 1px #222. Font Mono, sharp 2px.

---

## SLIDE 5 — NOAPTEA LIVE — DSP Pan-Tompkins, EDR/HRV, ferestre 30s, RoPE 512D, WS live — 1:10-1:35

### SCRIE PE SLIDE

```
05  NOAPTEA — LIVE INFERENCE (Start Night → streaming)

Eșantion 50 Hz
  → src/dsp/ecg_dsp.py — Pan-Tompkins QRS → R-R intervals → HR + HRV (RMSSD/SDNN)
  → EDR (respirație derivată din ECG, modulație amplitudine R) — fără senzor dedicat
  → src/dsp/audio_dsp.py — Mel spectrogram, energie 10-500 Hz (sforăit / tuse)

Fereastră 30 s → tokenizare → Foundation Model  src/models/thores_foundation_model.py
  Transformer 10 pași · RoPE · 512D latent · 4 SSL tasks (masked recon, contrastive, future, temporal)
  → embedding 512D / fereastră → src/models/clinical_head.py → scor risc multimodal
  → combinat cu baseline adaptiv src/models/adaptive_baseline.py → fereastră suspectă / normală

Live pe: WebSocket /ws/live + /ws/session → Next.js life-mobile/ + Desktop Plotter
  desktop_ecg_plotter.py — osciloscop Lead-II 60 FPS + FFT 0-20 Hz + marker QRS roșu
  (opțional 5 sec pe /demo/live — același pipeline comprimat în timp)
```

> **CE ZICI:** [PITCH_SCRIPT.md — SLIDE 5 — NOAPTEA: INFERENCE LIVE 1:10-1:35] — **„Dăm Start Night. Ferestre de 30 de secunde sunt tokenizate și trecute printr-un Foundation Model de 10 pași cu RoPE pe 512 dimensiuni din `thores_foundation_model.py`. Din fiecare fereastră iese un embedding și, prin `clinical_head.py`, un scor de risc multimodal. Acesta, combinat cu baseline-ul adaptiv din `adaptive_baseline.py`, decide dacă fereastra e suspectă. Vedem asta live pe WebSocket.”** [beat 1s] **„Dacă vreți, acum puteți vedea demo-ul live de 40 de secunde de pe `/demo/live` — e același pipeline, doar comprimat în timp.”**
> **VIZUAL:** bg #000. Header `05` #0080FF. Flux vertical cu indentare: săgeți `→` albastre #0080FF, etichete fișier gri #888 10pt Mono aliniate dreapta pe aceeași linie. Bloc Foundation Model — border 2px #0080FF, bg #0A0A0A, titlu 13pt #FFF Bold, detalii 11pt #BBB („10 pași · RoPE · 512D”). Sub-bloc embedding → scor — cifre 18pt #0080FF. Footer Live — două coloane: stânga WS endpoints 11pt #FFF pe fundal #111, dreapta Plotter 11pt #BBB. Notă „/demo/live” — gri italic 10pt cu border 1px dash #333. Font Mono, sharp 2-4px.

---

## SLIDE 6 — DUPĂ STOP — AHI, hypnogram, raport Ollama local, antrenare prag + foundation (N+1) — 1:35-1:55

### SCRIE PE SLIDE

```
06  DUPĂ STOP — End Night → Inference + Training (N → N+1)

1. INFERENCE (ce s-a întâmplat noaptea):
   src/ingestion/stream_manager.py → AHI (evenimente/oră) · stabilitate · arhitectură somn (stages)
   + hypnogram pe ferestre 30 s (scor per fereastră → tranziții)

2. RAPORT NARATIV (local, nu pleacă din aparat):
   src/ai/ollama_engine.py — llama3.2:1b local → raport explicabil (de ce pragul a decis așa)
   + SQLite data/life_signals.db — life-mobile nu trimite în cloud, modele în local_user/

3. ANTRENARE (de ce noaptea următoare e mai bună):
   src/models/continual_learning_engine.py → adaptează pragul diferențiabil (theta/tau) pe ferestrele tale
   src/models/thores_foundation_model.py   → fine-tune 10-step pe ferestrele nopții (1 epoch/noapte)

   Noaptea N+1 pleacă de unde a rămas N — nu de la zero. Asta e adaptarea la utilizator.
   Fără antrenare, ar fi doar un detector fix. Cu antrenare, e un prag care învață.
```

> **CE ZICI:** [PITCH_SCRIPT.md — SLIDE 6 — DUPĂ STOP: RAPORT ȘI ANTRENARE 1:35-1:55] — **„Când dăm End Night, calculăm AHI, arhitectura somnului pe stadii și un scor de stabilitate în `stream_manager.py`. Apoi generăm raportul narativ cu `ollama_engine.py` — llama3.2 local, datele nu pleacă din SQLite. Și, esențial, antrenăm: atât pragul diferențiabil, cât și modelul de fundație fac un pas de fine-tuning pe ferestrele nopții tale, prin `continual_learning_engine`. A doua noapte nu pleacă de la zero. Asta e adaptarea la utilizator.”**
> **VIZUAL:** bg #000. Header `06` #0080FF. Trei blocuri numerotate `1.` `2.` `3.` — cifre 24pt #0080FF Bold în cerc border 1px #0080FF, titlu 13pt #FFF Bold lângă. Text corp 12pt #FFF / #BBB, fișiere gri 10pt #888. Bloc 2 evidențiat cu bandă stângă 2px #0080FF (Ollama local). Bloc 3 — săgeată circulară „N → N+1” mare 20pt #0080FF în dreapta, cu etichetă 10pt #888 „continual”. Ultimele 2 linii — footer bandă #0A0A0A border 1px #222, text 11pt #FFF + 11pt #888 italic. Layout 2 coloane pe desktop: stânga 1+2, dreapta 3 cu săgeata. Mono, sharp 2px.

---

## SLIDE 7 — CUM TESTĂM — 4 tipuri teste (sintetic, clinic, stress, benchmark) — 1:55-2:10

### SCRIE PE SLIDE

```
07  CUM TESTĂM — fără testare, semnalul physiological e doar zgomot

□ SINTETIC — morfologie P-QRS-T controlată
  src/ingestion/synthetic_generator.py — scenarii healthy / apnee / aritmie / leads_off
  → verifică că Pan-Tompkins nu inventează bătăi; același format pachet ca hardware-ul

□ CLINIC — evaluare pe seturi etichetate
  scripts/evaluate_clinical_test_patients.py — 100 cazuri / 12 cohorte + PhysioNet (A01..C03)
  → MAE / RMSE / R² · accuracy per severity tier (Normal/Mild/Moderate/Severe)

□ STRESS — rAF 60 FPS, pierdere pachete, reconectare COM
  scripts/run_advanced_stress_tests.py + scripts/verify_demos.py — switch rapid scenarii, WS load, DB writes
  → dacă pică aici, pică și la 03:00 când cade electrodul

□ BENCHMARK COHORTĂ — antrenare paralelă + metrici
  src/training/parallel_cohort_trainer.py — 12 cohorte în paralel, Soft-F1, throughput samples/sec
  → cohort_baselines_12.json în foundation_models/

  Dacă trece sinteticele + clinice, trece și pe hardware real. Testarea e parte din arhitectură.
```

> **CE ZICI:** [PITCH_SCRIPT.md — SLIDE 7 — CUM TESTĂM 1:55-2:10] — **„Pentru că lucrăm cu semnal fiziologic, testarea e parte din arhitectură. Generatorul sintetic produce morfologii P-QRS-T controlate ca să verificăm că Pan-Tompkins nu inventează bătăi. Evaluăm pe seturi clinice cu `evaluate_clinical_test_patients.py`, facem teste de stres pe stream și benchmark-uri paralele pe cohorte. Dacă trece sinteticele, trece și pe hardware real.”**
> **VIZUAL:** bg #000. Header `07` #0080FF. 4 rânduri, fiecare cu pătrat alb 12×12px border 1px #FFF (brutalist checkbox gol), titlu 13pt #FFF Bold, subtitlu 11pt #BBB, fișier 10pt #888 Mono pe linie separată indentată 20px. Separator orizontal 1px #1A1A1A între rânduri. Ultima linie footer — 11pt #888 italic pe bandă #0A0A0A, border-top 1px #222. Fără iconițe color, doar pătrate albe + text mono. Sharp 2px.

---

## SLIDE 8 — SCRIPTURI PE SCURT — ce rulezi, când, de ce — (interludiu 15 sec)

### SCRIE PE SLIDE

```
08  SCRIPTURI PE SCURT — 8 comenzi care acoperă tot pipeline-ul

┌──────────────────────────────┬────────────────────────────────────────────┬─────────────────────────────┐
│ Nume                         │ Ce face                                    │ Când îl rulezi              │
├──────────────────────────────┼────────────────────────────────────────────┼─────────────────────────────┤
│ scripts/start_all.py         │ Orchestrator complet: FastAPI :8000 +      │ One-click demo / juriu —    │
│                              │ Next.js :6767 + Ollama check + browser     │ START_CAMERA_505.bat în Py  │
├──────────────────────────────┼────────────────────────────────────────────┼─────────────────────────────┤
│ scripts/run_server.py        │ Doar backend uvicorn src.backend.app:app   │ Dev backend fără frontend   │
├──────────────────────────────┼────────────────────────────────────────────┼─────────────────────────────┤
│ scripts/desktop_ecg_plotter  │ Osciloscop Tkinter 60 FPS + FFT 0-20 Hz ·   │ Vrei osciloscop nativ pe    │
│ .py                          │ Pan-Tompkins live · HRV RMSSD              │ desktop, lângă dashboard    │
├──────────────────────────────┼────────────────────────────────────────────┼─────────────────────────────┤
│ scripts/scan_ports.py        │ Listează COM via serial.tools.list_ports   │ Nu vezi COM3 / COM4 în UI   │
├──────────────────────────────┼────────────────────────────────────────────┼─────────────────────────────┤
│ scripts/diagnose_arduino_    │ Deschide COM, citește linii, clasifică     │ COM deschis dar 0 bytes /   │
│ com.py --port COM3           │ framing (raw ADC / ECG: / JSON / CSV)      │ framing neclar              │
├──────────────────────────────┼────────────────────────────────────────────┼─────────────────────────────┤
│ scripts/train_all_pipeline   │ Pipeline cap-coadă: dataset 10k → CatBoost │ Prima dată / după reset     │
│ .py                          │ → 12 cohorte → foundation 512D → local_user│ TRAIN_ALL_CAMERA_505.bat    │
├──────────────────────────────┼────────────────────────────────────────────┼─────────────────────────────┤
│ scripts/evaluate_clinical_   │ Audit clinic: 100 cazuri + PhysioNet ·     │ Vrei MAE / R² / tier acc    │
│ test_patients.py             │ MAE, RMSE, R², confusion per tier          │ înainte de prezentare       │
├──────────────────────────────┼────────────────────────────────────────────┼─────────────────────────────┤
│ scripts/verify_demos.py      │ Checklist pre-demo: /api/status, /ws/live  │ Cu 5 min înainte de demo —  │
│                              │ /com_ports, benchmark thresholds           │ dacă pică aici, repari      │
└──────────────────────────────┴────────────────────────────────────────────┴─────────────────────────────┘

  Toate: python scripts/<nume>.py  ·  vezi explication/scripts/README.md pentru detalii per script.
```

> **CE ZICI:** (nu există în pitch — interludiu 15 sec între testare și Canvas) — **„Înainte de modelul de business, 15 secunde despre cum rulezi tot ce ai văzut. Nu e teorie — sunt 8 scripturi. `start_all.py` pornește tot — backend, frontend și Ollama — un singur click pentru juriu. `run_server.py` e doar backend-ul când lucrezi fără UI. `desktop_ecg_plotter.py` e osciloscopul nativ 60 FPS dacă vrei semnalul pe desktop, nu doar în browser. `scan_ports.py` și `diagnose_arduino_com.py` sunt pentru hardware — vezi dacă COM3 există și ce framing scoate placa. `train_all_pipeline.py` e antrenarea cap-coadă — 10.000 de pacienți, CatBoost, 12 cohorte și foundation modelul. `evaluate_clinical_test_patients.py` îți dă cifrele clinice — MAE, RMSE, R² pe 100 de cazuri. `verify_demos.py` e checklist-ul cu 5 minute înainte de demo — dacă trece ăsta, trece și prezentarea.”** — nu citi tabelul rând cu rând, lasă-l vizual.
> **VIZUAL:** bg #000. Header `08` #0080FF + titlu 18pt #FFF. Tabel brutalist: border 1px #222, header gri #888 uppercase 10pt, celule 10-11pt #FFF Mono, fundal rânduri alternând #000 / #0A0A0A, coloana Nume — 11pt #0080FF Bold. Lățimi: Nume 28% | Ce face 42% | Când 30%. Font JetBrains Mono / Consolas. Tabelul ocupă 85% din înălțimea slide-ului, fără să-l înghesui — dacă nu încape pe un slide, împarte în 2 coloane sau micșorează la 9pt dar păstrează lizibil. Footer 10pt #888 italic sub tabel. Sharp 2px, fără rotunjiri, fără culori în plus.

---

## SLIDE 9 — BUSINESS MODEL CANVAS — mini 9 blocuri (Osterwalder) — 2:10-2:30

### SCRIE PE SLIDE

```
09  BUSINESS MODEL CANVAS — o pagină, 9 blocuri (specific CAMERA 505)

┌─────────────────┬──────────────────┬─────────────────┐
│ 1 SEGMENTE      │ 2 PROPUNERE      │ 3 CANALE        │
│ Persoane susp.  │ Triaj acasă,     │ Dashboard web   │
│ apnee ușoară/   │ hardware minimal │ :6767 + reco    │
│ moderată ·      │ prag personalizat│ medic familie   │
│ clinici somnolog│ raport explicabil│ (nu App Store)  │
│ angajatori well.│ nu cutie neagră  │                 │
├─────────────────┼──────────────────┼─────────────────┤
│ 4 RELAȚII       │ 5 VENITURI       │ 6 PARTENERI     │
│ Self-service +  │ Abonament lunar  │ Furnizori       │
│ raport explicab.│ mic monitorizare │ ESP32/AD8232 ·  │
│ suport Q&A, nu  │ licență clinici  │ lab. somn valid.│
│ call center     │ (triaj, nu diag) │ date etichetate │
├─────────────────┼──────────────────┼─────────────────┤
│ 7 ACTIVITĂȚI    │ 8 RESURSE        │ 9 COSTURI       │
│ Ingestie · DSP  │ Date etichetate  │ Dezvoltare ·    │
│ modele personal.│ timp ingineri ·  │ validare clinică│
│ inferență edge  │ modele local_user│ suport · HW     │
│ WS live         │ foundation_models│ (fără cloud)    │
└─────────────────┴──────────────────┴─────────────────┘

  Nu vindem senzor de 5 lei. Vindem un prag care învață — noapte de noapte, pe datele tale, local.
```

> **CE ZICI:** [PITCH_SCRIPT.md — SLIDE 8 — BUSINESS MODEL CANVAS — MINI 2:10-2:30] — **„Pe scurt, modelul de business — un Canvas pe o pagină:”** **„Pentru cine: persoane cu suspiciune de apnee ușoară spre moderată, clinici de somnologie care au nevoie de triaj înainte de polisomnografie, și angajatori pentru programe de prevenție.”** **„Ce rezolvăm: triaj accesibil acasă, cu hardware minimal, cu un prag care se personalizează — nu un diagnostic, ci o decizie despre cine chiar are nevoie de clinică.”** **„Cum ajungem și cum ținem legătura: direct prin dashboard-ul web și la recomandarea medicului; relație self-service, dar raportul e explicabil, nu o cutie neagră.”** **„Bani: abonament lunar mic pentru monitorizare continuă și licență pentru clinici. Parteneri: furnizori ESP32/AD8232 și laboratoare de somn pentru validare. Ce facem bine: ingestie, DSP, modele personalizate și inferență edge. Ce ne trebuie: date etichetate, timp de ingineri și validare clinică. Costuri: dezvoltare, validare și suport.”** [beat] **„Nu vindem un senzor. Vindem un prag care învață despre tine, noapte de noapte.”** — pe slide citești doar blocurile 1, 2, 5 pe scurt, restul rămân vizuale pentru Q&A.
> **VIZUAL:** bg #000. Header `09` #0080FF. Grilă 3×3, border 1px #222, gap 1px #222 (linii vizibile). Fiecare celulă: header 10pt #888 uppercase Mono Bold cu număr albastru #0080FF 12pt în față („1 SEGMENTE”), corp 11pt #FFF Mono, interlinie 1.3, fundal #0A0A0A. Celula evidențiată (2 PROPUNERE) — border 1px #0080FF. Sub grilă, bandă #111 border 1px #222, text 11pt #FFF italic + #888. Font Mono, sharp 2px. Păstrează brutalist — fără iconițe, fără culori pe celule.

---

## SLIDE 10 — ÎNCHIDERE — nu înlocuiește PSG, decide cine are nevoie — 2:30-2:40

### SCRIE PE SLIDE

```
CAMERA 505 nu înlocuiește polisomnografia.
Decide cine chiar are nevoie de ea.

*WE DON'T SUPPORT 67* — întrebați-ne după.

v2.1 · Edge-native · Screening, not diagnosis
Cod + docs: explication/ · scripts/ · presentation/PITCH_SCRIPT.md
```

> **CE ZICI:** [PITCH_SCRIPT.md — SLIDE 9 — ÎNCHIDERE 2:30-2:40] — **„CAMERA 505 nu încearcă să înlocuiască polisomnografia. Încearcă să decidă cine chiar are nevoie de ea. Atât.”** *„WE DON'T SUPPORT 67 — întrebați-ne după.”* — zâmbești, lași slide-ul 3 secunde, închizi.
> **VIZUAL:** bg #000. Centrat vertical. Rând 1-2: `CAMERA 505 nu înlocuiește polisomnografia.` 22pt #888 Mono Regular, `Decide cine chiar are nevoie de ea.` 26pt #FFFFFF Mono Bold, interlinie 1.4, aliniat centru. Rând 3: `*WE DON'T SUPPORT 67* — întrebați-ne după.` 42-54pt #FFFFFF Mono Bold, tracking -1px, la 28px sub. Rând 4-5 footer: 11pt #888 Mono, la 48px sub, cu linie 1px #222 deasupra (lățime 40%, centrată). Nicio animație. Ține slide-ul 3 secunde în tăcere înainte de Q&A.

---

## ANEXA — DOCUMENTAȚIE SCRIPTURI (detaliu rapid, nu se prezintă — rămâne pentru Q&A / PDF)

> Nu pui anexa pe ecran în pitch. O lași în PDF-ul exportat după slide 10 sau o ai la îndemână când întreabă juriul „cum rulez X?”.

| Nume | Path | Ce face (1-2 linii) | Input → Output | Comandă |
|---|---|---|---|---|
| **start_all.py** | `scripts/start_all.py` | Orchestrator master: pornește FastAPI :8000 + Next.js :6767 (npm run dev) + probează Ollama, deschide browser, supraveghează procese cu restart. | citește `src/backend/config.py:HOST/PORT`, `life-mobile/package.json` → loguri prefixate [BACKEND]/[FRONTEND] | `python scripts/start_all.py` sau `START_CAMERA_505.bat` |
| **run_server.py** | `scripts/run_server.py` | Launcher minimal doar-backend (uvicorn src.backend.app:app) fără frontend. Pentru dev izolat. | `HOST/PORT` din config → `http://localhost:8000/docs` | `python scripts/run_server.py` |
| **desktop_ecg_plotter.py** | `scripts/desktop_ecg_plotter.py` | Osciloscop desktop Tkinter 60 FPS — oglindă nativă pentru `life-mobile/components/EcgOscilloscope.tsx`. Plot ECG 10-bit + FFT 0-20 Hz, marker QRS, HRV RMSSD, badge leads_off. WS /ws/live sau serial direct. | COM5 115200 sau WS → fereastră 1280×820 | `python scripts/desktop_ecg_plotter.py` / `start_ecg_studio.bat` / `GET /api/launch-ecg-studio` |
| **scan_ports.py** | `scripts/scan_ports.py` | Enumeră COM-uri via `serial.tools.list_ports.comports()` + probează COM1..32 la 115200. Confirmă AD8232 pe COM3 / CSI pe COM4. | — → listă `device: description (hwid)` + `active: [COMx]` | `python scripts/scan_ports.py` |
| **diagnose_arduino_com.py** | `scripts/diagnose_arduino_com.py` | Diagnostic țintit ESP32/Arduino — deschide COM cu DTR/RTS reset, testează 115200/9600/57600, citește 3 sec, clasifică framing (raw ADC vs `ECG:` vs JSON vs CSV) via `SerialEcgReader._parse_line`. | `--port COM3` → RX lines + verdict BUSY/OK/0 bytes | `python scripts/diagnose_arduino_com.py --port COM3` |
| **train_all_pipeline.py** | `scripts/train_all_pipeline.py` | Pipeline cap-coadă: generează 10k ESRS → antrenează CatBoost ESRS (300 trees) → parallel cohort 12 (206k ore) → foundation 512D RoPE 4 SSL → deploy în `local_user/alex_runner/model/`. | `data/catboost_esrs_dataset.csv` → `foundation_models/*.cbm/.pt/.json` + `checkpoints/` | `python scripts/train_all_pipeline.py` sau `TRAIN_ALL_CAMERA_505.bat` |
| **evaluate_clinical_test_patients.py** | `scripts/evaluate_clinical_test_patients.py` | Audit clinic: real PhysioNet A01..C03 (8h PSG) + 100 cazuri sintetice 12 cohorte + 2k holdout CatBoost + foundation 4 SSL losses. Raportează MAE/RMSE/R²/tier acc. | `data/*.npz`, `foundation_models/*.cbm/.pt` → tabel consolă + metrics | `python scripts/evaluate_clinical_test_patients.py` |
| **verify_demos.py** | `scripts/verify_demos.py` | Checklist pre-demo 7 scenarii (healthy, snoring, osa, arrhythmia, cough, postmenopause, leads-off) — verifică distinct HR/leads_off/audio + scoruri locale + fallback dezactivat pe leads-off. | `SyntheticPhysiologicalGenerator` 250 steps → PASS/FAIL | `python scripts/verify_demos.py` |
| **run_advanced_stress_tests.py** | `scripts/run_advanced_stress_tests.py` | Stress suite — switch rapid scenarii (apnee/aritmie/leads_off), load WS, DB writes concurente, rAF. | — → raport stress | `python scripts/run_advanced_stress_tests.py` |
| **test_dsp_and_models.py** | `scripts/test_dsp_and_models.py` | Unit offline DSP/model — trece ECG 30s sintetic prin `EcgDspProcessor`, `AudioDspProcessor`, `LifeMultimodalTransformer`, assert HRV/RoPE/token shapes. | sintetic 30s → assert shapes | `python scripts/test_dsp_and_models.py` |

Alte scripturi utile (nu pe slide, dar în `explication/scripts/README.md`): `run_esp32_live.py` (ingestie headless), `inspect_usb_devices.py` (USB VID/PID), `test_hardware_connection.py` (smoke-test /api/com_ports + /ws), `install_cp210x_driver.py` + `get_cp210x_exe.py` (driver SiLabs), `menu_trainer.py` (TUI pentru `menu.bat`).

---

## CORELAȚIE RAPIDĂ PITCH ↔ SLIDES ↔ ACȚIUNE

| Pitch (PITCH_SCRIPT.md) | PowerPoint | Timp | Acțiune la click |
|---|---|---|---|
| [SLIDE 1 — TITLE] | **SLIDE 1 — TITLE** | 0:00 | Tăcere 2 sec. Lași titlul. Fără să vorbești. |
| [SLIDE 2 — CE ESTE CAMERA 505] | **SLIDE 2 — CE E** | 0:05-0:25 | Arăți „un singur canal” — du mâna spre bullet HR/HRV/EDR. |
| [SLIDE 3 — CUM LUĂM SEMNALUL] | **SLIDE 3 — CUM LUĂM SEMNALUL** | 0:25-0:50 | Arăți cele 2 săgeți care converg în StreamManager. |
| [SLIDE 4 — QUIZ-UL ALEGE PRAGUL] | **SLIDE 4 — QUIZ → COHORTĂ → PRAG** | 0:50-1:10 | Arăți exemplul DREAMS (θ₀=0.35, τ₀=0.52). |
| [SLIDE 5 — NOAPTEA: INFERENCE LIVE] | **SLIDE 5 — NOAPTEA LIVE** | 1:10-1:35 | Flux vertical DSP → RoPE → WS. Opțional comuți 5 sec pe `/demo/live`. |
| [SLIDE 6 — DUPĂ STOP: RAPORT ȘI ANTRENARE] | **SLIDE 6 — DUPĂ STOP** | 1:35-1:55 | Arăți săgeata circulară N → N+1. |
| [SLIDE 7 — CUM TESTĂM] | **SLIDE 7 — CUM TESTĂM** | 1:55-2:10 | 4 rânduri cu pătrat alb — nu citi tot, spune „parte din arhitectură”. |
| — (interludiu, nu există în pitch) | **SLIDE 8 — SCRIPTURI PE SCURT** | ~2:10 (15 sec) | Tabel 8 scripturi — „nu citi rând cu rând, lasă vizual”. Sari dacă ești în întârziere. |
| [SLIDE 8 — BUSINESS MODEL CANVAS — MINI] | **SLIDE 9 — BUSINESS MODEL CANVAS** | 2:10-2:30 | Grilă 3×3 — citești doar blocurile 1, 2, 5 pe scurt. Restul pentru Q&A. |
| [SLIDE 9 — ÎNCHIDERE] | **SLIDE 10 — ÎNCHIDERE** | 2:30-2:40 | „Nu înlocuiește PSG…” + zâmbet la 67. Ține 3 sec. |
| Q&A | ANEXA SCRIPTURI (PDF) | 2:40+ | Ai tabelul detaliat la îndemână pentru „cum rulez X?”. |

> Notă de timing: Slide 8 (scripturi) e interludiu — dacă pitch-ul trebuie să rămână fix 2:30, îl prezinți ca „slide de tranziție” în 10-15 sec între 2:05-2:20 și scurtezi cu 5 sec SLIDE 7 și SLIDE 9. Altfel, pitch-ul devine 2:55 — acceptabil dacă juriul permite.

---

## SETUP POWERPOINT — 2 minute (brutalist monochrome)

1. **New → Blank → 16:9** — Design → Slide Size → Widescreen 16:9 (1280×720). Aplică la toate.
2. **Slide Master** — View → Slide Master → selectează Master-ul mare → Background → Solid Fill **#000000** → Apply to All. Font: setează **JetBrains Mono** peste tot (dacă lipsește, **Consolas**). Titluri Bold, corp Regular.
3. **Paletă** — doar 4 culori: bg **#000**, text **#FFF**, cifre/accent **#0080FF**, gri secundar **#888**, border **#222** / **#1A1A1A**. Fără gradient, fără shadow, fără rotunjiri (sharp 2-4px max dacă insiști).
4. **Copiază textul** — din fiecare `SCRIE PE SLIDE` de mai sus, copy-paste verbatim în slide. Titluri 22-26pt #FFF Bold, cifre slide 64pt #0080FF Bold, corp 12-15pt #FFF, etichete fișiere 10pt #888, footer 11pt #888 italic.
5. **Aranjare** — header: cifră #0080FF stânga + titlu #FFF, linie 1px #222 sub (24px margine). Corp bullets cu `·` sau `→` albastre, indent 24px, interlinie 1.4-1.5. Tabele: border 1px #222, header #888 uppercase 10pt, celule Mono 10-11pt.
6. **Tranziții** — Transitions → None (sau Fade 0.30s). **Fără animații pe bullets.** Un click = un slide. Atât.
7. **Export** — File → Save As `CAMERA505_v2.1_stabil.pptx` + Export → PDF `CAMERA505_v2.1_stabil.pdf` (backup dacă nu se deschide pptx-ul pe laptop-ul juriului).
8. **Alternativ rapid (fără PowerPoint)** — deschizi `presentation/deck.html` în browser → `F11` fullscreen — același stil brutalist, deja corelat cu pitch-ul, zero setup.

> Verificare finală 30 sec: rulează `python scripts/verify_demos.py` și `python scripts/scan_ports.py` înainte să intri — dacă trec, ești stabil. Dacă nu, pornești pe synthetic (fallback automat, nu se vede).

---

*Ultima linie: nu uita — WE DON'T SUPPORT 67. Întreabă juriul după.*
