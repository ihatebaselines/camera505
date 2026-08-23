# Modele — `src/models/*`

7 module, toate rulează local, fără cloud. Unul produce embedding 512, restul decid praguri/cohortă/risc.

---

## 1. `src/models/transformer_backbone.py` — LifeMultimodalTransformer (ECG+Audio → 512D)

**Arhitectura (`LifeMultimodalTransformer` `transformer_backbone.py:141`):**
- **Encodere patch:**
  - `EcgPatchEncoder:46` — Conv1d 1→64 k15 s5 → 64→128 k7 s5 → 128→256 k5 s5 → 256→512 k3 s1 + BatchNorm+GELU (`:54-71`). Intrare `[B,1,7500]` @250 Hz → `5×5×5=125` downsample → `[B,512,60]` → transpose → `[B,60,512]`.
  - `AudioPatchEncoder:83` — Conv2d 1→32 5×5 s2 → 32→64 s2 → 64→128 3×5 s(2,3) + BN+GELU → `AdaptiveAvgPool2d(1,60)` (`:91-102`). Intrare `[B,1,128,~3000]` Mel → `[B,128,1,60]` → squeeze → `[B,60,512]`.
- **Poziție:** `RotaryPositionalEmbedding:17` RoPE pe 512D: `inv_freq=1/10000^{2i/d}`, `t=arange(seq)`, `freqs=einsum(t, inv_freq)`, `cos/sin`, rotate 2D `(-x2,x1)` (`:24-43`). Aplicată pe toți tokenii concatenați (`:221`). În `thores_foundation_model.py:28` varianta ia `positions` explicit per fereastră 30s.
- **Tokeni:** `modality_ecg/audio` (`:162-163`) + `cls_token` (`:164`), concat `[CLS, ECG×60, Audio×60]=121` (`:217`).
- **Transformer:** `3× MultimodalTransformerLayer:114` (Pre-LN → MHA 8 heads → residual → FFN 512→1024→512 GELU+dropout 0.1) (`:118-138`) + final `LayerNorm` (`:172`).
- **Heads aux:** `respiration_pred_head` ReLU+5 → RPM, `snore_pred_head` sigmoid (`:175-176,234-235`).
- **Forward (`:178-244`):** dacă `ecg_raw/audio_mel` e `None` → zero tokens 60×512; altfel encode+modality. Toți → RoPE → 3 layere → `window_embedding = hidden[:,0,:]` [B,512].

**Scop pitch:** 7500 ECG + 480k audio /30s → 60+60 tokens → 10 pași atenție → 512-D latent + 4 SSL losses (vezi `thores_foundation_model` pentru detalii).

---

## 2. `src/models/thores_foundation_model.py` — THORES 10-Step Foundation

Documentează cei 10 pași din docstring (`:1-16`); implementarea:

- **RoPE cu positions (`:29-59`):** aceiași 3 tokeni din aceeași fereastră 30s primesc `position=window_idx` identic → sincronizare multimodală.
- **Patch embedders (`:63-76`):** `ModalityPatchEmbedder` Linear 64/48/128→256→512 (pentru features respirație/motion/audio extrase, nu raw).
- **MultimodalRespiratoryTransformer (`:79-276`):** 512D, 8 heads, 4 layere `TransformerEncoderLayer(batch_first=True,norm_first=True)` (`:100-108`). Heads recon (64/48/128) + `future_predictor` 512→512 GELU + `night_aggregator` + `clinical_head` 512→128→1 sigmoid×100 (`:110-136`).
- **`forward_30s_window` (`:138-181`):** `[B,512]×3` → stack `[B,3,512]` → RoPE cu `pos=[window_idx]*3` → transformer → `resp_embedding=mean(context,dim=1)` + `pred_future` + `risk_score`.
- **4 SSL losses:**
  1. `compute_masked_reconstruction_loss` (`:184-207`): mască 40% pe resp tokens → MSE vs original.
  2. `compute_cross_modal_contrastive_loss` (`:209-241`): normalize L2, `sim=matmul(r,m^T)/0.07`, `CrossEntropy` pe diagonală; face media `r↔m` și `r↔a`.
  3. `compute_future_prediction_loss` (`:243-263`): `0.6*(1-cos(pred_next,emb_t1)) +0.4*MSE`.
  4. `compute_temporal_consistency_loss` (`:265-276`): `mean(||emb_t - emb_t1||2)`.
- **`UserFoundationModelManager` (`:280-395`):** `local_user/{user}/model/respiratory_foundation_model.pt` + `personal_history.json`. `_load_or_initialize` încarcă checkpoint personal sau `foundation_models/respiratory_foundation_512.pt`. `fine_tune_on_session`: AdamW lr 1e-3 weight_decay 1e-4, 5 epoci, batch 1, `total = 0.35*recon+0.25*contrast+0.25*future+0.15*temporal`, `save_checkpoint`.

**Pitch:** RoPE cu poziție identică per fereastră + 4 SSL = reprezentare stabilă noapte-lungă; fine-tuning per user fără catastrophic forgetting.

---

## 3. `src/models/adaptive_baseline.py` — PersonalizedAdaptiveBaseline (4 metrici)

**Stare (`:21-43`):** `hr_mean/std` (min 2), `rmssd_mean/std`, `resp_mean/std` (min 1) din `UserBaselineRecord`, `recent_night_embeddings` (≤30), `recent_window_embeddings` (≤100), `alpha=0.95` EMA.

**`compute_window_anomalies` (`:45-160`):** intrări `hr, rmssd, resp, current_embedding(512), predicted(512), snore_prob, pause_flag`.
1. **z-scores:** `|hr-hr_mean|/hr_std` etc. (`:60-62`).
2. **Stability (`:65-76`):** `1/(1+0.5*||curr-last_emb||)` clip 0-1; default 0.90. Salvează embedding în buffer.
3. **Recon error (`:80`):** `clip(loss*4,0,1)` — loss 0.05 → 0.2.
4. **Pred error (`:83-89`):** `1-cos(curr,pred)` ×1.5 clip.
5. **Drift (`:92-97`):** `1-cos(curr, mean(history))` ×2 clip.
6. **Composite (`:99-112`):** `0.25*(1-stability)+0.25*recon+0.25*pred+0.25*clip((z_hr+z_rmssd+z_resp)/9,0,1)`; dacă `pause && (z_resp>1.5||recon>0.4)` → `*1.5+0.2` cap 1.
7. **Suspect (`:114-135`):** `z_hr>2.8`, `z_resp>2.5`, `pause`, `snore>0.7`, `composite>0.65` → `is_suspect` + `suspect_reasons` text.
8. **EMA update (`:138-139,162-166`):** doar dacă `!suspect && composite<0.35 && z_hr<1.8` → `mu = 0.95*mu +0.05*obs` pentru hr/rmssd/resp.
9. Returnează 7 câmpuri rotunjite + `z_scores` + `current_baseline`.

**`add_night_embedding` (`:168-173`):** append și `night_count++`, cap 30.

---

## 4. `src/models/differentiable_adaptive_threshold.py` — 12 cohorte + theta/tau

**`AdaptiveThresholdDetector` (`:55-108`):** `threshold_offset` (theta), `weight 4×1`, `log_temp` (tau), `patient_delta` + `posture_bias` (non-train). Init `weight=[-1.5,0.8,0.8,-0.5]` (`:75-82`). Forward: `temp=exp(log_temp)+1e-4`, `p_bias=0.15 back / -0.05 side / 0` (`:99`), `logits = x·W + theta+delta+pbias`, `probs=sigmoid(logits/temp)` (`:101-104`). `get_effective_threshold = theta+delta` (`:106`).

**`DifferentiableSoftF1Loss` (`:33-52`):** `soft_prec=tp/(tp+fp+eps)`, `recall=tp/(tp+fn+eps)`, `soft_f1=2pr/(p+r)`, `loss=1-f1` — antrenabil end-to-end.

**`COHORT_PROFILES` (`:112-281`):** 12 intrări cu `threshold_offset -0.22..0.80`, `temperature 0.42-0.65`, `weights 4`, `typical_hr 54-86`, `typical_resp 12-20`, `apnea_risk_prior LOW/ELEVATED/HIGH`, `reference_datasets`. Lista: young_athlete, healthy_adult, snoring_mild, senior_high_risk, copd_respiratory, arrhythmia_afib, pediatric_adolescent, insomnia_hyperarousal, pregnancy_third_trimester, post_covid_dyspnea, central_apnea_cheyne_stokes, rem_behavior_disorder.

**`PersonalizedCohortCalibrator` (`:284-364`):**
- `load_cohort_model`: copiază theta/weights din profil.
- `get_response_curve(40)`: `P=1/(1+exp(-(score-theta)/temp))` pe `score -1.5..1.5` (`:302-319`).
- `calibrate_online`: Adam lr 0.02, 50 pași, `loss=mean(ReLU(probs-0.05)²)` pe features restful (`:321-344`) → setează `patient_delta`.
- `predict_window`: `prob`, `is_suspect>=0.5`, `risk_label HIGH>=0.65 / ELEVATED>=0.35 / STABLE`.

---

## 5. `src/models/catboost_cohort_classifier.py` — 9 feature-uri → 12 cohorte

**Features (`catboost_cohort_classifier.py:19-29`):** `age, gender(0F/1M), bmi, sleep_position(0back/1side/2stomach), snore_frequency 0-4, daytime_fatigue 0-4, choking 0/1, has_smartwatch 0/1, stop_bang 0-8`.

**Synthetic data (`:36-104`):** 3000 sample-uri seed 42, cohortă random + bias per cohortă (ex. young_athlete 18-32 BMI 22±2 snore 0-1, senior 65-85 BMI 30±4 snore 2-4). STOP-BANG din 6 reguli (snore≥3, fatigue≥3, choking, bmi≥30, age≥50, male).

**`CatBoostCohortClassifier` (`:107-216`):**
- `CatBoostClassifier(iter=150, lr=0.08, depth=5, MultiClass, seed42)` (`:113-120`). `_ensure_trained` încarcă `local_user/{user}/model/catboost_classifier.cbm` dacă există altfel `fit` pe 2500 sintetice și save.
- `predict_cohort`: map `bmiCategory→22.5/27.5/33/18`, `sleepPosition→0/1/2`, calculează STOP-BANG identic, `predict_proba`, `argmax` + top3 sortat, returnează `{matched_cohort_id, cohort_name, confidence_pct, apnea_risk_prior, learned_threshold_theta, decision_temperature_tau, typical_hr/resp, reference_datasets, top_cohort_candidates, classifier_type, model_saved_path}`.

---

## 6. `src/models/clinical_head.py` — AHI + risk 0-100

**`ClinicalScreeningHead` (`:13-35`):** `512→128 BN→ReLU→Drop0.15 →128→32 ReLU →32→1 Sigmoid` → risc 0-1 per night embedding.

**`estimate_multimodal_risk_score` (`:38-114`):** intrări `night_embedding(512), suspect_count, duration_hrs, mean_stability, mean_drift, mean_hr_z, snoring_ratio`.
- `apnea_index = suspect / max(0.2, duration)` (`:53`).
- Heuristic: `event_risk=min(50, ahi/20*50)` (0@0, 50@20/h), `stability=(1-stab)*20`, `drift=min(15,drift*15)`, `cardiac=min(15, hr_z*7.5)` → `raw=sum` (`:59-64`).
- Blend neural 40% dacă embedding există: `raw=0.6*raw+0.4*head(emb)*100` (`:68-75`).
- `final=clip(raw,0,100)`; nivel `LOW<25 (emerald #00f5a0) / ELEVATED<60 (amber #ffb800) / HIGH (coral #ff3366)` + recommendation text; `stability_grade OPTIMAL>0.80 / MODERATE>0.55 / IRREGULAR`. Returnează `multimodal_risk_score, risk_level, risk_color, stability_grade, apnea_screening_index, recommendation, disclaimer non-diagnostic`.

---

## 7. `src/models/continual_learning_engine.py` — EMA per user

**Stocare:** `data/user_baselines/{user}_baseline.json` (`:24`), cap 50 trajectory (`:175`).

**`initialize_user_baseline` (`:37-80`):** ia cohortă → `record{user_id, user_name, initial_cohort, cohort_name, created_at, total_sessions 0, cumulative_hours 0, current_parameters{theta, tau, weights, hr_mean/std, resp_mean/std, typical_rmssd}, learning_trajectory[0]}`.

**`get_user_baseline`/`_save_user_baseline` (`:82-109`):** cache + JSON indent 2.

**`adapt_after_session` (`:111-178`):** EMA `beta=0.20` pe hr/resp/rmssd (`:132-142`: `new=(1-β)*old+β*session` dacă valizi), `alpha=0.25` pe `theta`: `target_shift=+0.02 dacă ahi>5 else -0.01`, `new_theta=(1-α)*old+α*(old+shift)` (`:147-149`). Incrementează `total_sessions/cumulative_hours`, append trajectory cu 10 câmpuri, cap 50 (`:174`).

**`get_trajectory` (`:180-182`):** returnează `learning_trajectory`.

