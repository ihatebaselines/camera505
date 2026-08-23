"""
LIFE / THORES Platform - Health Onboarding Quiz & Cohort Matching Engine
Maps user physiological questionnaire responses to pre-trained foundation baselines
calibrated on 206,318 hours of clinical data.
"""

from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field
from .differentiable_adaptive_threshold import COHORT_PROFILES, PersonalizedCohortCalibrator


class HealthQuizResponse(BaseModel):
    user_name: str = Field("Natasha", description="User display name")
    age: int = Field(58, ge=12, le=110, description="Age in years")
    gender: str = Field("female", description="female, male, other")
    sleep_position: str = Field("back", description="back, side, stomach, variable")
    snore_frequency: int = Field(2, ge=0, le=3, description="0: Never, 1: Rarely, 2: Often, 3: Loud with gasping")
    daytime_fatigue: int = Field(3, ge=1, le=5, description="1 (Refreshed) to 5 (Constantly exhausted)")
    choking_awakenings: bool = Field(False, description="Waking up gasping or choking")
    bmi_category: str = Field("normal", description="underweight, normal, overweight, obese")
    has_smartwatch: bool = Field(False, description="Whether user pairs external smartwatch")


# ─── Built-in Demo Personas ──────────────────────────────────────────────────
DEMO_PERSONAS: Dict[str, Dict[str, Any]] = {
    "natasha": {
        "id": "natasha",
        "name": "Natasha",
        "age": 58,
        "gender": "female",
        "avatar": "N",
        "tag": "Default / Calibrated (12 Nights)",
        "cohort_key": "snoring_mild",
        "sleep_position": "back",
        "snore_frequency": 2,
        "daytime_fatigue": 3,
        "choking_awakenings": False,
        "bmi_category": "normal",
        "baseline_summary": "14 /min typical breathing, stable regularity, 12-16 /min normal range. Built from 12 nights.",
        "calibrated_nights": 12,
        "respiratory_score": 91
    },
    "alex": {
        "id": "alex",
        "name": "Alex",
        "age": 26,
        "gender": "male",
        "avatar": "A",
        "tag": "Young Athletic (Fantasia Cohort)",
        "cohort_key": "young_athlete",
        "sleep_position": "side",
        "snore_frequency": 0,
        "daytime_fatigue": 1,
        "choking_awakenings": False,
        "bmi_category": "normal",
        "baseline_summary": "13 /min typical breathing, high HRV (RMSSD 74ms), 52 BPM resting HR. Minimal snoring.",
        "calibrated_nights": 18,
        "respiratory_score": 97
    },
    "mihai": {
        "id": "mihai",
        "name": "Mihai",
        "age": 49,
        "gender": "male",
        "avatar": "M",
        "tag": "Elevated Risk (SHHS/UCDDB Cohort)",
        "cohort_key": "senior_high_risk",
        "sleep_position": "back",
        "snore_frequency": 3,
        "daytime_fatigue": 5,
        "choking_awakenings": True,
        "bmi_category": "overweight",
        "baseline_summary": "16 /min typical breathing, frequent flow limitations on back, high acoustic snoring power.",
        "calibrated_nights": 6,
        "respiratory_score": 78
    },
    "elena": {
        "id": "elena",
        "name": "Elena",
        "age": 34,
        "gender": "female",
        "avatar": "E",
        "tag": "Healthy Adult (CAP Sleep Cohort)",
        "cohort_key": "healthy_adult",
        "sleep_position": "side",
        "snore_frequency": 1,
        "daytime_fatigue": 2,
        "choking_awakenings": False,
        "bmi_category": "normal",
        "baseline_summary": "14.5 /min typical breathing, normal sinus rhythm, highly consistent deep sleep cycles.",
        "calibrated_nights": 14,
        "respiratory_score": 94
    }
}


def evaluate_health_quiz(quiz: HealthQuizResponse) -> Dict[str, Any]:
    """
    Evaluates questionnaire and selects the optimal pre-trained cohort baseline.
    """
    # Calculate Risk Score based on clinical predictors (STOP-BANG inspired)
    risk_score = 0
    if quiz.age >= 50:
        risk_score += 2
    elif quiz.age >= 35:
        risk_score += 1
        
    if quiz.snore_frequency >= 2:
        risk_score += 2
    if quiz.snore_frequency == 3:
        risk_score += 1
        
    if quiz.daytime_fatigue >= 4:
        risk_score += 2
    elif quiz.daytime_fatigue >= 3:
        risk_score += 1
        
    if quiz.choking_awakenings:
        risk_score += 3
        
    if quiz.bmi_category in ["overweight", "obese"]:
        risk_score += 2
        
    if quiz.sleep_position == "back":
        risk_score += 1  # Supine vulnerability factor

    # Map to pre-trained cohort
    if risk_score >= 7 or (quiz.age >= 60 and quiz.snore_frequency >= 2):
        cohort_key = "senior_high_risk"
    elif risk_score >= 4 or quiz.snore_frequency >= 2:
        cohort_key = "snoring_mild"
    elif quiz.age <= 30 and quiz.snore_frequency == 0 and quiz.daytime_fatigue <= 2:
        cohort_key = "young_athlete"
    else:
        cohort_key = "healthy_adult"

    cohort = COHORT_PROFILES[cohort_key]
    
    return {
        "user_name": quiz.user_name,
        "age": quiz.age,
        "risk_score_points": risk_score,
        "matched_cohort_key": cohort_key,
        "cohort_name": cohort["name"],
        "cohort_description": cohort["description"],
        "apnea_risk_prior": cohort["apnea_risk_prior"],
        "calibrated_parameters": {
            "threshold_offset_theta": cohort["threshold_offset"],
            "temperature_tau": cohort["temperature"],
            "feature_weights_W": cohort["weights"],
            "expected_typical_hr": cohort["typical_hr"],
            "expected_typical_resp": cohort["typical_resp"],
        },
        "reference_datasets": cohort["reference_datasets"],
        "message": f"Pre-trained baseline selected: {cohort['name']}. Calibrated from {', '.join(cohort['reference_datasets'])} datasets."
    }
