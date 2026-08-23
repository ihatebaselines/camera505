"""
CAMERA 505 Platform - ESRS CatBoost Classifier Trainer
Trains Gradient Boosted Decision Trees on the 10,000 patient ESRS clinical dataset.
Outputs model weights and feature importances to: foundation_models/catboost_esrs_classifier.cbm
"""

import os
import json
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, accuracy_score, f1_score
import catboost as cb


FEATURE_COLS = [
    "age",
    "gender_num",
    "bmi",
    "neck_circumference_cm",
    "sleep_position_num",
    "snore_frequency",
    "daytime_fatigue",
    "choking_awakenings",
    "has_smartwatch",
    "stop_bang_score"
]


def train_esrs_catboost_model(
    dataset_path: str,
    output_dir: str,
    iterations: int = 250,
    learning_rate: float = 0.06,
    depth: int = 6
) -> dict:
    """
    Trains CatBoost on ESRS dataset and evaluates multi-class accuracy.
    """
    df = pd.read_csv(dataset_path)
    
    X = df[FEATURE_COLS]
    y = df["matched_cohort"]
    
    cohort_classes = sorted(y.unique().tolist())
    class_to_idx = {c: i for i, c in enumerate(cohort_classes)}
    y_idx = y.map(class_to_idx)

    X_train, X_test, y_train, y_test = train_test_split(
        X, y_idx, test_size=0.20, random_state=42, stratify=y_idx
    )

    has_gpu = False
    try:
        import torch
        has_gpu = torch.cuda.is_available()
    except Exception:
        pass

    task_type = "GPU" if has_gpu else "CPU"
    print(f"[CatBoost] Training on {len(X_train)} samples across {len(cohort_classes)} ESRS cohorts on [{task_type}]...")

    try:
        model = cb.CatBoostClassifier(
            iterations=iterations,
            learning_rate=learning_rate,
            depth=depth,
            loss_function="MultiClass",
            eval_metric="MultiClass",
            task_type=task_type,
            random_seed=42,
            verbose=50
        )
        model.fit(X_train, y_train, eval_set=(X_test, y_test), early_stopping_rounds=30)
    except Exception as e:
        if task_type == "GPU":
            print(f"[CatBoost] GPU failed ({e}), falling back to CPU...")
            model = cb.CatBoostClassifier(
                iterations=iterations,
                learning_rate=learning_rate,
                depth=depth,
                loss_function="MultiClass",
                eval_metric="MultiClass",
                task_type="CPU",
                random_seed=42,
                verbose=50
            )
            model.fit(X_train, y_train, eval_set=(X_test, y_test), early_stopping_rounds=30)
        else:
            raise e

    y_pred = model.predict(X_test)
    acc = float(accuracy_score(y_test, y_pred))
    macro_f1 = float(f1_score(y_test, y_pred, average="macro"))

    print(f"[CatBoost] Validation Accuracy: {acc*100:.2f}% | Macro F1: {macro_f1*100:.2f}%")

    # Feature Importance
    importances = model.get_feature_importance()
    feature_imp_list = [
        {"feature": name, "importance_pct": round(float(imp), 2)}
        for name, imp in sorted(zip(FEATURE_COLS, importances), key=lambda x: x[1], reverse=True)
    ]

    os.makedirs(output_dir, exist_ok=True)
    model_path = os.path.join(output_dir, "catboost_esrs_classifier.cbm")
    metrics_path = os.path.join(output_dir, "catboost_metrics.json")

    model.save_model(model_path)

    metrics_payload = {
        "model_name": "CAMERA 505 ESRS CatBoost Classifier",
        "dataset_rows": len(df),
        "train_rows": len(X_train),
        "test_rows": len(X_test),
        "validation_accuracy": round(acc, 4),
        "macro_f1_score": round(macro_f1, 4),
        "cohort_classes": cohort_classes,
        "feature_importances": feature_imp_list,
        "model_path": model_path
    }

    with open(metrics_path, "w", encoding="utf-8") as f:
        json.dump(metrics_payload, f, indent=2)

    print(f"[CatBoost] Model saved to: {model_path}")
    print(f"[CatBoost] Metrics saved to: {metrics_path}")
    return metrics_payload


if __name__ == "__main__":
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
    ds_path = os.path.join(base_dir, "data", "catboost_esrs_dataset.csv")
    out_dir = os.path.join(base_dir, "foundation_models")
    train_esrs_catboost_model(ds_path, out_dir)
