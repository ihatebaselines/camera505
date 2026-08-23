"""
CAMERA 505 Platform - ESRS & AASM Clinical Dataset Generator
Generates a clinically correlated demographic and polysomnographic dataset
incorporating ESRS (European Sleep Research Society) physiological traits:
- Gender-specific collapsibility (male pharyngeal fat vs female post-menopausal risk)
- BMI categories (Athletic, Normal, Overweight, Obese I/II, Morbidly Obese)
- Age-dependent loop gain & autonomic tone
- Postural dependence (Supine gravitational airway collapse vs Lateral)
- Ground-truth AHI, optimal baseline threshold theta, and temperature tau.

Saves dataset to: data/catboost_esrs_dataset.csv
"""

import os
import csv
import numpy as np
import pandas as pd


ESRS_COHORTS = [
    "young_athlete",
    "healthy_adult",
    "snoring_mild",
    "obese_high_risk",
    "senior_high_risk",
    "copd_respiratory",
    "arrhythmia_afib",
    "pediatric_adolescent",
    "insomnia_hyperarousal",
    "pregnancy_third_trimester",
    "post_covid_dyspnea",
    "central_apnea_cheyne_stokes"
]


def generate_esrs_dataset(num_samples: int = 10000, seed: int = 42) -> pd.DataFrame:
    """
    Generates a medically correlated dataset of patient profiles with ESRS features.
    """
    np.random.seed(seed)
    records = []

    for i in range(num_samples):
        # 1. Demographic sampling
        gender = np.random.choice(["female", "male"], p=[0.48, 0.52])
        gender_num = 1 if gender == "male" else 0
        
        # Age distribution
        age_group = np.random.choice(["pediatric", "young", "middle", "senior"], p=[0.08, 0.28, 0.44, 0.20])
        if age_group == "pediatric":
            age = np.random.randint(6, 18)
        elif age_group == "young":
            age = np.random.randint(18, 36)
        elif age_group == "middle":
            age = np.random.randint(36, 65)
        else:
            age = np.random.randint(65, 86)

        # BMI distribution correlated with age and gender
        if age_group == "pediatric":
            bmi = float(np.random.normal(18.5, 2.2))
        else:
            base_bmi = 24.0 if gender == "female" else 25.5
            bmi_offset = 0.08 * (age - 25) + np.random.normal(0, 4.2)
            bmi = float(np.clip(base_bmi + bmi_offset, 16.0, 48.0))

        # BMI Category (ESRS standard)
        if bmi < 20.0:
            bmi_cat = "slim_athletic"
        elif bmi < 25.0:
            bmi_cat = "normal"
        elif bmi < 30.0:
            bmi_cat = "overweight"
        elif bmi < 35.0:
            bmi_cat = "obese_1"
        else:
            bmi_cat = "morbidly_obese"

        # Neck circumference (cm) - strongly correlated with BMI & gender (AASM risk factor)
        base_neck = 34.0 if gender == "female" else 39.0
        neck_circ = float(base_neck + (bmi - 25.0) * 0.45 + np.random.normal(0, 1.2))

        # Sleep posture (0: Supine/Back, 1: Lateral/Side, 2: Prone/Stomach)
        posture = np.random.choice(["back", "side", "stomach"], p=[0.42, 0.48, 0.10])
        posture_num = 0 if posture == "back" else 1 if posture == "side" else 2

        # Snoring frequency & loudness (0 to 4)
        snore_prob_base = 0.15 + (0.02 * max(0, bmi - 22)) + (0.15 if gender == "male" else 0.05) + (0.10 if posture == "back" else 0.0)
        snore_score = int(np.clip(np.random.binomial(4, min(0.9, snore_prob_base)), 0, 4))

        # Daytime fatigue (0 to 4)
        fatigue_score = int(np.clip(np.random.binomial(4, 0.25 + 0.015 * (age / 10.0)), 0, 4))

        # Choking awakenings (0 or 1)
        choking = 1 if (snore_score >= 3 and bmi >= 28.0 and np.random.rand() < 0.45) else 0

        # Smartwatch / Fitness tracker present
        has_watch = 1 if np.random.rand() < 0.55 else 0

        # Calculate STOP-BANG score (0 to 8)
        stop_bang = 0
        if snore_score >= 3: stop_bang += 1
        if fatigue_score >= 3: stop_bang += 1
        if choking == 1: stop_bang += 1
        if bmi >= 30.0: stop_bang += 1
        if age >= 50: stop_bang += 1
        if (gender == "male" and neck_circ >= 43.0) or (gender == "female" and neck_circ >= 40.0): stop_bang += 1
        if gender == "male": stop_bang += 1
        if np.random.rand() < (0.4 if age > 55 else 0.1): stop_bang += 1 # Hypertension

        # 2. Assign ESRS Demographic Cohort & Ground Truths
        if age < 18:
            cohort = "pediatric_adolescent"
            typical_hr = float(np.random.normal(82.0, 5.0))
            typical_resp = float(np.random.normal(19.0, 1.8))
            opt_theta = -0.15
            opt_tau = 0.42
            ahi = float(np.random.exponential(1.5))
        elif bmi < 22.0 and age < 35 and snore_score <= 1:
            cohort = "young_athlete"
            typical_hr = float(np.random.normal(54.0, 4.0)) # High vagal tone
            typical_resp = float(np.random.normal(12.5, 1.2))
            opt_theta = -0.22
            opt_tau = 0.38
            ahi = float(np.random.exponential(1.2))
        elif bmi >= 33.0 and stop_bang >= 4:
            cohort = "obese_high_risk"
            typical_hr = float(np.random.normal(78.0, 6.0))
            typical_resp = float(np.random.normal(17.5, 2.0))
            opt_theta = 0.58
            opt_tau = 0.62
            ahi = float(np.random.uniform(18.0, 45.0)) # Moderate to severe
        elif age >= 68:
            cohort = "senior_high_risk"
            typical_hr = float(np.random.normal(68.0, 5.5))
            typical_resp = float(np.random.normal(16.0, 1.8))
            opt_theta = 0.48
            opt_tau = 0.58
            ahi = float(np.random.uniform(12.0, 32.0))
        elif snore_score >= 3:
            cohort = "snoring_mild"
            typical_hr = float(np.random.normal(72.0, 5.0))
            typical_resp = float(np.random.normal(15.0, 1.5))
            opt_theta = 0.35
            opt_tau = 0.52
            ahi = float(np.random.uniform(6.0, 16.0))
        elif fatigue_score >= 3 and snore_score <= 1:
            cohort = "insomnia_hyperarousal"
            typical_hr = float(np.random.normal(76.0, 5.0))
            typical_resp = float(np.random.normal(15.8, 1.4))
            opt_theta = 0.12
            opt_tau = 0.45
            ahi = float(np.random.exponential(2.0))
        else:
            cohort = "healthy_adult"
            typical_hr = float(np.random.normal(65.0, 4.5))
            typical_resp = float(np.random.normal(14.0, 1.3))
            opt_theta = 0.08
            opt_tau = 0.48
            ahi = float(np.random.exponential(2.8))

        # Adjust theta with posture bias (Supine +0.15 vs Lateral -0.05)
        if posture == "back":
            opt_theta += 0.15
        elif posture == "side":
            opt_theta -= 0.05

        records.append({
            "patient_id": f"ESRS-{i+1:05d}",
            "age": age,
            "gender": gender,
            "gender_num": gender_num,
            "bmi": round(bmi, 1),
            "bmi_category": bmi_cat,
            "neck_circumference_cm": round(neck_circ, 1),
            "sleep_position": posture,
            "sleep_position_num": posture_num,
            "snore_frequency": snore_score,
            "daytime_fatigue": fatigue_score,
            "choking_awakenings": choking,
            "has_smartwatch": has_watch,
            "stop_bang_score": stop_bang,
            "matched_cohort": cohort,
            "ground_truth_ahi": round(ahi, 1),
            "optimal_threshold_theta": round(opt_theta, 4),
            "optimal_temperature_tau": round(opt_tau, 4),
            "typical_resting_hr": round(typical_hr, 1),
            "typical_resp_rpm": round(typical_resp, 1)
        })

    df = pd.DataFrame(records)
    return df


if __name__ == "__main__":
    data_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "data")
    os.makedirs(data_dir, exist_ok=True)
    out_csv = os.path.join(data_dir, "catboost_esrs_dataset.csv")
    
    print(f"[ESRS] Generating 10,000 correlated patient profiles...")
    df = generate_esrs_dataset(num_samples=10000)
    df.to_csv(out_csv, index=False)
    print(f"[ESRS] Saved clinical dataset to: {out_csv} ({len(df)} rows)")
