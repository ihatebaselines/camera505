# src/models — Learning & Decision Models

> Transformer foundation, adaptive thresholds, clinical scoring, and continual learning.

---

## `src/models/__init__.py`
Package marker.

---

## `src/models/transformer_backbone.py:LifeMultimodalTransformer` (244 lines)

### Purpose
Self-supervised **multimodal foundation encoder** — fuses 30-s ECG + Mel audio into a **512-D unified window embedding** for anomaly scoring, drift, and clinical head. Shares latent space via RoPE + cross-modal attention.

### Inputs / Outputs
- **In:** `forward(ecg_raw: [B,7500] or [B,1,7500], audio_mel: [B,128,n_frames]≈[B,1,128,3000], mask_ratio=0.0)`
- **Out dict:** `window_embedding [B,512]` (CLS token), `ecg_tokens [B,60,512]`, `audio_tokens [B,60,512]`, `all_tokens [B,121,512]`, `pred_resp_rate [B,1]` (=ReLU(linear)+5), `pred_snore [B,1]` (=Sigmoid).
- **Tokenization:** `EcgPatchEncoder` 7500→60 tokens via 3× Conv1d stride 5 (5×5×5=125 samples=0.5 s/token) + BN+GELU; `AudioPatchEncoder` 128×T→60 tokens via 3× Conv2d stride (2,2)/(2,2)/(2,3) + `AdaptiveAvgPool2d((1,60))`. Each + learned modality embedding + `RoPE`.
- **Positional:** `RotaryPositionalEmbedding(dim=512, max_seq=122)` — `inv_freq=10000^{-2i/d}`, `freqs=einsum(t,inv_freq)`, `rotate_half` (`transformer_backbone:30`).
- **Backbone:** `n_layers=3` × `MultimodalTransformerLayer(d=512,nhead=8,ff=1024,drop=0.1)` with Pre-LN + MHA `batch_first` + GELU FFN → `LayerNorm` → CLS extraction.

### Key classes
`RotaryPositionalEmbedding`, `EcgPatchEncoder`, `AudioPatchEncoder`, `MultimodalTransformerLayer`, `LifeMultimodalTransformer` (d=512, heads=8, layers=3).

### Dependencies
`torch`, `torch.nn`, `math`.

### Demo
Every 30 s `StreamManager._process_30s_window` calls `transformer_model(ecg_raw, audio_mel)` under `torch.no_grad()` → `embedding_512` stored in `window_tokens.embedding_512` and streamed as `latest_token` over WS. Drift/stability compare this embedding to `recent_window_embeddings` / 30-night history. `dashboard/night` scoring terminal line `[TRANSFORMER] Running 10-step RoPE Foundation Model (512D Latent)...` narrates it.

### Run
```bash
python scripts/test_dsp_and_models.py
python -c "import torch; from src.models.transformer_backbone import LifeMultimodalTransformer; m=LifeMultimodalTransformer(); print(m(torch.randn(1,7500), torch.randn(1,128,3000))['window_embedding'].shape)"
```

---

## `src/models/self_supervised_tasks.py` & `src/models/thores_foundation_model.py` (UserFoundationModelManager)

### Purpose
The four self-supervised objectives from `docs/ARCHITECTURE.md:70` and the **per-user continual foundation** copy in `local_user/{user}/model/`.
- **Tasks:** 1) Masked token reconstruction (40% mask, L2), 2) Cross-modal InfoNCE contrastive ECG↔Audio (τ), 3) Future window dynamics prediction (cosine+L2), 4) Temporal consistency (L2 between consecutive windows).
- **Manager:** `thores_foundation_model.UserFoundationModelManager(user_id)` — paths `local_user/{clean_user}/model/respiratory_foundation_model.pt`, handles `fine_tune_on_session(session_windows, num_epochs=3)` called from `POST /api/session/stop:228`.

### Demo
Fine-tuning summary appears in stop payload: `foundation_model_fine_tuning {status, windows, losses}` and in AI narrative `"Foundation Transformer fine-tuned to local_user/{id}/model/."`.

### Run
```bash
curl http://localhost:8000/api/user/model_status/demo_user
python -c "from src.models.thores_foundation_model import UserFoundationModelManager; print(UserFoundationModelManager('demo_user').model_path)"
```

---

## `src/models/adaptive_baseline.py:PersonalizedAdaptiveBaseline` (186 lines)

### Purpose
**Per-user Gaussian baseline** `N(μ,σ)` for HR/RMSSD/respiration + **4-quadrant anomaly radar** over the 512-D embedding stream. Implements selective-update rule — only updates μ/σ during verified stable windows (`anomaly<0.35 && z_hr<1.8`) so pathology isn't learned as normal (`docs/ARCHITECTURE.md:91`).

### Inputs / Outputs
- **State:** `hr_mean/std, rmssd_mean/std, resp_mean/std` from `UserBaselineRecord` (defaults 72±8, 42±10, 15±2), `alpha=0.95` EMA, `recent_window_embeddings: List[512]` (≤100), `recent_night_embeddings: List[512]` (≤30).
- **Method:** `compute_window_anomalies(hr, rmssd, resp_rate, current_embedding, predicted_embedding, reconstruction_loss_val=0.05, snore_prob, pause_flag) -> Dict{stability_score, reconstruction_error, prediction_error, drift_score, composite_anomaly, is_suspect_episode, suspect_reasons, z_scores, current_baseline}`
  - `stability = 1/(1+0.5*||E_t−E_{t-1}||)` (inverse Euclidean)
  - `reconstruction_error = clip(loss*4,0,1)`
  - `prediction_error = clip((1−cos(pE,cE))*1.5,0,1)`
  - `drift = clip((1−cos(cE, avgHistory))*2,0,1)`
  - `composite = 0.25*stat +0.25*recon +0.25*pred +0.25*z` where `z=min((z_hr+z_rmssd+z_resp)/9,1)`; audio multiplier `*1.5+0.2` if `pause_flag && (z_resp>1.5||recon>0.4)`.
  - Suspect reasons if `z_hr>2.8`, `z_resp>2.5`, `pause_flag`, `snore>0.7`, `composite>0.65`.

### Demo
Four radar numbers appear per 30-s token in DB (`window_tokens.stability_score` etc.), rolled into `anomaly_score` shown live as ANOMALY COHERENCE % on dashboard tiles. Suspect episodes create `AnomalyEventRecord` (HIGH vs MEDIUM).

### Run
```bash
python -c "from src.models.adaptive_baseline import PersonalizedAdaptiveBaseline; print(PersonalizedAdaptiveBaseline().compute_window_anomalies(72,35,15))"
```

---

## `src/models/differentiable_adaptive_threshold.py` & `src/models/health_quiz_cohort.py`

### Purpose
**Differentiable soft-sigmoid personalizer** → continuous `P(anomaly)=sigmoid((score−theta)/tau)` with 12 calibrated cohort profiles (206k h registry) plus learned `theta/tau/W`. Surfaces: `GET /api/adaptive/cohorts`, `/api/adaptive/thresholds?cohort=healthy_adult`, `/api/adaptive/response_curve`, `POST /api/adaptive/custom_cohort`. Quiz helper maps onboarding answers → initial cohort.

### Cohort registry
`COHORT_PROFILES: Dict[12]` (keys: `healthy_adult`, `young_athlete`, `senior_high_risk`, `snoring_mild`, `pediatric_adolescent`, `pregnancy_third_trimester`, `copd_respiratory`, etc.) each `{name, category, threshold_offset theta, temperature tau, weights W[4], typical_hr/resp, apnea_risk_prior, reference_datasets}`. Used by `catboost_cohort_classifier` and `continual_learning_engine`.

### Demo
Quiz result banner `CALIBRATED ESRS BASELINE MODEL` shows cohort name + risk badge; `AdaptiveBaselineStudioModal` plots soft-sigmoid curve.

---

## `src/models/catboost_cohort_classifier.py:CatBoostCohortClassifier` (216 lines)

### Purpose
**Gradient-boosted tree** (CatBoost `iterations=150, lr=0.08, depth=5, MultiClass`) classifying 9-dim onboarding profile → 1/12 cohorts. Trains on synthetic clinical data if no persisted model; saves per-user to `local_user/{user}/model/catboost_classifier.cbm`.

### Features
`FEATURE_NAMES` 9: `age, gender(0/1), bmi, sleep_position(0:back,1:side,2:prone), snore_frequency(0-4), daytime_fatigue(0-4), choking_awakenings(0/1), has_smartwatch(0/1), stop_bang_score(0-8)`. BMI bucket from `bmiCategory` (18/22.5/27.5/33). STOP-BANG derived rule.

### Inputs / Outputs
- **In:** `predict_cohort(profile Dict{age,gender,bmiCategory,sleepPosition,snoreFrequency,daytimeFatigue,chokingAwakenings,hasSmartwatch})`
- **Out:** `{matched_cohort_id, cohort_name, confidence_pct, top_cohort_candidates[3], learned_threshold_theta, decision_temperature_tau, typical_hr/resp, reference_datasets, classifier_type, model_saved_path}` — returned by `POST /api/quiz/evaluate`.

### Demo
Onboarding `life-mobile/app/quiz/page.tsx` → user fills form → backend picks cohort displayed on `dashboard` banner. Same cohort seeds `ContinualLearningEngine.initialize_user_baseline` and vitals EMA.

### Run
```bash
python scripts/evaluate_clinical_test_patients.py
python -c "from src.models.catboost_cohort_classifier import CatBoostCohortClassifier; print(CatBoostCohortClassifier().predict_cohort({'age':30,'gender':'male'}))"
```

---

## `src/models/clinical_head.py:estimate_multimodal_risk_score` (114 lines)

### Purpose
Maps consolidated night metrics → **screening risk 0–100** + **AHI (events/h)** without claiming diagnosis (non-diagnostic disclaimer).

### Inputs / Outputs
- **In:** `night_embedding[512]?, suspect_episodes_count, total_duration_hours, mean_stability, mean_drift, mean_hr_z, snoring_ratio`
- **Rule risk:** `event_risk=min(50,ahi/20*50) + stability_risk=(1−stab)*20 + drift_risk=min(15,drift*15) + cardiac_risk=min(15,hr_z*7.5)` → optional neural blend `0.6*rule+0.4*MLP(512→128→32→1 Sigmoid*100)`.
- **Out:** `{multimodal_risk_score, risk_level:LOW/ELEVATED/HIGH, risk_color, stability_grade:OPTIMAL/MODERATE/IRREGULAR, apnea_screening_index, recommendation, disclaimer}`. Thresholds: `<25 LOW`, `<60 ELEVATED`, else HIGH (see `clinical_head:82`).

### Demo
Called inside `StreamManager._generate_night_summary:393`. Risk/stability + AHI appear in stop report and scoring terminal `[AHI] Apnea-Hypopnea Index calculated: X.X events/hr`.

### Run
```bash
python -c "from src.models.clinical_head import estimate_multimodal_risk_score; print(estimate_multimodal_risk_score(None,2,8,0.85,0.1,0.5,0.05))"
```

---

## `src/models/continual_learning_engine.py:ContinualLearningEngine` (182 lines)

### Purpose
**Night-to-night lifelong adaptation** without catastrophic forgetting — EMA over `theta/tau` and vitals, plus trajectory tracker persisted as JSON.

### Storage
`data/user_baselines/{clean_id}_baseline.json` (dir `USER_PROFILES_DIR:24`), in-memory `cache`.

### Key methods
- `initialize_user_baseline(user_id, cohort_key, custom_name) -> record{user_id,user_name,initial_cohort,total_sessions,cumulative_hours,current_parameters{theta_offset,temperature_tau,weights,hr_mean/std,resp_mean/std,typical_rmssd}, learning_trajectory[0]{session0:theta/temp/hr_mean...}}`
- `get_user_baseline(user_id)` / `get_trajectory(user_id)` (50 entries cap)
- `adapt_after_session(user_id, session_duration_mins, session_mean_hr/resp/rmssd, stability_score, ahi, detected_anomalies_count, alpha=0.25, beta=0.20) -> record` — EMA `new_hr=(1−β)*old+β*session`, theta shift `+0.02 if ahi>5 else −0.01` via `new_theta=(1−α)*old+α*(old+shift)`.

### Demo
Invoked from `POST /api/session/stop:210` → `adapted_user_baseline` included in response; trajectory drives `UserContinualLearningModal` sparkline.

### Run
```bash
curl http://localhost:8000/api/user/trajectory/demo_user
python -c "from src.models.continual_learning_engine import ContinualLearningEngine; e=ContinualLearningEngine(); print(e.get_user_baseline('demo_user'))"
```
