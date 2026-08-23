"""
LIFE Platform - Clinical Screening Head & Risk Estimator
Maps Night Embeddings and Multimodal Anomaly metrics to an actionable Screening Risk Score (0-100).
Maintains non-diagnostic clinical boundaries and provides transparent risk categorization.
"""

import torch
import torch.nn as nn
import numpy as np
from typing import Dict, List, Any, Optional


class ClinicalScreeningHead(nn.Module):
    """
    MLP Head:
    Input: [batch_size, 512_night_embedding]
    Output: [batch_size, 1] Normalized screening risk in [0, 1]
    """
    def __init__(self, in_features: int = 512):
        super().__init__()
        self.mlp = nn.Sequential(
            nn.Linear(in_features, 128),
            nn.BatchNorm1d(128),
            nn.ReLU(),
            nn.Dropout(0.15),
            nn.Linear(128, 32),
            nn.ReLU(),
            nn.Linear(32, 1),
            nn.Sigmoid()
        )

    def forward(self, night_embedding: torch.Tensor) -> torch.Tensor:
        if night_embedding.dim() == 1:
            night_embedding = night_embedding.unsqueeze(0)
        return self.mlp(night_embedding)


def estimate_multimodal_risk_score(
    night_embedding: Optional[List[float]],
    suspect_episodes_count: int,
    total_duration_hours: float,
    mean_stability: float,
    mean_drift: float,
    mean_hr_z: float,
    snoring_ratio: float
) -> Dict[str, Any]:
    """
    Computes consolidated Multimodal Screening Risk (0-100).
    Combines neural embedding evaluation with rule-based physiological indicators.
    """
    # 1. Compute screening Apnea Index (events per hour)
    duration_hrs = max(0.2, total_duration_hours)
    apnea_index_est = suspect_episodes_count / duration_hrs
    
    # 2. Heuristic baseline risk
    # Normal: < 5 events/hr -> low risk
    # Mild: 5-15 events/hr -> elevated
    # Moderate/Severe: > 15 events/hr -> high risk
    event_risk = min(50.0, (apnea_index_est / 20.0) * 50.0)
    stability_risk = (1.0 - mean_stability) * 20.0
    drift_risk = min(15.0, mean_drift * 15.0)
    cardiac_risk = min(15.0, mean_hr_z * 7.5)
    
    raw_risk = event_risk + stability_risk + drift_risk + cardiac_risk
    
    # Optional fine-tuning with Neural Head if embedding exists
    if night_embedding is not None and len(night_embedding) == 512:
        try:
            head = ClinicalScreeningHead(in_features=512)
            head.eval()
            with torch.no_grad():
                tensor_emb = torch.tensor([night_embedding], dtype=torch.float32)
                neural_risk = float(head(tensor_emb).squeeze().item()) * 100.0
                # Blend 60% rule / 40% neural
                raw_risk = 0.6 * raw_risk + 0.4 * neural_risk
        except Exception:
            pass
            
    final_risk_score = round(float(np.clip(raw_risk, 0.0, 100.0)), 1)
    
    # Risk Level Categorization
    if final_risk_score < 25.0:
        risk_level = "LOW"
        risk_color = "#00f5a0" # Emerald
        recommendation = "Physiological rhythm within normal baseline. Stable cardiorespiratory sync."
    elif final_risk_score < 60.0:
        risk_level = "ELEVATED"
        risk_color = "#ffb800" # Amber
        recommendation = "Moderate cardiorespiratory variance or intermittent breathing pauses observed. Recommend continuing daily monitoring."
    else:
        risk_level = "HIGH"
        risk_color = "#ff3366" # Coral / Red
        recommendation = "Frequent respiratory pauses and elevated cardiac irregularity detected. Consider consulting a healthcare professional for clinical polysomnography evaluation."

    # Stability Grade
    if mean_stability > 0.80:
        stability_grade = "OPTIMAL"
    elif mean_stability > 0.55:
        stability_grade = "MODERATE"
    else:
        stability_grade = "IRREGULAR"

    return {
        "multimodal_risk_score": final_risk_score,
        "risk_level": risk_level,
        "risk_color": risk_color,
        "stability_grade": stability_grade,
        "apnea_screening_index": round(apnea_index_est, 1),
        "recommendation": recommendation,
        "disclaimer": (
            "Notice: LIFE is a screening & signal-monitoring platform. "
            "Calculated metrics are non-diagnostic indicators."
        )
    }
