# CAMERA 505 — PITCH SCRIPT STABIL (2:35) — Corelat 1:1 cu POWERPOINT.md

> **Timp total: 2:35 (2:45 cu respirație). 10 slide-uri. Fără hype, fără "5 lei vs 400 euro".**
> **Cum citești:** `[SLIDE N]` = dai click. `[beat]` = pauză 1 secundă, respiri, lași slide-ul să se vadă. Textul **bold între ghilimele** = replica exactă — o spui cuvânt cu cuvânt. Restul = indicații scenice. Vorbești continuu despre proiect, arhitectură și scripturi — nu despre prețuri.

---

## LEGENDĂ ȘI REGULI

- **Stil:** românesc, direct, tehnic dar clar. Fraze scurte. Fără superlative. Fără "revoluționar".
- **Font pe slide-uri:** JetBrains Mono / Consolas, brutalist mono #000 / #fff / #0080FF — îl menționezi doar dacă întreabă cineva de design. Nu e parte din pitch.
- **Ritm:** 10 slide-uri × ~15 secunde. Dacă rămâi în urmă, sari detaliul dintre paranteze, nu sări slide-ul.
- **Click:** dai click *după* ce termini fraza precedentă, nu în timpul ei. Lasi 1 secundă de tăcere după fiecare click.
- **Backup:** dacă pică COM3, spui "sintetic" și continui — pipeline-ul e identic.

---

## OVERVIEW TIMPI (lipeste pe laptop)

| Timp | Slide | Titlu | Ce faci |
|---|---|---|---|
| 0:00-0:05 | [SLIDE 1] | TITLE | tăcere |
| 0:05-0:25 | [SLIDE 2] | CE E CAMERA 505 | explici de ce un canal e suficient |
| 0:25-0:50 | [SLIDE 3] | CUM LUĂM SEMNALUL | două căi → același StreamManager |
| 0:50-1:10 | [SLIDE 4] | QUIZ → PRAG | quiz-ul alege cohorta și theta0/tau0 |
| 1:10-1:35 | [SLIDE 5] | NOAPTEA LIVE | DSP → ferestre 30s → transformer → WS |
| 1:35-1:55 | [SLIDE 6] | DUPĂ STOP | AHI + raport local + antrenare N→N+1 |
| 1:55-2:10 | [SLIDE 7] | CUM TESTĂM | sintetic P-QRS-T + clinice + stress |
| 2:10-2:25 | [SLIDE 8] | SCRIPTURI | tabel rapid — ce rulezi efectiv |
| 2:25-2:35 | [SLIDE 9] | CANVAS | 9 blocuri, citești 3 |
| 2:35-2:45 | [SLIDE 10] | ÎNCHIDERE | o frază, stop |

---

## [SLIDE 1 — TITLE] 0:00 — 0:05

**Pe slide:** `CAMERA 505 / SLEEP INTELLIGENCE PLATFORM / *WE DON'T SUPPORT 67*`

**Ce faci:**
- Dai click pe [SLIDE 1].
- Tăcere 2 secunde. Privești sala. Nu spui nimic.
- [beat]

**Replica (opțional, abia după 2 secunde, încet):**

> **"CAMERA 505."**

[beat] — click spre Slide 2.

**Notă scenică:** Nu te scuza, nu spune "bună ziua, mă numesc". Titlul vorbește. Dacă ai emoții, numără în gând "unu, doi" și dai click.

---

## [SLIDE 2 — CE E CAMERA 505] 0:05 — 0:25 (20s)

**Pe slide:** AD8232 pe ESP32, COM3 115200 50Hz, HR/HRV/EDR/apnee

**Replica exactă (spui asta):**

> **"CAMERA 505 este o platformă de triaj pentru apneea în somn care pleacă de la un singur canal ECG. Hardware-ul actual e un AD8232 pe ESP32, trei electrozi — RA, LA, RL — citit pe COM3 la 115200 baud, 50 de eșantioane pe secundă."**

[beat]

> **"Un singur canal e suficient pentru ce ne trebuie: ritm cardiac, variabilitate HRV, respirație derivată din ECG — EDR — și pattern-uri de apnee. Nu folosim centură toracică, nu folosim flux nazal. Un canal bine citit ne dă toate patru."**

**Indicații:**
- Arăți cu mâna spre rândul 3 de pe slide când spui "HR · HRV · EDR · apnee".
- Nu intra în detalii de filtrare aici — vine slide-ul 5.
- Dacă întreabă "de ce nu PPG?": "PPG e proxy optic, noi avem semnal electric — vezi QRS-ul direct."

---

## [SLIDE 3 — CUM LUĂM SEMNALUL] 0:25 — 0:50 (25s)

**Pe slide:** `serial_stream.py` vs `synthetic_generator.py` → `StreamManager` loop 20ms

**Replica exactă:**

> **"Semnalul intră pe două căi, dar pipeline-ul e același. Dacă avem hardware, `src/ingestion/serial_stream.py` deschide COM3 și citește pachete seriale. Dacă nu — sau pentru demo — `src/ingestion/synthetic_generator.py` generează același format, tot la 50 Hz. Testele și demo-ul folosesc sinteticul tocmai ca să fie identic cu hardware-ul."**

[beat]

> **"Ambele căi ajung în `src/ingestion/stream_manager.py`. Acolo e un loop la 20 de milisecunde: fiecare eșantion trece prin DSP, se adună în ferestre de 30 de secunde și pleacă live pe WebSocket pe `/ws/live`. Tot ce vede dashboard-ul vede și plotter-ul desktop."**

**Indicații:**
- Arăți cele două săgeți care converg spre blocul central StreamManager.
- Menționezi "20 ms" rar — dacă vezi că sala nu e tehnică, spui doar "în timp real, la fiecare eșantion".
- Nu menționa încă Pan-Tompkins — vine imediat.

---

## [SLIDE 4 — QUIZ → COHORTĂ → PRAG] 0:50 — 1:10 (20s)

**Pe slide:** `app/quiz/page.tsx` → `catboost_cohort_classifier.py` (12 cohorte) → `theta0/tau0` → `differentiable_adaptive_threshold.py`

**Replica exactă:**

> **"Înainte de prima noapte există un quiz de 9 întrebări în `life-mobile/app/quiz/page.tsx`. El nu e decorativ. E un clasificator CatBoost din `src/models/catboost_cohort_classifier.py` antrenat pe 12 cohorte clinice — SHHS, MESA, UCDDB, DREAMS, BIDMC, APNEA-ECG și altele."**

[beat]

> **"Quiz-ul alege una dintre cohorte și ne dă doi parametri: theta-zero și tau-zero din `src/models/differentiable_adaptive_threshold.py`. Theta-zero e pragul inițial de apnee, tau-zero e constanta temporală. Cu alte cuvinte, quiz-ul setează de unde pleacă pragul personalizat, nu pragul final. Pragul final se învață noapte de noapte."**

**Indicații:**
- Arăți exemplul de pe slide: "Postmenopauzal DREAMS → θ₀ 0.35" și "Healthy Adult → θ₀ 0.30".
- Subliniezi "nu e pragul final" — asta pregătește slide-ul 6 (N+1).
- Dacă ai timp, adaugi: "12 cohorte înseamnă 12 seturi de θ₀/tau₀ calibrați pe ore reale de somn."

---

## [SLIDE 5 — NOAPTEA LIVE] 1:10 — 1:35 (25s)

**Pe slide:** `ecg_dsp.py` Pan-Tompkins + EDR/HRV → ferestre 30s → `thores_foundation_model.py` 10 pași RoPE 512D → `clinical_head.py` → WS + `desktop_ecg_plotter.py`

**Replica exactă:**

> **"Dăm Start Night. Fiecare eșantion la 50 Hz intră în `src/dsp/ecg_dsp.py` — acolo rulează Pan-Tompkins pentru detecția QRS: derivată, pătrat, integrare pe fereastră de 150 ms, praguri adaptive. Din vârfurile R scoatem R-R, HRV — SDNN, RMSSD, pNN50 — și EDR, respirația derivată din modulația amplitudinii QRS. În paralel, audio intră pe 16 kHz prin `src/dsp/audio_dsp.py` pentru banda de sforăit 80–500 Hz."**

[beat]

> **"Semnalul se taie în ferestre de 30 de secunde, tokenizate și trecute prin `src/models/thores_foundation_model.py` — un Transformer cu 10 pași, RoPE, 512 dimensiuni. Din fiecare fereastră iese un embedding și, prin `src/models/clinical_head.py`, un scor de risc multimodal. Totul se vede live pe WebSocket — `/ws/live` pentru dashboard-ul Next.js și `/ws/session` pentru plotter-ul desktop `scripts/desktop_ecg_plotter.py`, osciloscop Lead-II la 60 FPS plus FFT 0–20 Hz."**

**Indicații:**
- Vorbește rar pe Pan-Tompkins — spui pașii ca o listă, nu ca o definiție.
- Când spui "60 FPS" arăți spre rândul "Vizual" de pe slide.
- Opțional (doar dacă ai 5 secunde în plus): "Dacă vreți, după pitch vă arăt 5 secunde de live pe `/demo/live` — e același pipeline."

---

## [SLIDE 6 — DUPĂ STOP: RAPORT + ANTRENARE] 1:35 — 1:55 (20s)

**Pe slide:** AHI/hypnogram/stabilitate în `stream_manager.py` → `ollama_engine.py` local → `continual_learning_engine` + `thores_foundation_model` (N+1 pleacă de unde a rămas N)

**Replica exactă:**

> **"Când dăm End Night, în `src/ingestion/stream_manager.py` calculăm AHI — evenimente pe oră — hypnograma pe stadii de somn și un scor de stabilitate. Apoi generăm raportul narativ cu `src/ai/ollama_engine.py` — llama3.2:1b local, pe :11434. Datele stau în SQLite `data/life_signals.db`, nu pleacă din cameră."**

[beat]

> **"Și, esențial, antrenăm. `src/models/continual_learning_engine.py` adaptează pragul theta-tau, iar `src/models/thores_foundation_model.py` face un pas de fine-tune pe ferestrele nopții tale. A doua noapte nu pleacă de la zero, pleacă de unde a rămas prima. Asta e personalizarea — pragul învață despre tine, nu despre populație."**

**Indicații:**
- Arăți săgeata circulară "N → N+1" de pe slide când spui ultima frază.
- Subliniezi "local" — e diferențiator fără hype. Nu spui "100% privat", spui "nu pleacă din SQLite".
- Nu intra în detalii de training (epoci, learning rate) — sunt în explication/.

---

## [SLIDE 7 — CUM TESTĂM] 1:55 — 2:10 (15s)

**Pe slide:** morfologii P-QRS-T controlate + `evaluate_clinical_test_patients.py` + `run_advanced_stress_tests.py` + `parallel_cohort_trainer.py`

**Replica exactă:**

> **"Pentru că lucrăm cu semnal fiziologic, testarea e parte din arhitectură. Generatorul sintetic din `src/ingestion/synthetic_generator.py` produce morfologii P-QRS-T controlate per scenariu — healthy, apnee, aritmie — ca să verificăm că Pan-Tompkins nu inventează bătăi."**

[beat]

> **"Evaluăm pe seturi clinice etichetate cu `scripts/evaluate_clinical_test_patients.py` — matrice de confuzie pe cohorte — facem stress cu `scripts/run_advanced_stress_tests.py` — pierdere pachete, reconectare COM, 60 FPS — și benchmark paralel pe cohorte cu `src/training/parallel_cohort_trainer.py`. Dacă trece sinteticele, trece și pe hardware real."**

**Indicații:**
- Arăți cele 4 rânduri de pe slide, unul câte unul, cu degetul.
- Fraza "dacă trece sinteticele..." e închiderea — spui-o rar, cu pauză înainte.

---

## [SLIDE 8 — SCRIPTURILE PE SCURT] 2:10 — 2:25 (15s)

**Pe slide:** tabel rapid 9 scripturi + nota `explication/scripts/README.md`

**Replica exactă (citești doar 5, restul rămâne vizual):**

> **"Pe scurt, ce rulezi efectiv. `scripts/start_all.py` e orchestratorul — pornește FastAPI pe :8000 și Next.js pe :6767 și verifică Ollama. `scripts/run_server.py` pornește doar backend-ul. `scripts/desktop_ecg_plotter.py` e osciloscopul desktop la 60 FPS — oglinda lui `/ws/live`."**

[beat]

> **"`scripts/scan_ports.py` îți confirmă AD8232 pe COM3, `scripts/train_all_pipeline.py` face pipeline-ul complet de antrenare — ESRS, CatBoost, cohorte — și `scripts/verify_demos.py` e checklist-ul pre-demo. Restul — evaluare clinică, stress, test DSP — sunt pe slide."**

[beat]

> **"Fiecare script are explicație în `explication/scripts/README.md` — ce face, ce intrări/ieșiri are, cum îl rulezi. Nu trebuie să ții minte nimic pe dinafară."**

**Indicații:**
- Nu citi tot tabelul — arăți cu mâna și spui "sunt toate aici, mono, 1:1 cu codul".
- Dacă sala e tehnică, adaugi: "Toate au `--help` și exemple în explication."
- Acesta e slide-ul care dovedește că proiectul e rulabil, nu doar povestit.

---

## [SLIDE 9 — BUSINESS MODEL CANVAS — MINI] 2:25 — 2:35 (10s)

**Pe slide:** 9 blocuri Osterwalder + fraza "Nu vindem senzor, vindem prag care învață"

**Replica exactă (citești DOAR blocurile 1, 2, 5 — restul rămâne vizual pentru Q&A):**

> **"Modelul pe o pagină, 9 blocuri. Unu — pentru cine: persoane cu suspiciune de apnee ușoară spre moderată, clinici de somnologie care au nevoie de triaj înainte de polisomnografie și programe wellness. Doi — ce rezolvăm: triaj acasă, cu hardware minimal existent, cu prag personalizat și raport explicabil — nu diagnostic, ci decizie."**

[beat]

> **"Cinci — bani: abonament lunar mic pentru monitorizare continuă și licență pentru clinici. Restul blocurilor — canale, relații, parteneri, activități, resurse, costuri — sunt pe slide pentru Q&A."**

[beat]

> **"Pe scurt: nu vindem senzor. Vindem un prag care învață despre tine, noapte de noapte."**

**Indicații:**
- Spui "restul sunt pe slide pentru Q&A" și chiar lași slide-ul vizibil 2 secunde după ce termini.
- Fraza finală o spui rar, cu pauză înainte și după. E singura frază "de ținut minte".
- Nu intra în cifre de preț — ai promis "fără hype".

---

## [SLIDE 10 — ÎNCHIDERE] 2:35 — 2:45 (10s)

**Pe slide:** `CAMERA 505 nu înlocuiește polisomnografia. Decide cine chiar are nevoie de ea.`

**Replica exactă (ultima):**

> **"CAMERA 505 nu înlocuiește polisomnografia. Decide cine chiar are nevoie de ea. Atât."**

[beat] [beat]

> **"*WE DON'T SUPPORT 67* — întrebați-ne după."**

**Indicații:**
- După "Atât." — tăcere 1 secundă. Zâmbești. Nu mai adaugi "mulțumesc pentru atenție".
- Lași slide-ul 10 pe ecran. Nu dai click în gol.
- Dacă sala râde la 67, dai din cap și spui "între pauze vă spunem". Dacă nu râde, treci direct la Q&A.

---

## Q&A — 4 întrebări anticipate (răspunsuri de 20s fiecare)

### Q1: "Ce precizie are AHI? E dispozitiv medical?"

> **"Raportăm AHI ca screening, cu disclaimer medical în raport. Validăm pe scenarii sintetice cu morfologie controlată și pe seturi clinice etichetate cu `evaluate_clinical_test_patients.py`. Nu suntem dispozitiv medical — suntem triaj. Pragul e explicabil — vezi theta-zero și tau-zero — nu decizie opacă. Dacă AHI iese 5–15, recomandăm polisomnografie, nu punem diagnostic."**

### Q2: "De ce un singur canal ECG e suficient? Nu pierdeți apneea centrală?"

> **"Un canal Lead-II ne dă R-R, HRV și EDR — respirația din modulația QRS. Apneea obstructivă lasă pattern clar: bradicardie + oprire EDR + sforăit 80–500 Hz. Apneea centrală se vede tot în EDR și HRV, dar fără sforăit — o prindem ca eveniment fără componentă acustică. Nu spunem că e perfect, spunem că e suficient pentru triaj. Pentru confirmare, tot la PSG ajungi."**

### Q3: "Unde sunt datele? Ce se întâmplă dacă pică netul?"

> **"Local. SQLite `data/life_signals.db` și modele în `local_user/{user}/model/`, LLM pe :11434. Fără cloud obligatoriu. WebSocket-ul e local — `ws://localhost:8000/ws/live`. Dacă pică netul, noaptea se înregistrează oricum; raportul se generează local cu fallback determinist dacă Ollama nu răspunde. Sincronizarea cloud e opțională și doar agregată, anonimizată."**

### Q4: "Cum dovediți că nu e doar sintetic?"

> **"Două feluri. Unu — `scripts/scan_ports.py` și `scripts/diagnose_arduino_com.py` arată COM3 live pe scenă. Doi — același cod care rulează pe sintetic rulează pe hardware: `serial_stream.py` și `synthetic_generator.py` au același format, același `StreamManager` la 20 ms. În plus, `scripts/test_hardware_connection.py` face smoke-test pe `/api/com_ports` și `/api/wifi/status`. Vrei, comutăm acum 10 secunde pe hardware real?"**

**Regulă Q&A:** Răspuns scurt, trimiți la fișier:linie. Dacă nu știi, spui "e în `explication/` — verificăm după". Nu inventezi cifre.

---

## CHECKLIST SCENĂ — cu 15 minute înainte

### Hardware & Porturi
- [ ] AD8232 alimentat 3.3V, electrozi verificați, cablu USB în COM3 (nu COM4)
- [ ] `python scripts/scan_ports.py` — vezi COM3 @115200. Dacă nu, `scripts/inspect_usb_devices.py`
- [ ] `python scripts/diagnose_arduino_com.py --port COM3` — framing OK (raw ADC / `ECG:` / JSON)
- [ ] Backup: `src/ingestion/synthetic_generator.py` gata — comuți în 5 secunde dacă pică firul

### Software
- [ ] `python scripts/start_all.py` sau `START_CAMERA_505.bat` — FastAPI :8000 + Next.js :6767 pornite
- [ ] `http://localhost:8000/docs` răspunde, `/api/status` → OK
- [ ] `http://localhost:8000/api/com_ports` → COM3 listat
- [ ] `python scripts/verify_demos.py` — toate pragurile verzi
- [ ] Ollama: `ollama list` → `llama3.2:1b` prezent; `http://localhost:11434` răspunde. Dacă nu, raportul cade pe fallback determinist — e OK, nu blochează demo-ul

### Vizual & Sunet
- [ ] `scripts/desktop_ecg_plotter.py` pornit pe al doilea ecran (60 FPS, FFT 0–20 Hz vizibil)
- [ ] `life-mobile` pe :6767 — `/demo/live` încarcă în <2s
- [ ] Slide deck: `presentation/POWERPOINT.md` exportat PDF + `presentation/deck.html` deschis în Chrome F11 (backup)
- [ ] Font JetBrains Mono instalat, fundal #000 verificat pe proiector (nu gri)
- [ ] Microfon testat — fraza "50 Hz, 20 ms, theta-zero" se aude clar în spate

### Prezentare
- [ ] Cronometru pe telefon: 2:35 target, vibrează la 2:20 (mai ai 15s)
- [ ] Apă lângă laptop, slide 1 pe ecran, lumină pe față nu pe proiector
- [ ] Replica "Nu vindem senzor, vindem prag care învață" — repetată o dată cu voce tare înainte de a intra
- [ ] Q&A: ai deschis `explication/scripts/README.md` și `POWERPOINT.md` pe al doilea tab

### Dacă ceva pică pe scenă
- COM3 dispare → spui "trecem pe sintetic, pipeline identic" → `POST /api/scenario healthy_rest`
- Ollama nu răspunde → "raportul are fallback determinist, datele rămân locale" → continui
- WS se deconectează → F5 pe dashboard, StreamManager reconectează automat la 20 ms
- Proiectorul taie marginile → treci pe `deck.html` F11, are safe-area 72px

---

## NOTĂ FINALĂ — ce nu spui pe scenă

- Nu spui "5 lei vs 400 euro", nu spui "revoluționar", nu spui "AI care diagnostichează".
- Spui: triaj, prag personalizat, screening nu diagnostic, validare în curs.
- Dacă te întreabă de prețuri, răspunzi cu Canvas blocul 5, nu cu cifre inventate.
- Dacă te întreabă de acuratețe, răspunzi cu "screening + trimitere la PSG", nu cu procente.

> **Corelare:** Acest script e 1:1 cu `presentation/POWERPOINT.md` — 10 slide-uri, aceleași titluri, aceleași fișiere. Dacă muți un slide în PowerPoint, muți și secțiunea `[SLIDE N]` aici.

---

## ANEXA A — TEXT CAP-COADĂ 2:35 (de citit la repetiție, fără indicații)

> Citești cursiv, cu pauze [beat] acolo unde vezi virgulă lungă. Cronometrează-te — trebuie să iasă 2:35.

**[SLIDE 1]** *(tăcere 2s)* "CAMERA 505." [beat]

**[SLIDE 2]** "CAMERA 505 este o platformă de triaj pentru apneea în somn care pleacă de la un singur canal ECG. Hardware-ul actual e un AD8232 pe ESP32, trei electrozi — RA, LA, RL — citit pe COM3 la 115200 baud, 50 de eșantioane pe secundă. Un singur canal e suficient pentru ce ne trebuie: ritm cardiac, variabilitate HRV, respirație derivată din ECG — EDR — și pattern-uri de apnee. Nu folosim centură toracică, nu folosim flux nazal. Un canal bine citit ne dă toate patru." [beat]

**[SLIDE 3]** "Semnalul intră pe două căi, dar pipeline-ul e același. Dacă avem hardware, `serial_stream.py` deschide COM3 și citește pachete seriale. Dacă nu — sau pentru demo — `synthetic_generator.py` generează același format, tot la 50 Hz. Testele și demo-ul folosesc sinteticul tocmai ca să fie identic cu hardware-ul. Ambele căi ajung în `stream_manager.py`. Acolo e un loop la 20 de milisecunde: fiecare eșantion trece prin DSP, se adună în ferestre de 30 de secunde și pleacă live pe WebSocket pe `/ws/live`." [beat]

**[SLIDE 4]** "Înainte de prima noapte există un quiz de 9 întrebări în `app/quiz/page.tsx`. El nu e decorativ. E un clasificator CatBoost antrenat pe 12 cohorte clinice — SHHS, MESA, UCDDB, DREAMS și altele. Quiz-ul alege una dintre cohorte și ne dă doi parametri: theta-zero și tau-zero din `differentiable_adaptive_threshold.py`. Theta-zero e pragul inițial de apnee, tau-zero e constanta temporală. Quiz-ul setează de unde pleacă pragul personalizat, nu pragul final." [beat]

**[SLIDE 5]** "Dăm Start Night. Fiecare eșantion la 50 Hz intră în `ecg_dsp.py` — Pan-Tompkins: derivată, pătrat, integrare 150 ms, praguri adaptive. Din vârfurile R scoatem R-R, HRV și EDR. Audio intră pe 16 kHz prin `audio_dsp.py` pentru banda de sforăit. Semnalul se taie în ferestre de 30 de secunde, trecute prin `thores_foundation_model.py` — Transformer 10 pași, RoPE, 512 dimensiuni — și, prin `clinical_head.py`, un scor de risc multimodal. Totul live pe WebSocket — dashboard Next.js și plotter desktop `desktop_ecg_plotter.py` la 60 FPS plus FFT." [beat]

**[SLIDE 6]** "Când dăm End Night, în `stream_manager.py` calculăm AHI, hypnograma și stabilitatea. Apoi raportul cu `ollama_engine.py` — llama3.2:1b local, datele stau în SQLite, nu pleacă. Și antrenăm: `continual_learning_engine.py` adaptează pragul, `thores_foundation_model.py` face fine-tune pe ferestrele nopții. A doua noapte nu pleacă de la zero, pleacă de unde a rămas prima." [beat]

**[SLIDE 7]** "Testarea e parte din arhitectură. Sinteticul produce morfologii P-QRS-T controlate ca să verificăm că Pan-Tompkins nu inventează bătăi. Evaluăm pe seturi clinice cu `evaluate_clinical_test_patients.py`, stress cu `run_advanced_stress_tests.py` și benchmark paralel cu `parallel_cohort_trainer.py`. Dacă trece sinteticele, trece și pe hardware real." [beat]

**[SLIDE 8]** "Ce rulezi efectiv: `start_all.py` — orchestrator FastAPI + Next.js + Ollama, `run_server.py` — doar backend, `desktop_ecg_plotter.py` — osciloscop 60 FPS, `scan_ports.py` — confirmă COM3, `train_all_pipeline.py` — pipeline complet, `verify_demos.py` — checklist pre-demo. Restul pe slide. Fiecare script are explicație în `explication/scripts/README.md`." [beat]

**[SLIDE 9]** "Modelul pe o pagină, 9 blocuri. Unu — pentru cine: suspiciune apnee ușoară/moderată, clinici de triaj, wellness. Doi — ce rezolvăm: triaj acasă, hardware minimal, prag personalizat, raport explicabil. Cinci — bani: abonament mic și licență clinici. Restul pe slide. Pe scurt: nu vindem senzor. Vindem un prag care învață despre tine, noapte de noapte." [beat]

**[SLIDE 10]** "CAMERA 505 nu înlocuiește polisomnografia. Decide cine chiar are nevoie de ea. Atât. *WE DON'T SUPPORT 67* — întrebați-ne după."

---

## ANEXA B — GLOSAR SCRIPTURI (de unde vine fiecare fișier din pitch)

| Script | Rol în pitch | Slide | Explicație detaliată |
|---|---|---|---|
| `src/ingestion/serial_stream.py` | citește COM3 115200 | 3 | `explication/src_ingestion.md` |
| `src/ingestion/synthetic_generator.py` | generează 50 Hz identic | 3, 7 | `explication/src_ingestion.md` |
| `src/ingestion/stream_manager.py` | loop 20ms, AHI, hypnogram | 3, 6 | `explication/src_ingestion.md` |
| `src/dsp/ecg_dsp.py` | Pan-Tompkins, HRV, EDR | 5 | `explication/src_dsp.md` |
| `src/dsp/audio_dsp.py` | Mel 80–500 Hz | 5 | `explication/src_dsp.md` |
| `src/models/thores_foundation_model.py` | Transformer 10 pași RoPE 512D | 5, 6 | `explication/src_models.md` |
| `src/models/clinical_head.py` | scor risc multimodal | 5 | `explication/src_models.md` |
| `src/models/catboost_cohort_classifier.py` | 12 cohorte | 4 | `explication/src_models.md` |
| `src/models/differentiable_adaptive_threshold.py` | theta0/tau0 | 4 | `explication/src_models.md` |
| `src/models/continual_learning_engine.py` | adaptează pragul N→N+1 | 6 | `explication/src_models.md` |
| `src/ai/ollama_engine.py` | raport local llama3.2 | 6 | `explication/src_ai.md` |
| `life-mobile/app/quiz/page.tsx` | quiz 9 întrebări | 4 | `explication/life_mobile.md` |
| `scripts/start_all.py` | orchestrator | 8 | `explication/scripts/README.md` |
| `scripts/run_server.py` | backend minimal | 8 | `explication/scripts/README.md` |
| `scripts/desktop_ecg_plotter.py` | plotter 60 FPS | 5, 8 | `explication/scripts/README.md` |
| `scripts/scan_ports.py` | listează COM | 8 | `explication/scripts/README.md` |
| `scripts/train_all_pipeline.py` | pipeline antrenare | 8 | `explication/scripts/README.md` |
| `scripts/evaluate_clinical_test_patients.py` | audit cohorte | 7, 8 | `explication/scripts/README.md` |
| `scripts/run_advanced_stress_tests.py` | stress WS/DB/COM | 7, 8 | `explication/scripts/README.md` |
| `src/training/parallel_cohort_trainer.py` | benchmark Soft-F1 | 7 | `explication/src_models.md` |
| `scripts/verify_demos.py` | checklist pre-demo | 8 | `explication/scripts/README.md` |

> **Regulă:** dacă juriul întreabă "unde e asta în cod?", răspunzi cu rândul din tabel — nu cauți live în explorer.

---

## ANEXA C — CE NU FACI (anti-patternuri)

- Nu deschizi codul pe proiector în timpul pitch-ului — pierzi 20 de secunde.
- Nu rulezi `train_all_pipeline.py` live — durează minute, arăți doar că există.
- Nu spui "inteligență artificială care pune diagnostic" — spui "scor de risc + trimitere la PSG".
- Nu compari prețuri — ai promis "fără hype 5 lei vs 400 euro".
- Nu ceri scuze dacă sinteticul pornește — spui "pipeline identic, comutăm pe hardware după".



