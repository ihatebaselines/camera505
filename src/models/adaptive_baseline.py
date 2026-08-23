"""
LIFE Platform - Personalized Adaptive Baseline & Dynamic Thresholding Engine
Learns individual physiological baseline distributions (mu, sigma) over time
and computes the 4 Core Anomaly Metrics:
1. Stability Score (temporal variance)
2. Reconstruction Error (morphological novelty)
3. Prediction Error (temporal transition anomaly)
4. Drift Score (long-term baseline shift)
"""

import numpy as np
import math
from typing import Dict, List, Tuple, Optional, Any
from ..storage.models import UserBaselineRecord, WindowToken30s


class PersonalizedAdaptiveBaseline:
    """
    Manages individualized physiological baselines and computes multi-tiered anomaly scores.
    """
    def __init__(self, baseline_record: Optional[UserBaselineRecord] = None):
        if baseline_record is None:
            baseline_record = UserBaselineRecord(user_id="user_default")
        self.user_id = baseline_record.user_id
        
        # Physiological distributions: N(mu, sigma)
        self.hr_mean = baseline_record.baseline_hr_mean
        self.hr_std = max(2.0, baseline_record.baseline_hr_std)
        
        self.rmssd_mean = baseline_record.baseline_rmssd_mean
        self.rmssd_std = max(2.0, baseline_record.baseline_rmssd_std)
        
        self.resp_mean = baseline_record.baseline_resp_mean
        self.resp_std = max(1.0, baseline_record.baseline_resp_std)
        
        self.night_count = baseline_record.night_count
        self.recent_night_embeddings = list(baseline_record.recent_night_embeddings)
        
        # Exponential update factor alpha (slow adaptation: 0.95 keeps stability)
        self.alpha = 0.95
        
        # Ring buffer of recent window embeddings (for stability calculation)
        self.recent_window_embeddings = []

    def compute_window_anomalies(
        self,
        hr: float,
        rmssd: float,
        resp_rate: float,
        current_embedding: Optional[List[float]] = None,
        predicted_embedding: Optional[List[float]] = None,
        reconstruction_loss_val: float = 0.05,
        snore_prob: float = 0.0,
        pause_flag: bool = False
    ) -> Dict[str, Any]:
        """
        Computes 4 anomaly dimensions for a single 30s window.
        """
        # 1. Z-Scores relative to personal baseline
        z_hr = abs(hr - self.hr_mean) / self.hr_std if self.hr_std > 0 else 0.0
        z_rmssd = abs(rmssd - self.rmssd_mean) / self.rmssd_std if self.rmssd_std > 0 else 0.0
        z_resp = abs(resp_rate - self.resp_mean) / self.resp_std if self.resp_std > 0 else 0.0
        
        # 2. Metric 1: Stability Score (1.0 = highly stable, 0.0 = chaotic jumping)
        stability_score = 0.90
        if current_embedding and len(self.recent_window_embeddings) > 0:
            last_emb = np.array(self.recent_window_embeddings[-1])
            curr_emb = np.array(current_embedding)
            dist = float(np.linalg.norm(curr_emb - last_emb))
            # Lower distance = higher stability
            stability_score = float(np.clip(1.0 / (1.0 + 0.5 * dist), 0.0, 1.0))
            
        if current_embedding:
            self.recent_window_embeddings.append(current_embedding)
            if len(self.recent_window_embeddings) > 100:
                self.recent_window_embeddings.pop(0)

        # 3. Metric 2: Reconstruction Error (Normalized to 0..1 range)
        # Scaled so that standard baseline loss (~0.05) maps to low error (~0.1)
        recon_error = float(np.clip(reconstruction_loss_val * 4.0, 0.0, 1.0))

        # 4. Metric 3: Prediction Error
        pred_error = 0.05
        if current_embedding and predicted_embedding:
            c_emb = np.array(current_embedding)
            p_emb = np.array(predicted_embedding)
            dot_val = np.dot(c_emb, p_emb) / (np.linalg.norm(c_emb) * np.linalg.norm(p_emb) + 1e-8)
            cosine_dist = max(0.0, 1.0 - float(dot_val))
            pred_error = float(np.clip(cosine_dist * 1.5, 0.0, 1.0))

        # 5. Metric 4: Drift Score (vs 30-night baseline history)
        drift_score = 0.0
        if current_embedding and len(self.recent_night_embeddings) > 0:
            avg_history = np.mean(np.array(self.recent_night_embeddings), axis=0)
            c_emb = np.array(current_embedding)
            dot_val = np.dot(c_emb, avg_history) / (np.linalg.norm(c_emb) * np.linalg.norm(avg_history) + 1e-8)
            drift_score = float(np.clip((1.0 - float(dot_val)) * 2.0, 0.0, 1.0))

        # 6. Multimodal Composite Anomaly Score (0.0 to 1.0)
        # Combines physiological z-deviations + Neural anomaly metrics + Audio events
        stat_component = (1.0 - stability_score) * 0.25
        recon_component = recon_error * 0.25
        pred_component = pred_error * 0.25
        z_component = min(1.0, (z_hr + z_rmssd + z_resp) / 9.0) * 0.25
        
        raw_anomaly = stat_component + recon_component + pred_component + z_component
        
        # Audio confirmation multiplier (Multimodal cross-validation)
        if pause_flag and (z_resp > 1.5 or recon_error > 0.4):
            raw_anomaly = min(1.0, raw_anomaly * 1.5 + 0.2)
            
        composite_anomaly = float(np.clip(raw_anomaly, 0.0, 1.0))
        
        # Evaluate Suspect Episode Flag & Clinical Reasons
        is_suspect = False
        suspect_reasons = []
        
        if z_hr > 2.8:
            is_suspect = True
            suspect_reasons.append(f"Cardiac Rate Deviation (HR {hr:.0f} BPM, z={z_hr:.1f})")
            
        if z_resp > 2.5:
            is_suspect = True
            suspect_reasons.append(f"Respiratory Pattern Irregularity (Resp {resp_rate:.0f}/min, z={z_resp:.1f})")
            
        if pause_flag:
            is_suspect = True
            suspect_reasons.append("Respiratory Audio Pause Detected")
            
        if snore_prob > 0.7:
            suspect_reasons.append(f"Intense Snoring Episode (p={snore_prob:.2f})")
            
        if composite_anomaly > 0.65:
            is_suspect = True
            suspect_reasons.append(f"High Multimodal Embedding Deviation ({composite_anomaly:.2f})")

        # Selective Baseline Update: Update ONLY during verified stable/normal periods
        if not is_suspect and composite_anomaly < 0.35 and z_hr < 1.8:
            self._update_baseline_running(hr, rmssd, resp_rate)

        return {
            "stability_score": round(stability_score, 3),
            "reconstruction_error": round(recon_error, 3),
            "prediction_error": round(pred_error, 3),
            "drift_score": round(drift_score, 3),
            "composite_anomaly": round(composite_anomaly, 3),
            "is_suspect_episode": is_suspect,
            "suspect_reasons": suspect_reasons,
            "z_scores": {
                "z_hr": round(z_hr, 2),
                "z_rmssd": round(z_rmssd, 2),
                "z_resp": round(z_resp, 2)
            },
            "current_baseline": {
                "hr_mean": round(self.hr_mean, 1),
                "hr_std": round(self.hr_std, 1),
                "rmssd_mean": round(self.rmssd_mean, 1),
                "resp_mean": round(self.resp_mean, 1)
            }
        }

    def _update_baseline_running(self, hr: float, rmssd: float, resp: float):
        """Gradually updates rolling Gaussian statistics during verified rest."""
        self.hr_mean = self.alpha * self.hr_mean + (1.0 - self.alpha) * hr
        self.rmssd_mean = self.alpha * self.rmssd_mean + (1.0 - self.alpha) * rmssd
        self.resp_mean = self.alpha * self.resp_mean + (1.0 - self.alpha) * resp

    def add_night_embedding(self, night_embedding_512: List[float]):
        """Records consolidated 512-dim night embedding to history."""
        self.recent_night_embeddings.append(night_embedding_512)
        if len(self.recent_night_embeddings) > 30:
            self.recent_night_embeddings.pop(0)
        self.night_count += 1

    def to_record(self) -> UserBaselineRecord:
        return UserBaselineRecord(
            user_id=self.user_id,
            baseline_hr_mean=self.hr_mean,
            baseline_hr_std=self.hr_std,
            baseline_rmssd_mean=self.rmssd_mean,
            baseline_rmssd_std=self.rmssd_std,
            baseline_resp_mean=self.resp_mean,
            baseline_resp_std=self.resp_std,
            night_count=self.night_count,
            recent_night_embeddings=self.recent_night_embeddings
        )
