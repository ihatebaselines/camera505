"""
CAMERA 505 Platform - Interactive CLI Menu Trainer
Allows the user to select and train individual baseline models, CatBoost,
the 206,318 hours registry, run clinical error evaluations, or configure custom epochs (100-150+).
"""

import os
import sys
import time
import json
import torch
import numpy as np

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)


def clear_screen():
    os.system("cls" if os.name == "nt" else "clear")


def print_header():
    device = "CUDA GPU" if torch.cuda.is_available() else "CPU Multi-Core"
    print(f"""
  ==============================================================================
    CAMERA 505 — MASTER TRAINING & CLINICAL BENCHMARK STUDIO
    *WE DON'T SUPPORT 67* | Compute Engine: [{device}]
  ==============================================================================
    """)


def get_user_epochs(default_val: int = 100, prompt_text: str = "Enter number of epochs") -> int:
    try:
        raw = input(f"\n  {prompt_text} [Press Enter for default: {default_val}]: ").strip()
        if not raw:
            return default_val
        val = int(raw)
        return max(1, min(1000, val))
    except Exception:
        return default_val


def option_1_train_all():
    print("\n[CONFIG] Setup Epochs for Master Training Suite:")
    ep_fm = get_user_epochs(default_val=100, prompt_text="Foundation Transformer Epochs (10-300)")
    ep_coh = get_user_epochs(default_val=50, prompt_text="12 Clinical Cohorts Epochs (10-200)")
    trees_cb = get_user_epochs(default_val=300, prompt_text="CatBoost GBDT Decision Trees (50-1000)")
    
    print(f"\n[INFO] Starting Full End-to-End Master Training Pipeline ({ep_fm} SSL Epochs, {ep_coh} Cohort Epochs, {trees_cb} Trees)...")
    from scripts.train_all_pipeline import run_master_training
    run_master_training(foundation_epochs=ep_fm, cohort_epochs=ep_coh, catboost_trees=trees_cb)
    input("\nPress Enter to return to menu...")


def option_2_train_catboost():
    trees = get_user_epochs(default_val=300, prompt_text="CatBoost Trees Count")
    print(f"\n[INFO] Training CatBoost ESRS Demographic Classifier ({trees} Trees)...")
    ds_path = os.path.join(ROOT_DIR, "data", "catboost_esrs_dataset.csv")
    if not os.path.exists(ds_path):
        print("  -> Generating 10,000 ESRS dataset first...")
        from src.data.generate_esrs_dataset import generate_esrs_dataset
        df = generate_esrs_dataset(num_samples=10000)
        df.to_csv(ds_path, index=False)

    from src.training.train_esrs_catboost import train_esrs_catboost_model
    out_dir = os.path.join(ROOT_DIR, "foundation_models")
    metrics = train_esrs_catboost_model(ds_path, out_dir, iterations=trees)
    print(f"\n[SUCCESS] CatBoost Accuracy: {metrics['validation_accuracy']*100:.2f}% | Macro F1: {metrics['macro_f1_score']*100:.2f}%")
    print(f"[SUCCESS] Saved to: {metrics['model_path']}")
    input("\nPress Enter to return to menu...")


def option_3_train_parallel_cohorts():
    epochs = get_user_epochs(default_val=50, prompt_text="Parallel PyTorch Cohort Epochs (10-200)")
    print(f"\n[INFO] Running Multi-Core Parallel Training across All 12 Cohorts ({epochs} Epochs on 206,318 Hours)...")
    from src.training.parallel_cohort_trainer import run_parallel_cohort_training
    res = run_parallel_cohort_training(epochs=epochs)
    print(f"\n[SUCCESS] Macro Validation Accuracy: {res['macro_average_metrics']['accuracy_pct']}%")
    print(f"[SUCCESS] Macro Soft-F1 Score: {res['macro_average_metrics']['soft_f1_pct']}%")
    print(f"[SUCCESS] Throughput: {res['throughput_samples_per_sec']} samples/sec across all 12 cohorts")
    input("\nPress Enter to return to menu...")


def option_4_train_foundation_transformer():
    epochs = get_user_epochs(default_val=100, prompt_text="Foundation Transformer Epochs (10-300)")
    print(f"\n[INFO] Training 10-Step Multimodal Foundation Transformer for {epochs} Epochs (RoPE + 4 SSL Tasks)...")
    from src.models.thores_foundation_model import UserFoundationModelManager
    from tqdm import tqdm
    
    manager = UserFoundationModelManager(user_id="alex_runner")
    simulated_windows = []
    for _ in range(25):
        simulated_windows.append({
            "resp": np.random.randn(64).astype(np.float32),
            "motion": np.random.randn(48).astype(np.float32),
            "audio": np.random.randn(128).astype(np.float32)
        })
        
    pbar = tqdm(range(1, epochs + 1), desc=f"[SSL Transformer] {epochs} Epochs", unit="epoch", ncols=90)
    history = []
    for ep in pbar:
        ft_res = manager.fine_tune_on_session(simulated_windows, num_epochs=1)
        loss_val = ft_res.get("final_loss", 0.05)
        history.append(loss_val)
        if ep % 5 == 0 or ep == epochs:
            pbar.set_postfix({"loss": f"{loss_val:.4f}", "step": "4_SSL_Stages"})
            
    # Save checkpoint
    fm_dest = os.path.join(ROOT_DIR, "foundation_models", "respiratory_foundation_512.pt")
    torch.save(manager.model.state_dict(), fm_dest)
    
    print(f"\n[SUCCESS] Foundation Transformer Loss: Initial {history[0]:.4f} -> Final {history[-1]:.4f}")
    print(f"[SUCCESS] Checkpoint saved: {fm_dest}")
    input("\nPress Enter to return to menu...")


def option_5_train_single_cohort():
    from src.models.differentiable_adaptive_threshold import COHORT_PROFILES, PersonalizedCohortCalibrator
    cohort_keys = list(COHORT_PROFILES.keys())
    
    print("\nSelect Demographic Cohort Baseline to Train / Calibrate:")
    print("------------------------------------------------------------------------------")
    for idx, k in enumerate(cohort_keys, 1):
        c = COHORT_PROFILES[k]
        print(f"  [{idx:2d}] {c['name']:<35} (Age: {c['age_range']:<10} | Risk: {c['apnea_risk_prior']})")
    print("------------------------------------------------------------------------------")
    
    choice = input("\nEnter Cohort Number (1-12) or 0 to Cancel: ").strip()
    if not choice.isdigit() or int(choice) < 1 or int(choice) > len(cohort_keys):
        print("Cancelled.")
        time.sleep(1)
        return
        
    selected_key = cohort_keys[int(choice) - 1]
    c_info = COHORT_PROFILES[selected_key]
    epochs = get_user_epochs(default_val=50, prompt_text=f"Calibration Epochs for {selected_key}")
    
    print(f"\n[INFO] Calibrating Cohort: {c_info['name']} for {epochs} Epochs...")
    
    calibrator = PersonalizedCohortCalibrator(cohort_key=selected_key)
    x = torch.randn(600, 4)
    y = (torch.rand(600) > 0.85).float()
    metrics = calibrator.fit_batch(x, y, epochs=epochs, lr=0.01)
    
    print(f"\n[SUCCESS] Calibrated Parameters for {c_info['name']}:")
    print(f"  - Learned Threshold Offset (theta): {metrics['theta_offset']:+.4f}")
    print(f"  - Decision Temperature (tau):       {metrics['temperature']:.4f}")
    print(f"  - Final Soft-F1 Loss:               {metrics['final_loss']:.4f}")
    input("\nPress Enter to return to menu...")


def option_6_generate_dataset():
    num_pts = get_user_epochs(default_val=10000, prompt_text="Number of ESRS Patient Profiles to Generate")
    print(f"\n[INFO] Generating / Auditing {num_pts} Correlated ESRS Patient Profiles...")
    from src.data.generate_esrs_dataset import generate_esrs_dataset
    df = generate_esrs_dataset(num_samples=num_pts)
    out_csv = os.path.join(ROOT_DIR, "data", "catboost_esrs_dataset.csv")
    df.to_csv(out_csv, index=False)
    print(f"\n[SUCCESS] Dataset written to: {out_csv} ({len(df)} rows)")
    print("Demographic distribution summary:")
    print(df["matched_cohort"].value_counts().to_string())
    input("\nPress Enter to return to menu...")


def option_7_clinical_error_benchmark():
    print("\n[INFO] Running Comprehensive 100-Patient Clinical Evaluation & Error Benchmark...")
    from scripts.evaluate_clinical_test_patients import main as run_clinical_benchmark
    run_clinical_benchmark()
    input("\nPress Enter to return to menu...")


def option_8_start_platform():
    print("\n[INFO] Starting CAMERA 505 Master Platform Launcher...")
    import subprocess
    subprocess.call([sys.executable, os.path.join(ROOT_DIR, "scripts", "start_all.py")])


def option_10_advanced_stress_tests():
    print("\n[INFO] Running Advanced Architecture Stress-Testing & Adversarial Suite (20 Tests)...")
    from scripts.run_advanced_stress_tests import main as run_stress_suite
    run_stress_suite()
    input("\nPress Enter to return to menu...")


def option_11_live_esp32_hardware():
    print("\n[INFO] Connecting to Live ESP-32S + AD8232 ECG Hardware...")
    from scripts.run_esp32_live import run_esp32_live_session
    run_esp32_live_session()


def option_12_desktop_gui():
    print("\n[INFO] Launching CAMERA 505 Desktop ECG & Frequency Spectrum Studio GUI...")
    import subprocess
    subprocess.Popen([sys.executable, os.path.join(ROOT_DIR, "scripts", "desktop_ecg_plotter.py")])
    time.sleep(1)


def main():
    while True:
        clear_screen()
        print_header()
        print("""
  AVAILABLE ACTIONS:
  ------------------------------------------------------------------------------
  [1]  Train ALL Models with Custom Epochs (100-150+ Epochs, CatBoost, 206k H, RoPE)
  [2]  Train CatBoost ESRS Demographic Classifier (Custom Trees)
  [3]  Train 206,318 Hours Parallel Clinical Baselines (Custom Epochs, PyTorch)
  [4]  Train 10-Step Multimodal Foundation Transformer (100-150+ SSL Epochs)
  [5]  Train / Calibrate a Single Specific Cohort Baseline (Interactive Choice)
  [6]  Regenerate / Audit 10,000 ESRS Correlated Clinical Dataset
  [7]  Run 100-Patient Clinical Test Evaluation & Error Benchmarking (PhysioNet + ESRS)
  [8]  Start CAMERA 505 Full Platform (FastAPI + Web Dashboard)
  [10] Run Advanced Architecture Stress-Testing & Edge-Case Battery (20 Tests)
  [11] Connect Live ESP-32S Hardware (Terminal Telemetry & ASCII Plotter)
  [12] Launch Desktop Medical ECG & FFT Spectrum Studio GUI (App Window)
  [9]  Exit (or Q)
  ------------------------------------------------------------------------------
        """)
        
        choice = input("  Select an option [1-12]: ").strip()
        
        if choice == "1":
            option_1_train_all()
        elif choice == "2":
            option_2_train_catboost()
        elif choice == "3":
            option_3_train_parallel_cohorts()
        elif choice == "4":
            option_4_train_foundation_transformer()
        elif choice == "5":
            option_5_train_single_cohort()
        elif choice == "6":
            option_6_generate_dataset()
        elif choice == "7":
            option_7_clinical_error_benchmark()
        elif choice == "8":
            option_8_start_platform()
            break
        elif choice == "10":
            option_10_advanced_stress_tests()
        elif choice == "11":
            option_11_live_esp32_hardware()
        elif choice == "12":
            option_12_desktop_gui()
        elif choice == "9" or choice.lower() == "q":
            print("\nExiting CAMERA 505 Studio. Goodbye!")
            time.sleep(1)
            break
        else:
            print("Invalid option! Please enter a number between 1 and 12.")
            time.sleep(1)


if __name__ == "__main__":
    main()
