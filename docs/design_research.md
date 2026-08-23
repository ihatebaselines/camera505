# THORES / LIFE — UI/UX Design Research & Visual Architecture (2026)

> **Document de Cercetare și Ghid de Design** · Camera 505 Hackathon Edition  
> Inspirat din cele mai bune aplicații medicale și de sleep tracking din lume: **Oura Ring 4**, **WHOOP 5.0**, **Apple Health (Vitals 2026)**, **SmartCare AI** și **TheAlphamerc/flutter_healthcare_app**.

---

## 🔬 1. Tendințe Cheie în Designul Medical & Sleep Tracking (2026)

### A. De la "Data Dump" la "Interpretive Health Intelligence"
- **Problema UI-urilor vechi:** Grafice aglomerate, cifre brute fără context (ex: arată doar `HR: 72, EDR: 15.2` fără explicație dacă este bine sau rău).
- **Standardul 2026 (Oura & Whoop):** Utilizatorul primește mai întâi un **scor interpretativ clar** (ex: *Respiratory Stability Score: 91/100* cu eticheta `✓ Concordant cu baseline-ul tău`).
- **Explicații în limbaj natural:** Sinteze AI scurte care traduc datele semnalelor fiziologice (ex: *"2 din cele 3 evenimente au coincis cu mișcarea corpului și schimbarea poziției — nu există tipar de apnee repetitivă"*).

### B. Arhitectura de Date pe 3 Niveluri (3-Tier Information Hierarchy)
```
┌────────────────────────────────────────────────────────┐
│ TIER 1: Overview Imediat                               │
│ • Scor zilnic de stabilitate respiratorie (91/100)     │
│ • Status live: Conectat / Baseline Calibrat            │
├────────────────────────────────────────────────────────┤
│ TIER 2: Tendințe & Evenimente                          │
│ • Hipnogramă nocturnă cu pinuri de evenimente          │
│ • Grafice pe 7 zile (Evoluție & Postură)               │
├────────────────────────────────────────────────────────┤
│ TIER 3: Deep-Dive Clinic (Power Mode)                  │
│ • Osciloscop ECG 250 Hz Pan-Tompkins                   │
│ • Spectrogramă Mel Audio 16 kHz (128 canale)           │
│ • 4-Axis Anomaly Radar (Stabilitate, Reconstrucție)    │
│ • Calibrare parametri adaptivi (θ, τ, W)               │
└────────────────────────────────────────────────────────┘
```

---

## 🎨 2. Sistemul de Design & Paleta Cromatică

### A. Culori Principale (Flutter Healthcare + Medical Dark)
| Culoare | Cod Hex | Semnificație Clinică & Utilizare |
|---|---|---|
| **Sky Blue** | `#71B4FB` | Ritm Cardiac, Semnal ECG Principal, Acțiuni Primare |
| **Emerald Vitals** | `#4CD1BC` | Respirație EDR, Scor Stabilitate, Stare Nominală |
| **Clinical Violet** | `#8873F4` | AI Transformer, Profil Pacient, Radar Multimodal |
| **Sunset Orange** | `#FA8C73` | Sforăit Audio, Detecție Acustică, Avertisment Ușor |
| **Amber Suspect** | `#F5C76B` | Eveniment Suspect (Apnee potențială, Tuse) |
| **Alert Coral** | `#FF5A79` | Risc Ridicat, Leads-Off Deconectat, Oprire Sesiune |

### B. Fundaluri & Luminozitate Obsidian (Dark Mode First)
- **Background Adânc:** `#080D1A` cu iluminare radială subtilă (`radial-gradient(circle at 50% 0%, rgba(113, 180, 251, 0.12), transparent 65%)`).
- **Suprafață Carduri (Card Surface):** `#0E1626` cu bordură `#22324C`.
- **Containere Active / Inner:** `#141F33` cu hover pe `#1B2A45`.
- **Text:** `#F8FAFC` (Text Principal), `#CBD5E1` (Text Secundar), `#7FA8B8` (Text Muted).

---

## 🧩 3. Blueprint-uri pentru Componentele Cheie

### A. Category Cards Carousel (Stilul Semnătură Flutter)
- **Dimensiuni & Formă:** Lățime 135px, Înălțime 175px, `border-radius: 24px`.
- **Cerc Decorativ Suprapus:** Bula translucidă în colțul stânga-sus (`top: -30px, left: -30px, width: 100px, height: 100px, opacity: 0.35, blur: 1px`).
- **Ancorare Text:** Valoare boldată de 28px font mono la bază, urmată de unitate colorată și etichetă descriptivă.
- **Micro-interacțiune:** La hover crește ușor (`scale: 1.02, translateY: -3px`) cu umbră colorată.

### B. Doctor / Health Metric Tile
- **Formă:** Card orizontal rotunjit la 22px cu bordură fină.
- **Icon Container:** 52×52px rotunjit la 16px cu fundal pastel translucid (15% opacitate).
- **Text:** 2 rânduri (Titlu 14px bold alb + Subtitlu 11px muted).
- **Indicator Trailing:** Valoare în format font mono colorat specific metricii.

### C. Floating Snake Bottom Navigation Bar
- **Amplasare:** Fixată jos cu `backdrop-filter: blur(20px)` și fundal `rgba(11, 17, 30, 0.95)`.
- **Indicator Activ:** Pila luminoasă animată sub iconiță (`width: 18px, height: 3px, box-shadow: 0 0 10px #71B4FB`).
- **Tab-uri:** `🏠 Home`, `📊 Report`, `⚡ Live`, `📈 History`, `📡 Device`, `👤 Profile`.

### D. QR Code Phone Pairing Card
- **Contrast:** Container alb dedicat pentru modulul QR pentru scanare instantă cu orice cameră de telefon.
- **Informații Cheie:** IP LAN direct (`http://<IP>:6767`), Cod de asociere (`LIFE-021`), buton de copiere cu feedback vizual (`✓ Copied`).

### E. Interactive Health Quiz & Cohort Selector
- **Evaluare STOP-BANG:** 4 pași scurți pentru clasificarea profilului de risc și calibrarea automată a parametrilor detectorului adaptiv ($\theta$, $\tau$, $W$).
- **Persoane Demo cu 1 Click:** Natasha (58, Sforăit), Alex (26, Atlet), Mihai (49, Risc Ridicat), Elena (34, Femeie activă).

---

## 📱 4. Strategia Responsive Dual-Mode

| Caracteristică | 📱 Mobile Studio View | 🖥️ Cockpit Monitor View |
|---|---|---|
| **Public Țintă** | Utilizator final, Pacient pe telefon | Medic, Cercetător, Prezentare Hackathon Demo |
| **Dispunere** | Cadru de smartphone centrat (400px) cu Dynamic Island | Panouri multiple pe tot ecranul (100% lățime) |
| **Vizualizări Semnal** | Osciloscop compact + carduri swipeable | Osciloscop mare + Mel Waterfall 128 canale + Radar |
| **Comenzi Rapide** | Buton mare "Start Live Monitoring" | HUD Ribbon cu comutator de scenarii simulate |
