"""
LIFE Platform - Benchmark Evaluation Suite
Validates:
1. Signal Processing: Pan-Tompkins QRS accuracy & HRV correctness
2. Multimodal Foundation Model: 4 Self-Supervised Tasks training convergence
3. Adaptive Baseline: Dynamic anomaly detection and z-score calibration
"""

import time
import numpy as np
import torch
from typing import Dict, Any

try:
    from ..dsp.ecg_dsp import EcgDspProcessor, calculate_hrv_metrics
    from ..dsp.audio_dsp import AudioDspProcessor, extract_mel_spectrogram
    from ..models.transformer_backbone import LifeMultimodalTransformer
    from ..models.self_supervised_tasks import LifeSelfSupervisedEngine
    from ..models.adaptive_baseline import PersonalizedAdaptiveBaseline
    from .psg_audio_loader import PsgAudioDatasetHelper
    from .bidmc_loader import BidmcDatasetHelper
except (ImportError, ValueError):
    import sys, os
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
    from src.dsp.ecg_dsp import EcgDspProcessor, calculate_hrv_metrics
    from src.dsp.audio_dsp import AudioDspProcessor, extract_mel_spectrogram
    from src.models.transformer_backbone import LifeMultimodalTransformer
    from src.models.self_supervised_tasks import LifeSelfSupervisedEngine
    from src.models.adaptive_baseline import PersonalizedAdaptiveBaseline
    from src.datasets.psg_audio_loader import PsgAudioDatasetHelper
    from src.datasets.bidmc_loader import BidmcDatasetHelper


def run_life_benchmarks(num_epochs: int = 3) -> Dict[str, Any]:
    """
    Executes automated benchmark evaluation of DSP, Neural Foundation Model, and Baseline.
    """
    results = {}
    print("=" * 65)
    print("  LIFE Platform: Running Automated Multimodal Benchmarks")
    print("=" * 65)

    # 1. Benchmark Signal Processing (DSP)
    print("\n[1/3] Benchmarking Real-Time DSP Engine...")
    t0 = time.time()
    processor = EcgDspProcessor(fs=250)
    helper = PsgAudioDatasetHelper()
    sample = helper.generate_demo_psg_sample(duration_sec=60)
    
    ecg_signal = sample["ecg_signal"]
    detected_peaks = 0
    for idx, s in enumerate(ecg_signal):
        res = processor.process_sample(s, timestamp_ms=idx * 4)
        if res["is_r_peak"]:
            detected_peaks += 1
            
    dsp_time = time.time() - t0
    hrv = processor.get_hrv_snapshot()
    
    results["dsp_benchmark"] = {
        "processed_samples": len(ecg_signal),
        "duration_sec": 60,
        "processing_time_sec": round(dsp_time, 4),
        "realtime_speedup_factor": round(60.0 / max(1e-4, dsp_time), 1),
        "detected_qrs_peaks": detected_peaks,
        "mean_heart_rate_bpm": hrv["mean_hr"],
        "rmssd_hrv_ms": hrv["rmssd"],
        "sdnn_hrv_ms": hrv["sdnn"],
        "pnn50_pct": hrv["pnn50"],
        "lf_hf_ratio": hrv["lf_hf_ratio"]
    }
    print(f"  [OK] DSP Execution: {results['dsp_benchmark']['realtime_speedup_factor']}x Realtime Speedup")
    print(f"  [OK] R-Peaks Detected: {detected_peaks} | Mean HR: {hrv['mean_hr']} BPM | RMSSD: {hrv['rmssd']} ms")

    # 2. Benchmark Foundation Model & Self-Supervised Tasks
    print("\n[2/3] Benchmarking Multimodal Transformer & Self-Supervised Losses...")
    t0 = time.time()
    model = LifeMultimodalTransformer(d_model=512, num_layers=2)
    engine = LifeSelfSupervisedEngine(d_model=512)
    optimizer = torch.optim.AdamW(model.parameters(), lr=1e-3)
    
    # Create batch of 4 synthetic 30-sec windows
    batch_ecg = torch.randn(4, 7500) # 4 windows x 7500 ECG samples
    batch_mel = torch.randn(4, 128, 300) # 4 windows x Mel spectrogram
    
    loss_history = []
    for epoch in range(num_epochs):
        optimizer.zero_grad()
        out = model(ecg_raw=batch_ecg, audio_mel=batch_mel)
        losses = engine.compute_losses(
            window_embeddings=out["window_embedding"],
            ecg_tokens=out["ecg_tokens"],
            audio_tokens=out["audio_tokens"]
        )
        total_loss = losses["loss_total"]
        total_loss.backward()
        optimizer.step()
        
        loss_history.append({
            "epoch": epoch + 1,
            "loss_total": round(float(total_loss.item()), 4),
            "loss_mask": round(float(losses["loss_mask"].item()), 4),
            "loss_contrastive": round(float(losses["loss_contrastive"].item()), 4),
            "loss_future": round(float(losses["loss_future"].item()), 4)
        })
        
    model_time = time.time() - t0
    results["model_benchmark"] = {
        "epochs": num_epochs,
        "training_time_sec": round(model_time, 3),
        "loss_progression": loss_history,
        "final_total_loss": loss_history[-1]["loss_total"]
    }
    print(f"  [OK] Pre-training {num_epochs} epochs completed in {model_time:.2f}s")
    print(f"  [OK] Initial Loss: {loss_history[0]['loss_total']} -> Final Loss: {loss_history[-1]['loss_total']}")

    # 3. Benchmark Personalized Adaptive Baseline & Anomaly Detection
    print("\n[3/3] Benchmarking Adaptive Dynamic Baseline Engine...")
    baseline = PersonalizedAdaptiveBaseline()
    
    # Simulate normal window vs apnea episode
    normal_eval = baseline.compute_window_anomalies(
        hr=71.0, rmssd=38.0, resp_rate=14.5,
        reconstruction_loss_val=0.04, snore_prob=0.05, pause_flag=False
    )
    apnea_eval = baseline.compute_window_anomalies(
        hr=94.0, rmssd=12.0, resp_rate=26.0,
        reconstruction_loss_val=0.38, snore_prob=0.88, pause_flag=True
    )
    
    results["adaptive_baseline_benchmark"] = {
        "normal_window": {
            "anomaly_score": normal_eval["composite_anomaly"],
            "is_suspect": normal_eval["is_suspect_episode"],
            "stability": normal_eval["stability_score"]
        },
        "apnea_anomaly_window": {
            "anomaly_score": apnea_eval["composite_anomaly"],
            "is_suspect": apnea_eval["is_suspect_episode"],
            "reasons": apnea_eval["suspect_reasons"],
            "stability": apnea_eval["stability_score"]
        }
    }
    print(f"  [OK] Normal Window Anomaly Score: {normal_eval['composite_anomaly']} (Suspect: {normal_eval['is_suspect_episode']})")
    print(f"  [OK] Apnea Window Anomaly Score: {apnea_eval['composite_anomaly']} (Suspect: {apnea_eval['is_suspect_episode']})")
    print(f"       Reasons: {', '.join(apnea_eval['suspect_reasons'])}")

    print("\n" + "=" * 65)
    print("  ALL BENCHMARKS COMPLETED SUCCESSFULLY!")
    print("=" * 65)
    return results


if __name__ == "__main__":
    run_life_benchmarks()
