"""
LIFE Platform - BIDMC Respiration & Fantasia Benchmark Helper
Provides access and comparison tools for:
1. PhysioNet BIDMC PPG and Respiration Dataset (gold standard for EDR validation)
2. PhysioNet Fantasia Database (young vs elderly healthy baseline dynamics)
"""

import numpy as np
from typing import Dict, List, Any, Optional


class BidmcDatasetHelper:
    """
    Helper for PhysioNet BIDMC and Fantasia benchmarks.
    Used for validating that ECG-derived respiration matches reference pneumography.
    """
    PHYSIONET_BIDMC_URL = "https://physionet.org/content/bidmc/1.0.0/"
    PHYSIONET_FANTASIA_URL = "https://physionet.org/content/fantasia/1.0.0/"

    @staticmethod
    def get_info() -> Dict[str, Any]:
        return {
            "bidmc": {
                "name": "BIDMC PPG and Respiration Dataset",
                "url": BidmcDatasetHelper.PHYSIONET_BIDMC_URL,
                "subjects": 53,
                "duration_per_subject": "8 minutes",
                "signals": ["Lead II ECG (125Hz)", "Plethysmogram PPG (125Hz)", "Reference Respiration Waveform (125Hz)"],
                "purpose": "Validation of ECG-Derived Respiration (EDR) algorithms"
            },
            "fantasia": {
                "name": "Fantasia Database",
                "url": BidmcDatasetHelper.PHYSIONET_FANTASIA_URL,
                "subjects": 40,
                "signals": ["ECG (250Hz)", "Respiration (Pneumography 250Hz)"],
                "cohorts": ["20 Young Healthy (21-34 yrs)", "20 Elderly Healthy (68-85 yrs)"],
                "purpose": "Validation of HRV (RMSSD, SDNN) and autonomic baseline dynamics across age groups"
            }
        }

    @staticmethod
    def evaluate_edr_accuracy(estimated_resp_curve: np.ndarray, reference_resp_curve: np.ndarray) -> Dict[str, float]:
        """
        Computes Pearson correlation (r) and RMSE between EDR estimate and ground truth respiration.
        """
        min_len = min(len(estimated_resp_curve), len(reference_resp_curve))
        if min_len < 10:
            return {"correlation_r": 0.0, "rmse": 0.0}
            
        est = estimated_resp_curve[:min_len]
        ref = reference_resp_curve[:min_len]
        
        # Normalize both to zero mean and unit variance
        est_norm = (est - np.mean(est)) / (np.std(est) + 1e-6)
        ref_norm = (ref - np.mean(ref)) / (np.std(ref) + 1e-6)
        
        corr = float(np.corrcoef(est_norm, ref_norm)[0, 1])
        rmse = float(np.sqrt(np.mean((est_norm - ref_norm) ** 2)))
        
        return {
            "correlation_r": round(corr, 3),
            "rmse": round(rmse, 3)
        }
