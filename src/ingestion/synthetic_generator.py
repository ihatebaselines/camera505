"""
LIFE Platform - Synthetic Physiological Signal Generator
Generates realistic, synchronized, multi-channel physiological streams:
1. Single-Lead ECG (P-Q-R-S-T morphology, RSA, baseline wander, noise)
2. 16kHz Audio Stream (breathing airflow, snoring bursts, coughing transients)
3. Diverse clinical & sleep scenarios (Healthy, Obstructive Apnea, Arrhythmia, Cough Cluster)
"""

import numpy as np
import time
import math
from enum import Enum
from typing import Tuple, Dict, Any, Optional


class SimulationScenario(str, Enum):
    HEALTHY_REST = "healthy_rest"
    SLEEP_APNEA = "sleep_apnea"
    ARRHYTHMIA = "arrhythmia"
    COUGH_ATTACK = "cough_attack"
    SNORING_EPISODE = "snoring_episode"
    LEADS_OFF = "leads_off"
    BREATHING_EXERCISE = "breathing_exercise"
    STRESS_TEST = "stress_test"


class SyntheticPhysiologicalGenerator:
    """
    Simulates high-fidelity real-time ECG and acoustic signals.
    """
    def __init__(self, ecg_fs: int = 250, audio_fs: int = 16000):
        self.ecg_fs = ecg_fs
        self.audio_fs = audio_fs
        
        self.scenario = SimulationScenario.HEALTHY_REST
        self.phase_ecg = 0.0
        self.phase_resp = 0.0
        self.time_sec = 0.0
        
        # State parameters
        self.target_hr = 70.0
        self.target_resp_rate = 14.0 # RPM
        self.apnea_active = False
        self.apnea_timer = 0.0
        self.cycle_timer = 0.0

    def set_scenario(self, scenario: SimulationScenario):
        self.scenario = scenario
        self.apnea_active = False
        self.apnea_timer = 0.0
        self.cycle_timer = 0.0
        if scenario == SimulationScenario.HEALTHY_REST:
            self.target_hr = 68.0
            self.target_resp_rate = 14.0
        elif scenario == SimulationScenario.ARRHYTHMIA:
            self.target_hr = 85.0
        elif scenario == SimulationScenario.SLEEP_APNEA:
            self.target_hr = 65.0
            self.target_resp_rate = 15.0
        elif scenario == SimulationScenario.BREATHING_EXERCISE:
            self.target_hr = 65.0
            self.target_resp_rate = 6.0
        elif scenario == SimulationScenario.STRESS_TEST:
            self.target_hr = 88.0
            self.target_resp_rate = 16.0

    def generate_step(self, dt_sec: float) -> Tuple[float, np.ndarray, bool, Dict[str, Any]]:
        """
        Advances simulation by dt_sec.
        Returns:
            - ecg_raw_val (float in 0..4095 ADC counts)
            - audio_pcm_chunk (np.ndarray of float32 @ 16kHz)
            - leads_off (bool)
            - ground_truth_meta (dict)
        """
        self.time_sec += dt_sec
        self.cycle_timer += dt_sec
        
        leads_off = False
        snore_active = False
        cough_active = False
        
        # --- Handle Scenarios ---
        if self.scenario == SimulationScenario.LEADS_OFF:
            leads_off = True
            
        elif self.scenario == SimulationScenario.SLEEP_APNEA:
            # Cycle: 40s normal breathing -> 20s apnea pause -> 10s heavy gasp/snore & tachycardia
            # Realistic variance added so not every apnea looks identical (HR ±1-2 BPM per episode)
            cycle_pos = self.cycle_timer % 70.0
            if cycle_pos < 40.0:
                self.apnea_active = False
                # Normal sinus rhythm with small respiratory-driven variance
                self.target_hr = 66.0 + float(np.random.normal(0, 1.0))
                self.target_hr = float(np.clip(self.target_hr, 62.0, 70.0))
            elif cycle_pos < 60.0:
                # In apnea: heart rate slows, respiratory effort drops
                # Bradycardia ~54 BPM with realistic per-beat variance; audio stays silent (80-500Hz snore resonance silent)
                self.apnea_active = True
                # Slight drift across the 20s pause + per-step jitter so episodes differ
                apnea_jitter = float(np.random.normal(0, 1.2))
                apnea_drift = ((cycle_pos - 40.0) / 20.0) * 1.0  # 0→1 BPM drift across pause
                self.target_hr = float(np.clip(54.0 + apnea_jitter + apnea_drift, 48.0, 59.0))
            else:
                # Recovery arousal: tachycardia + snore/gasp (80-500Hz resonance spikes here)
                self.apnea_active = False
                self.target_hr = float(np.clip(95.0 + float(np.random.normal(0, 1.8)), 88.0, 102.0))
                snore_active = True
                
        elif self.scenario == SimulationScenario.SNORING_EPISODE:
            # Rhythmic snoring during inspiration
            if math.sin(self.phase_resp) > 0.3:
                snore_active = True
                
        elif self.scenario == SimulationScenario.COUGH_ATTACK:
            # Cough burst every 6 seconds
            if (self.cycle_timer % 6.0) < 0.6:
                cough_active = True
                
        elif self.scenario == SimulationScenario.ARRHYTHMIA:
            # Irregular ectopic beats
            if int(self.cycle_timer) % 4 == 0 and self.phase_ecg > 4.5:
                self.phase_ecg += 0.8 # Premature triggering

        elif self.scenario == SimulationScenario.BREATHING_EXERCISE:
            # Guided 6/min (0.1 Hz) biofeedback - very regular EDR, large RSA (10 BPM), HRV high
            self.target_hr = 65.0
            self.target_resp_rate = 6.0
            self.apnea_active = False
            # snore_active and cough_active remain False -> gentle breathing audio via normal branch

        elif self.scenario == SimulationScenario.STRESS_TEST:
            # 15s cycle: 5s normal, 5s snore (80-500Hz), 5s cough burst, repeat. HR elevated 88
            self.target_hr = 88.0
            self.target_resp_rate = 16.0
            self.apnea_active = False
            cycle_pos = self.cycle_timer % 15.0
            if 5.0 <= cycle_pos < 10.0:
                snore_active = True
            elif cycle_pos >= 10.0:
                cough_active = True

        # --- Respiration Dynamics ---
        resp_freq_hz = (self.target_resp_rate / 60.0)
        self.phase_resp += 2.0 * math.pi * resp_freq_hz * dt_sec
        if self.phase_resp > 2.0 * math.pi * 1000:
            self.phase_resp = 0.0
            
        # Respiratory Sinus Arrhythmia (RSA): breathing modulates heart rate
        # BREATHING_EXERCISE: large RSA 10 BPM for high HRV, very regular 0.1 Hz EDR
        if self.scenario == SimulationScenario.BREATHING_EXERCISE:
            rsa_modulation = 10.0 * math.sin(self.phase_resp)
        else:
            rsa_modulation = 6.0 * math.sin(self.phase_resp) if not self.apnea_active else 0.0
        current_instant_hr = max(40.0, self.target_hr + rsa_modulation)
        
        # --- ECG Synthesis ---
        hr_freq_hz = current_instant_hr / 60.0
        self.phase_ecg += 2.0 * math.pi * hr_freq_hz * dt_sec
        
        # P-Q-R-S-T synthesis
        p = self.phase_ecg % (2.0 * math.pi)
        ecg_val = 2048.0 # Baseline at 1.65V (midpoint of 12-bit ADC)
        
        # Baseline wander (respiratory modulation)
        if not self.apnea_active:
            ecg_val += 80.0 * math.sin(self.phase_resp)
            
        if not leads_off:
            if 0.4 <= p < 0.8:
                # P wave
                ecg_val += 160.0 * math.sin((p - 0.4) / 0.4 * math.pi)
            elif 1.0 <= p < 1.1:
                # Q wave
                ecg_val -= 120.0 * math.sin((p - 1.0) / 0.1 * math.pi)
            elif 1.1 <= p < 1.25:
                # R peak (sharp deflection with amplitude modulation from breathing)
                qrs_mod = 1.0 + (0.15 * math.sin(self.phase_resp) if not self.apnea_active else 0.0)
                ecg_val += 1500.0 * qrs_mod * math.sin((p - 1.1) / 0.15 * math.pi)
            elif 1.25 <= p < 1.35:
                # S wave
                ecg_val -= 320.0 * math.sin((p - 1.25) / 0.1 * math.pi)
            elif 1.6 <= p < 2.2:
                # T wave
                ecg_val += 340.0 * math.sin((p - 1.6) / 0.6 * math.pi)
                
            # Realistic sensor micro-noise (EMG + ADC quantization)
            ecg_val += float(np.random.normal(0, 10))
        else:
            ecg_val = 0.0
            
        ecg_val = float(np.clip(ecg_val, 0.0, 4095.0))

        # --- Audio Synthesis (16kHz chunk matching dt_sec) ---
        num_audio_samples = int(self.audio_fs * dt_sec)
        audio_chunk = np.zeros(num_audio_samples, dtype=np.float32)
        
        # Ambient noise floor (-55 dB)
        audio_chunk += np.random.normal(0, 0.002, num_audio_samples).astype(np.float32)
        
        t_audio = np.linspace(self.time_sec, self.time_sec + dt_sec, num_audio_samples, endpoint=False)
        
        if not self.apnea_active and not snore_active and not cough_active:
            # Normal quiet breathing airflow sounds during inspiration
            breath_phase = np.sin(2.0 * np.pi * resp_freq_hz * t_audio)
            breath_amp = np.maximum(0.0, breath_phase) * 0.01
            # Filtered noise for breath airflow
            audio_chunk += (np.random.normal(0, 1, num_audio_samples) * breath_amp).astype(np.float32)
            
        elif snore_active:
            # Snoring vibration (fundamental ~120Hz + harmonics inside 80-500Hz resonance)
            # Gasps spike here; apnea phase keeps this branch inactive => silence during pause
            snore_amp_var = 0.85 + 0.30 * float(np.random.rand())  # 0.85-1.15 variation per chunk
            snore_wave = (
                0.25 * np.sin(2.0 * np.pi * 120.0 * t_audio) +
                0.18 * np.sin(2.0 * np.pi * 240.0 * t_audio) +
                0.12 * np.sin(2.0 * np.pi * 360.0 * t_audio)
            ) * snore_amp_var
            # Add rumble noise
            snore_wave += np.random.normal(0, 0.05, num_audio_samples)
            audio_chunk += snore_wave.astype(np.float32)
            
        elif cough_active:
            # Explosive cough transient
            cough_wave = np.random.normal(0, 0.45, num_audio_samples).astype(np.float32)
            audio_chunk += cough_wave
            
        audio_chunk = np.clip(audio_chunk, -1.0, 1.0)
        
        meta = {
            "scenario": self.scenario.value,
            "target_hr": current_instant_hr,
            "apnea_active": self.apnea_active,
            "snore_active": snore_active,
            "cough_active": cough_active
        }
        
        return ecg_val, audio_chunk, leads_off, meta

    def generate_sample(self) -> Dict[str, Any]:
        """Convenience method generating a 1-step sample at 50Hz (dt = 0.02s)."""
        ecg_val, audio_chunk, leads_off, meta = self.generate_step(0.02)
        norm_ecg = (ecg_val - 2048.0) / 2048.0
        return {
            "ecg": norm_ecg,
            "ecg_raw": ecg_val,
            "leads_off": leads_off,
            "meta": meta
        }


# Backwards compatibility alias
SyntheticBiometricGenerator = SyntheticPhysiologicalGenerator
