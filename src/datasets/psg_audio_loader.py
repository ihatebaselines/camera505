"""
LIFE Platform - PSG-Audio Dataset Helper (ScienceDB doi: 10.11922/sciencedb.00345)
Handles metadata inspection, download URLs, and conversion of multi-channel PSG (ECG + Audio)
into paired 30-second tokens for multimodal foundation pre-training and validation.
"""

import os
import json
import numpy as np
from typing import Dict, List, Tuple, Optional, Any


class PsgAudioDatasetHelper:
    """
    Interface for PSG-Audio Dataset (Scientific Data / ScienceDB).
    Dataset features:
    - 212 overnight Polysomnography (PSG) recordings with synchronized ambient and tracheal audio.
    - Annotations: Obstructive Apnea, Central Apnea, Mixed Apnea, Hypopnea, Cheyne-Stokes, Snoring, Brady/Tachycardia.
    """
    DOI = "10.11922/sciencedb.00345"
    PORTAL_URL = "https://www.sciencedb.cn/en/detail?dataSetId=797746401676656640"
    
    def __init__(self, data_dir: Optional[str] = None):
        if data_dir is None:
            base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
            data_dir = os.path.join(base_dir, "data", "psg_audio")
        self.data_dir = data_dir
        os.makedirs(self.data_dir, exist_ok=True)

    def get_dataset_info(self) -> Dict[str, Any]:
        return {
            "name": "PSG-Audio Polysomnography & Ambient Audio Dataset",
            "doi": self.DOI,
            "url": self.PORTAL_URL,
            "total_recordings": 212,
            "channels": [
                "Single-Lead ECG (Modified Lead II / Einthoven)",
                "Tracheal Contact Microphone Audio (16kHz)",
                "Ambient Room Microphone Audio (16kHz)",
                "Thoracic & Abdominal Respiratory Inductance Plethysmography",
                "Nasal Airflow Pressure",
                "SpO2 Pulse Oximetry"
            ],
            "annotated_events": [
                "Obstructive Sleep Apnea (OSA)",
                "Central Sleep Apnea (CSA)",
                "Mixed Apnea (MA)",
                "Hypopnea (HYP)",
                "Cheyne-Stokes Respiration (CSR)",
                "Snoring Bursts (SNORE)",
                "Bradycardia & Tachycardia",
                "Long RR / Sinus Pause"
            ]
        }

    def generate_demo_psg_sample(self, duration_sec: int = 120) -> Dict[str, Any]:
        """
        Synthesizes a representative PSG-Audio test recording matching the exact channel layout.
        Useful for running training and verification without downloading 50GB of raw EDF files.
        """
        fs_ecg = 250
        fs_audio = 16000
        total_ecg = duration_sec * fs_ecg
        total_audio = duration_sec * fs_audio
        
        t_ecg = np.linspace(0, duration_sec, total_ecg, endpoint=False)
        t_audio = np.linspace(0, duration_sec, total_audio, endpoint=False)
        
        # Synthesize ECG with an apnea period in seconds 40..70
        hr_curve = np.ones_like(t_ecg) * 68.0
        # Bradycardia during apnea (40-60s)
        mask_apnea = (t_ecg >= 40.0) & (t_ecg <= 60.0)
        hr_curve[mask_apnea] = 52.0
        # Post-apnea tachycardia arousal (60-75s)
        mask_arousal = (t_ecg > 60.0) & (t_ecg <= 75.0)
        hr_curve[mask_arousal] = 96.0
        
        phase = np.cumsum(2.0 * np.pi * (hr_curve / 60.0) / fs_ecg)
        p = phase % (2.0 * np.pi)
        
        ecg = 2048.0 + 80.0 * np.sin(2.0 * np.pi * 0.25 * t_ecg)
        # R peaks
        r_mask = (p >= 1.1) & (p <= 1.25)
        ecg[r_mask] += 1400.0 * np.sin((p[r_mask] - 1.1) / 0.15 * np.pi)
        # Baseline noise
        ecg += np.random.normal(0, 15, total_ecg)
        
        # Synthesize Audio (Quiet breathing, then silence in apnea, then loud snore gasps)
        audio = np.random.normal(0, 0.003, total_audio).astype(np.float32)
        # Snore gasps during arousal (60-75s)
        mask_audio_snore = (t_audio >= 60.0) & (t_audio <= 75.0)
        snore_t = t_audio[mask_audio_snore]
        snore_sound = (
            0.3 * np.sin(2.0 * np.pi * 130.0 * snore_t) +
            0.2 * np.sin(2.0 * np.pi * 260.0 * snore_t) +
            np.random.normal(0, 0.08, len(snore_t))
        )
        audio[mask_audio_snore] += snore_sound.astype(np.float32)
        
        annotations = [
            {"event": "Normal Sleep", "start_sec": 0, "end_sec": 40},
            {"event": "Obstructive Apnea", "start_sec": 40, "end_sec": 60},
            {"event": "Post-Apnea Snore & Arousal", "start_sec": 60, "end_sec": 75},
            {"event": "Normal Sleep Recovery", "start_sec": 75, "end_sec": 120}
        ]
        
        return {
            "duration_sec": duration_sec,
            "fs_ecg": fs_ecg,
            "fs_audio": fs_audio,
            "ecg_signal": ecg,
            "audio_signal": audio,
            "annotations": annotations
        }
