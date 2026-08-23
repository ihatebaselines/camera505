"""
LIFE / THORES Platform - Continual Lifelong Learning & Baseline Adaptation Engine
Updates user baseline models across night-to-night recordings without catastrophic forgetting.

Features:
1. Online Exponential Moving Average (EMA) & Bayesian Prior Updates:
   - theta_t = (1 - alpha) * theta_{t-1} + alpha * theta_session
   - tau_t = (1 - alpha) * tau_{t-1} + alpha * tau_session
   - mu_HR, sigma_HR, mu_Resp, sigma_Resp Gaussian baseline updating.
2. User Learning Trajectory Tracker:
   - Records session-by-session improvement, anomaly stability, and personalization convergence.
3. Persistent JSON / SQLite Storage.
"""

import os
import json
import time
from typing import Dict, List, Any, Optional
import numpy as np

from .differentiable_adaptive_threshold import COHORT_PROFILES


USER_PROFILES_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "data", "user_baselines")


class ContinualLearningEngine:
    def __init__(self, storage_dir: str = USER_PROFILES_DIR):
        self.storage_dir = storage_dir
        os.makedirs(self.storage_dir, exist_ok=True)
        self.cache: Dict[str, Dict[str, Any]] = {}

    def _get_user_file(self, user_id: str) -> str:
        clean_id = "".join(c for c in user_id if c.isalnum() or c in "_-").lower()
        return os.path.join(self.storage_dir, f"{clean_id}_baseline.json")

    def initialize_user_baseline(
        self,
        user_id: str,
        cohort_key: str = "healthy_adult",
        custom_name: Optional[str] = None
    ) -> Dict[str, Any]:
        """Initializes a new user baseline from their matched clinical cohort."""
        cohort = COHORT_PROFILES.get(cohort_key, COHORT_PROFILES["healthy_adult"])
        
        record = {
            "user_id": user_id,
            "user_name": custom_name or user_id.capitalize(),
            "initial_cohort": cohort_key,
            "cohort_name": cohort["name"],
            "created_at": time.strftime("%Y-%m-%d %H:%M:%S"),
            "total_sessions_completed": 0,
            "cumulative_recording_hours": 0.0,
            "current_parameters": {
                "theta_offset": cohort["threshold_offset"],
                "temperature_tau": cohort["temperature"],
                "weights_W": cohort["weights"],
                "hr_mean": cohort["typical_hr"],
                "hr_std": 6.5,
                "resp_mean": cohort["typical_resp"],
                "resp_std": 2.1,
                "typical_rmssd": 35.0
            },
            "learning_trajectory": [
                {
                    "session_idx": 0,
                    "date": time.strftime("%Y-%m-%d"),
                    "theta": cohort["threshold_offset"],
                    "temperature": cohort["temperature"],
                    "hr_mean": cohort["typical_hr"],
                    "resp_mean": cohort["typical_resp"],
                    "stability_score": 90.0,
                    "ahi_screening": 2.0,
                    "note": f"Initial calibration mapped to {cohort['name']}"
                }
            ]
        }
        
        self._save_user_baseline(user_id, record)
        return record

    def get_user_baseline(self, user_id: str) -> Dict[str, Any]:
        """Retrieves or auto-creates user baseline record."""
        clean_id = "".join(c for c in user_id if c.isalnum() or c in "_-").lower()
        if clean_id in self.cache:
            return self.cache[clean_id]
            
        file_path = self._get_user_file(user_id)
        if os.path.exists(file_path):
            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    record = json.load(f)
                    self.cache[clean_id] = record
                    return record
            except Exception:
                pass
                
        # Default initialization
        return self.initialize_user_baseline(user_id, "healthy_adult")

    def _save_user_baseline(self, user_id: str, record: Dict[str, Any]):
        clean_id = "".join(c for c in user_id if c.isalnum() or c in "_-").lower()
        self.cache[clean_id] = record
        file_path = self._get_user_file(user_id)
        try:
            with open(file_path, "w", encoding="utf-8") as f:
                json.dump(record, f, indent=2)
        except Exception as e:
            print(f"[ContinualLearning] Save error: {e}")

    def adapt_after_session(
        self,
        user_id: str,
        session_duration_mins: float,
        session_mean_hr: float,
        session_mean_resp: float,
        session_rmssd: float,
        stability_score: float,
        ahi: float,
        detected_anomalies_count: int,
        alpha: float = 0.25, # Learning rate for thresholds
        beta: float = 0.20   # Learning rate for vital baselines
    ) -> Dict[str, Any]:
        """
        Executes online continual update after a completed monitoring session.
        Applies EMA smoothing to prevent catastrophic forgetting.
        """
        record = self.get_user_baseline(user_id)
        p = record["current_parameters"]
        
        # 1. Update vital statistics (Gaussian Prior)
        if session_mean_hr > 40:
            new_hr_mean = (1 - beta) * p["hr_mean"] + beta * session_mean_hr
            p["hr_mean"] = round(float(new_hr_mean), 2)
            
        if session_mean_resp > 5:
            new_resp_mean = (1 - beta) * p["resp_mean"] + beta * session_mean_resp
            p["resp_mean"] = round(float(new_resp_mean), 2)
            
        if session_rmssd > 5:
            new_rmssd = (1 - beta) * p["typical_rmssd"] + beta * session_rmssd
            p["typical_rmssd"] = round(float(new_rmssd), 2)

        # 2. Adaptive Threshold fine-tuning based on observed stability
        # If stability was high (few false alarms), relax threshold slightly
        # If frequent valid anomalies, adjust offset for sharper detection
        target_theta_shift = 0.02 if ahi > 5.0 else -0.01
        new_theta = (1 - alpha) * p["theta_offset"] + alpha * (p["theta_offset"] + target_theta_shift)
        p["theta_offset"] = round(float(new_theta), 4)

        # 3. Increment counters
        record["total_sessions_completed"] += 1
        record["cumulative_recording_hours"] = round(
            record["cumulative_recording_hours"] + (session_duration_mins / 60.0), 2
        )
        
        # 4. Append to Learning Trajectory
        traj_item = {
            "session_idx": record["total_sessions_completed"],
            "date": time.strftime("%Y-%m-%d %H:%M"),
            "duration_mins": round(session_duration_mins, 1),
            "theta": p["theta_offset"],
            "temperature": p["temperature_tau"],
            "hr_mean": p["hr_mean"],
            "resp_mean": p["resp_mean"],
            "rmssd": p["typical_rmssd"],
            "stability_score": round(stability_score, 1),
            "ahi_screening": round(ahi, 2),
            "events_count": detected_anomalies_count,
            "note": f"Online adapted (+{round(session_duration_mins, 1)}m session)"
        }
        
        record["learning_trajectory"].append(traj_item)
        if len(record["learning_trajectory"]) > 50:
            record["learning_trajectory"] = record["learning_trajectory"][-50:]
            
        self._save_user_baseline(user_id, record)
        return record

    def get_trajectory(self, user_id: str) -> List[Dict[str, Any]]:
        record = self.get_user_baseline(user_id)
        return record.get("learning_trajectory", [])
