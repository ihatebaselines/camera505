# LIFE System Architecture & Scientific Reference

## 1. Executive Summary

**LIFE (Multimodal Adaptive Physiological Intelligence)** is a signal-driven cardiorespiratory foundation monitoring system designed for the *"Signals That Can Change The World"* hackathon. 

Traditional physiological wearables rely heavily on expensive, multi-sensor hardware arrays (PPG, SpO2 clips, chest stretch bands, IMU motion sensors) or static population-wide thresholds (e.g. `HR > 100 BPM`). LIFE fundamentally rethinks this paradigm by combining:
1. **A minimal, low-cost single-lead ECG front-end** (AD8232 + ESP32)
2. **Ambient smartphone audio** (built-in microphone)
3. **A self-supervised multimodal transformer foundation model** (cross-attention, RoPE, contrastive learning)
4. **Personalized adaptive thresholding** ($\mu, \sigma$ continuous distribution modeling)

---

## 2. Digital Signal Processing (DSP) Mathematical Pipeline

### 2.1 ECG Preprocessing & Filtering
- **Powerline Notch Filter**:
  A 2nd-order IIR Notch filter tuned to $f_0 = 50.0\text{ Hz}$ (or $60.0\text{ Hz}$ in the US) with quality factor $Q = 30$:
  $$H_{\text{notch}}(z) = \frac{1 - 2\cos(\omega_0)z^{-1} + z^{-2}}{1 - 2r\cos(\omega_0)z^{-1} + r^2 z^{-2}}$$
- **Butterworth Bandpass Filter**:
  A 2nd-order bandpass filter ($0.5\text{ Hz} - 40.0\text{ Hz}$) removes low-frequency baseline drift and high-frequency EMG muscle artifacts.

### 2.2 Pan-Tompkins QRS & R-Peak Detection
1. **Derivative Operator**:
   $$y[n] = \frac{1}{8} \left(2x[n] + x[n-1] - x[n-3] - 2x[n-4]\right)$$
2. **Non-Linear Squaring**:
   $$s[n] = (y[n])^2$$
3. **Moving Window Integration (MWI)**:
   $$z[n] = \frac{1}{W} \sum_{k=0}^{W-1} s[n-k], \quad W = 0.150 \times f_s$$
4. **Dual Adaptive Thresholding**:
   $$\text{Threshold}_{I1} = \text{NPKI} + 0.25 \times (\text{SPKI} - \text{NPKI})$$
   $$\text{SPKI} = 0.125 \times \text{Peak} + 0.875 \times \text{SPKI}$$

### 2.3 Heart Rate Variability (HRV) Formulations
- **Time Domain**:
  $$\text{SDNN} = \sqrt{\frac{1}{N-1} \sum_{i=1}^N (RR_i - \overline{RR})^2}$$
  $$\text{RMSSD} = \sqrt{\frac{1}{N-1} \sum_{i=1}^{N-1} (RR_{i+1} - RR_i)^2}$$
  $$\text{pNN50} = \frac{\sum \mathbb{I}(|RR_{i+1} - RR_i| > 50\text{ ms})}{N-1} \times 100\%$$
- **Poincaré Plot Non-Linear Dynamics**:
  $$SD1 = \sqrt{\frac{1}{2}\text{RMSSD}^2}, \quad SD2 = \sqrt{2\,\text{SDNN}^2 - \frac{1}{2}\text{RMSSD}^2}$$

### 2.4 ECG-Derived Respiration (EDR)
Respiration induces periodic mechanical thoracic impedance changes and heart electrical axis rotation, causing **QRS Amplitude Modulation (RAM)** and **Respiratory Sinus Arrhythmia (RSA)**:
$$A_{\text{QRS}}(t) = \alpha_{\text{resp}} \sin(2\pi f_{\text{resp}} t) + A_0$$
The breathing rate is extracted continuously from the envelope periodicity without requiring an external chest stretch band.

---

## 3. Multimodal Transformer Foundation Architecture

```
30s ECG (7,500 pts)   --> 1D-CNN Encoder (stride=125)   --> 60 ECG Tokens (d=512)
30s Mel (128x3000)     --> 2D-CNN Encoder (stride=50)    --> 60 Audio Tokens (d=512)
                                                                 │
                                                    [CLS] Token + RoPE Encoding
                                                                 │
                                                                 ▼
                                                  Multimodal Transformer (Shared Latent Space)
                                                                 │
                                                                 ▼
                                                512-dim Unified Window Embedding
```

### 3.1 Rotary Positional Embedding (RoPE)
Given token dimension pair $(x_m, y_m)$ at sequence index $m$:
$$\begin{pmatrix} x'_m \\ y'_m \end{pmatrix} = \begin{pmatrix} \cos(m\theta) & -\sin(m\theta) \\ \sin(m\theta) & \cos(m\theta) \end{pmatrix} \begin{pmatrix} x_m \\ y_m \end{pmatrix}, \quad \theta_i = 10000^{-2(i-1)/d}$$

### 3.2 The 4 Self-Supervised Foundation Objectives

1. **Masked Token Reconstruction (BERT / MAE)**:
   $$\mathcal{L}_{\text{mask}} = \frac{1}{|M|} \sum_{i \in M} \| \hat{E}_i - E_i \|_2^2$$
2. **Cross-Modal Contrastive Alignment (InfoNCE)**:
   For synchronized batch of ECG tokens $z_i^E$ and Audio tokens $z_i^A$:
   $$\mathcal{L}_{\text{contrast}} = -\frac{1}{2B} \sum_{i=1}^B \left( \log \frac{\exp(z_i^E \cdot z_i^A / \tau)}{\sum_{j} \exp(z_i^E \cdot z_j^A / \tau)} + \log \frac{\exp(z_i^A \cdot z_i^E / \tau)}{\sum_{j} \exp(z_i^A \cdot z_j^E / \tau)} \right)$$
3. **Future Window Dynamics Prediction**:
   $$\mathcal{L}_{\text{future}} = \alpha \left(1 - \frac{f(E_t) \cdot E_{t+1}}{\|f(E_t)\| \|E_{t+1}\|}\right) + (1-\alpha) \|f(E_t) - E_{t+1}\|_2^2$$
4. **Temporal Consistency Regularization**:
   $$\mathcal{L}_{\text{cons}} = \frac{1}{T-1} \sum_{t=1}^{T-1} \|E_{t+1} - E_t\|_2^2$$

---

## 4. Personalized Adaptive Baseline & Dynamic Thresholding

Instead of static arbitrary clinical cutoffs, LIFE models an individual's resting state as a Gaussian distribution:
$$x_{\text{vital}} \sim \mathcal{N}(\mu_{\text{baseline}}, \sigma_{\text{baseline}}^2)$$

$$\text{Threshold}(t) = \mu(t) \pm k \cdot \sigma(t)$$

### Selective Updating Rule
To prevent the model from learning a persistent nocturnal pathology (such as repeated sleep apnea episodes) as the person's "new normal", updates to $(\mu, \sigma)$ occur **strictly during verified stable/normal periods**:
$$\mu(t+1) = \begin{cases} \alpha \mu(t) + (1-\alpha) x(t) & \text{if } \text{AnomalyScore}(t) < 0.35 \\ \mu(t) & \text{otherwise} \end{cases}$$

---

## 5. The 4-Quadrant Anomaly Radar

| Anomaly Metric | What it Detects | Calculation Method |
| :--- | :--- | :--- |
| **Stability Score** | Short-term signal regularity | Inverse Euclidean distance between consecutive window embeddings: $\frac{1}{1 + 0.5\|E_t - E_{t-1}\|}$ |
| **Reconstruction Error** | Unseen morphological shapes | Masked autoencoder reconstruction loss at 40% masking |
| **Prediction Error** | Abrupt transition dynamics | Cosine distance $1 - \cos(\hat{E}_{t+1}, E_{t+1})$ |
| **Drift Score** | Long-term chronic shifts | Cosine distance between current night embedding and 30-night baseline history |
