"""
LIFE / THORES Platform - CatBoost Clinical Cohort Classifier
Uses gradient boosted decision trees (CatBoost) to classify patient onboarding profiles
(STOP-BANG, age, gender, BMI, sleeping posture, snoring frequency, daytime fatigue)
into one of the 12 clinical baseline cohorts.

Saves trained model to: local_user/{user}/model/catboost_classifier.cbm
"""

import os
import json
from typing import Dict, List, Any, Optional, Tuple
import numpy as np
import catboost as cb

from .differentiable_adaptive_threshold import COHORT_PROFILES


FEATURE_NAMES = [
    "age",
    "gender",             # 0: Female, 1: Male
    "bmi",
    "sleep_position",     # 0: Back/Supine, 1: Side/Lateral, 2: Stomach/Prone
    "snore_frequency",    # 0 to 4
    "daytime_fatigue",    # 0 to 4
    "choking_awakenings", # 0 or 1
    "has_smartwatch",     # 0 or 1
    "stop_bang_score"     # 0 to 8
]

COHORT_LABELS = list(COHORT_PROFILES.keys())
LABEL_TO_IDX = {k: i for i, k in enumerate(COHORT_LABELS)}
IDX_TO_LABEL = {i: k for i, k in enumerate(COHORT_LABELS)}


def generate_synthetic_clinical_training_data(num_samples: int = 3000) -> Tuple[np.ndarray, np.ndarray]:
    """
    Generates synthetic tabular clinical survey profiles matching realistic demographic distributions.
    """
    np.random.seed(42)
    X = []
    y = []

    for _ in range(num_samples):
        # Pick a target cohort
        target_cohort = np.random.choice(COHORT_LABELS)
        target_idx = LABEL_TO_IDX[target_cohort]
        
        # Default demographic draws
        age = np.random.randint(18, 80)
        gender = np.random.choice([0, 1])
        bmi = np.random.normal(26.5, 4.5)
        pos = np.random.choice([0, 1, 2], p=[0.4, 0.5, 0.1])
        snore = np.random.randint(0, 5)
        fatigue = np.random.randint(0, 5)
        choking = 1 if np.random.rand() < 0.25 else 0
        watch = 1 if np.random.rand() < 0.6 else 0
        
        # Condition features on specific cohort profiles
        if target_cohort == "young_athlete":
            age = np.random.randint(18, 32)
            bmi = np.random.normal(22.0, 2.0)
            snore = np.random.choice([0, 1], p=[0.8, 0.2])
            fatigue = np.random.choice([0, 1])
            choking = 0
        elif target_cohort == "senior_high_risk":
            age = np.random.randint(65, 85)
            bmi = np.random.normal(30.0, 4.0)
            snore = np.random.choice([2, 3, 4])
            fatigue = np.random.choice([2, 3, 4])
            choking = np.random.choice([0, 1], p=[0.4, 0.6])
        elif target_cohort == "snoring_mild":
            age = np.random.randint(35, 65)
            bmi = np.random.normal(28.0, 3.5)
            snore = np.random.choice([3, 4])
            pos = 0 # supine
        elif target_cohort == "pediatric_adolescent":
            age = np.random.randint(6, 17)
            bmi = np.random.normal(19.0, 2.5)
            snore = np.random.choice([0, 1, 2])
        elif target_cohort == "pregnancy_third_trimester":
            age = np.random.randint(22, 38)
            gender = 0 # female
            bmi = np.random.normal(29.0, 3.0)
            fatigue = np.random.choice([3, 4])
        elif target_cohort == "copd_respiratory":
            age = np.random.randint(50, 78)
            fatigue = 4
            choking = 1
            
        # Calculate STOP-BANG
        stop_bang = 0
        if snore >= 3: stop_bang += 1
        if fatigue >= 3: stop_bang += 1
        if choking == 1: stop_bang += 1
        if bmi >= 30: stop_bang += 1
        if age >= 50: stop_bang += 1
        if gender == 1: stop_bang += 1

        row = [age, gender, bmi, pos, snore, fatigue, choking, watch, stop_bang]
        X.append(row)
        y.append(target_idx)

    return np.array(X, dtype=np.float32), np.array(y, dtype=np.int32)


class CatBoostCohortClassifier:
    """
    CatBoost Classifier that assigns a patient profile to their optimal clinical baseline.
    """
    def __init__(self, user_id: str = "default_user"):
        self.user_id = user_id
        self.model = cb.CatBoostClassifier(
            iterations=150,
            learning_rate=0.08,
            depth=5,
            loss_function="MultiClass",
            verbose=False,
            random_seed=42
        )
        self.is_trained = False
        self._ensure_trained()

    def _get_user_model_path(self) -> str:
        clean_user = "".join(c for c in self.user_id if c.isalnum() or c in "_-").lower()
        model_dir = os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
            "local_user",
            clean_user,
            "model"
        )
        os.makedirs(model_dir, exist_ok=True)
        return os.path.join(model_dir, "catboost_classifier.cbm")

    def _ensure_trained(self):
        path = self._get_user_model_path()
        if os.path.exists(path):
            try:
                self.model.load_model(path)
                self.is_trained = True
                return
            except Exception:
                pass
                
        # Train on synthetic clinical data
        X_train, y_train = generate_synthetic_clinical_training_data(num_samples=2500)
        self.model.fit(X_train, y_train)
        self.is_trained = True
        try:
            self.model.save_model(path)
        except Exception:
            pass

    def predict_cohort(self, profile: Dict[str, Any]) -> Dict[str, Any]:
        """
        Classifies an incoming patient health survey into a clinical cohort with confidence scores.
        """
        age = float(profile.get("age", 45))
        gender = 1 if profile.get("gender") == "male" else 0
        
        # Approximate BMI
        bmi_cat = profile.get("bmiCategory", "normal")
        bmi_val = 22.5 if bmi_cat == "normal" else 27.5 if bmi_cat == "overweight" else 33.0 if bmi_cat == "obese" else 18.0
        
        pos_str = profile.get("sleepPosition", "back")
        pos_val = 0 if pos_str == "back" else 1 if pos_str == "side" else 2
        
        snore = float(profile.get("snoreFrequency", 2))
        fatigue = float(profile.get("daytimeFatigue", 2))
        choking = 1 if profile.get("chokingAwakenings") else 0
        watch = 1 if profile.get("hasSmartwatch") else 0
        
        # STOP-BANG
        stop_bang = 0
        if snore >= 3: stop_bang += 1
        if fatigue >= 3: stop_bang += 1
        if choking == 1: stop_bang += 1
        if bmi_val >= 30: stop_bang += 1
        if age >= 50: stop_bang += 1
        if gender == 1: stop_bang += 1

        feature_vector = np.array([[age, gender, bmi_val, pos_val, snore, fatigue, choking, watch, stop_bang]], dtype=np.float32)
        
        probs = self.model.predict_proba(feature_vector)[0]
        pred_idx = int(np.argmax(probs))
        pred_cohort_id = IDX_TO_LABEL[pred_idx]
        confidence = float(probs[pred_idx])

        # Get top 3 cohort candidates
        top_indices = np.argsort(probs)[::-1][:3]
        candidates = [
            {
                "cohort_id": IDX_TO_LABEL[int(idx)],
                "name": COHORT_PROFILES[IDX_TO_LABEL[int(idx)]]["name"],
                "probability": round(float(probs[idx]) * 100, 1)
            }
            for idx in top_indices
        ]

        cohort_data = COHORT_PROFILES[pred_cohort_id]

        return {
            "matched_cohort_id": pred_cohort_id,
            "cohort_name": cohort_data["name"],
            "category": cohort_data["category"],
            "confidence_pct": round(confidence * 100, 1),
            "apnea_risk_prior": cohort_data["apnea_risk_prior"],
            "learned_threshold_theta": cohort_data["threshold_offset"],
            "decision_temperature_tau": cohort_data["temperature"],
            "typical_hr": cohort_data["typical_hr"],
            "typical_resp": cohort_data["typical_resp"],
            "reference_datasets": cohort_data["reference_datasets"],
            "top_cohort_candidates": candidates,
            "classifier_type": "CatBoost (Gradient Boosted Trees)",
            "model_saved_path": self._get_user_model_path()
        }
