"""
LIFE Platform - Audio Digital Signal Processing (DSP) Engine
Processes ambient smartphone / microphone audio:
- 16kHz STFT and 128-band Mel-Spectrogram with log-power dB conversion
- Real-time acoustic event detectors:
  * Snoring spectral signature (80-500 Hz low-frequency harmonic resonance)
  * Cough explosive burst detector (broadband high-energy transient)
  * Respiratory pause / quiet level detector
"""

import numpy as np
from scipy import signal
from collections import deque
from typing import Tuple, Dict, List, Optional, Any


def hz_to_mel(hz: np.ndarray) -> np.ndarray:
    return 2595.0 * np.log10(1.0 + hz / 700.0)


def mel_to_hz(mel: np.ndarray) -> np.ndarray:
    return 700.0 * (10.0 ** (mel / 2595.0) - 1.0)


def create_mel_filterbank(n_mels: int = 128, n_fft: int = 512, fs: int = 16000, fmin: float = 50.0, fmax: float = 8000.0) -> np.ndarray:
    """Constructs triangular Mel filterbank matrix."""
    mel_min = hz_to_mel(np.array([fmin]))[0]
    mel_max = hz_to_mel(np.array([fmax]))[0]
    mel_points = np.linspace(mel_min, mel_max, n_mels + 2)
    hz_points = mel_to_hz(mel_points)
    
    bin_points = np.floor((n_fft + 1) * hz_points / fs).astype(int)
    
    filterbank = np.zeros((n_mels, int(n_fft // 2 + 1)), dtype=np.float32)
    for m in range(1, n_mels + 1):
        f_m_minus = bin_points[m - 1]
        f_m = bin_points[m]
        f_m_plus = bin_points[m + 1]
        
        for k in range(f_m_minus, f_m):
            if f_m > f_m_minus:
                filterbank[m - 1, k] = (k - f_m_minus) / (f_m - f_m_minus)
        for k in range(f_m, f_m_plus):
            if f_m_plus > f_m:
                filterbank[m - 1, k] = (f_m_plus - k) / (f_m_plus - f_m)
                
    return filterbank


class AudioDspProcessor:
    def __init__(self, fs: int = 16000, n_mels: int = 128, n_fft: int = 512, hop_length: int = 160):
        self.fs = fs
        self.n_mels = n_mels
        self.n_fft = n_fft
        self.hop_length = hop_length # 10ms hop @ 16kHz
        self.window = np.hanning(n_fft)
        
        self.mel_fb = create_mel_filterbank(n_mels=n_mels, n_fft=n_fft, fs=fs)
        
        # Audio ring buffer for streaming (keeps last 5 seconds of audio samples)
        self.audio_buffer = deque(maxlen=fs * 5)
        self.recent_mel_frames = deque(maxlen=300) # ~3 seconds of mel columns
        
        # Energy tracking for cough and snore detection
        self.recent_rms = deque(maxlen=50)
        self.baseline_noise_floor_db = -55.0

    def push_audio_chunk(self, pcm_chunk: np.ndarray) -> Dict[str, Any]:
        """
        Ingests a chunk of float32 or int16 PCM audio samples (at 16kHz).
        Returns acoustic features, mel slice, and detected event probabilities.
        """
        if pcm_chunk.dtype == np.int16:
            pcm_chunk = pcm_chunk.astype(np.float32) / 32768.0
        elif pcm_chunk.dtype != np.float32:
            pcm_chunk = pcm_chunk.astype(np.float32)
            
        for s in pcm_chunk:
            self.audio_buffer.append(float(s))
            
        # Calculate instantaneous RMS energy
        rms = float(np.sqrt(np.mean(pcm_chunk ** 2))) if len(pcm_chunk) > 0 else 1e-6
        energy_db = float(20.0 * np.log10(max(1e-6, rms)))
        self.recent_rms.append(energy_db)
        
        # Slowly adapt noise floor
        if energy_db < self.baseline_noise_floor_db:
            self.baseline_noise_floor_db = 0.95 * self.baseline_noise_floor_db + 0.05 * energy_db
        else:
            self.baseline_noise_floor_db = 0.999 * self.baseline_noise_floor_db + 0.001 * energy_db
            
        # Compute Mel Spectrogram on available buffer
        mel_column = np.zeros(self.n_mels, dtype=np.float32)
        snore_prob = 0.0
        cough_prob = 0.0
        pause_flag = False
        
        if len(self.audio_buffer) >= self.n_fft:
            recent_slice = np.array(list(self.audio_buffer)[-self.n_fft:])
            # STFT frame
            windowed = recent_slice * self.window
            spec = np.abs(np.fft.rfft(windowed, n=self.n_fft)) ** 2
            
            # Mel projection & Log-power dB
            mel_spec = np.dot(self.mel_fb, spec)
            mel_db = 10.0 * np.log10(np.maximum(1e-6, mel_spec))
            # Normalize to 0..1 range approx for visualization
            mel_column = np.clip((mel_db + 80.0) / 80.0, 0.0, 1.0)
            self.recent_mel_frames.append(mel_column)
            
            # --- Snoring Detection Logic ---
            # Snoring is concentrated in lower frequencies (80Hz - 500Hz: Mel bins ~5..35)
            low_energy = np.mean(mel_spec[5:35])
            high_energy = np.mean(mel_spec[45:100]) + 1e-6
            snore_ratio = low_energy / high_energy
            
            if energy_db > (self.baseline_noise_floor_db + 6.0) and snore_ratio > 3.5:
                snore_prob = float(np.clip((snore_ratio - 3.5) / 10.0 + (energy_db - self.baseline_noise_floor_db) / 30.0, 0.0, 1.0))
            else:
                snore_prob = 0.0
                
            # --- Cough Detection Logic ---
            # Coughs have sudden explosive onset (> 15 dB rise in < 50ms) and broad spectral energy (> 1000 Hz)
            if len(self.recent_rms) >= 5:
                delta_energy = energy_db - self.recent_rms[-5]
                broadband_high = np.mean(mel_spec[30:100])
                if delta_energy > 12.0 and broadband_high > 1e-3 and energy_db > -35.0:
                    cough_prob = float(np.clip(delta_energy / 20.0, 0.0, 1.0))
                    
            # --- Respiratory Pause Detection ---
            if energy_db < (self.baseline_noise_floor_db + 2.0):
                pause_flag = True

        return {
            "energy_db": round(energy_db, 1),
            "snore_probability": round(snore_prob, 2),
            "cough_probability": round(cough_prob, 2),
            "respiratory_pause": pause_flag,
            "mel_column": mel_column.tolist()
        }


def extract_mel_spectrogram(audio_pcm: np.ndarray, fs: int = 16000, n_mels: int = 128, n_fft: int = 512, hop_length: int = 160) -> np.ndarray:
    """
    Computes full 2D Mel-Spectrogram matrix (n_mels x n_frames) for a given audio segment.
    """
    if len(audio_pcm) < n_fft:
        pad_width = n_fft - len(audio_pcm)
        audio_pcm = np.pad(audio_pcm, (0, pad_width), mode='constant')
        
    num_frames = 1 + int((len(audio_pcm) - n_fft) // hop_length)
    mel_fb = create_mel_filterbank(n_mels=n_mels, n_fft=n_fft, fs=fs)
    window = np.hanning(n_fft)
    
    mel_matrix = np.zeros((n_mels, num_frames), dtype=np.float32)
    for i in range(num_frames):
        start = i * hop_length
        frame = audio_pcm[start:start + n_fft] * window
        spec = np.abs(np.fft.rfft(frame, n=n_fft)) ** 2
        mel_spec = np.dot(mel_fb, spec)
        mel_matrix[:, i] = 10.0 * np.log10(np.maximum(1e-6, mel_spec))
        
    return mel_matrix
