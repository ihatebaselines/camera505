"""
CAMERA 505 Platform - Wi-Fi CSI (Channel State Information) Radar Ingestion
Parses high-speed (921600 baud) RF disturbance subcarrier packets from ESP32 CSI RX.
Enables contact-free respiratory and sleep apnea monitoring via Wi-Fi multipath reflections.
"""

import time
import math
import logging
import numpy as np
from typing import Optional, Tuple, Dict, Any, Callable

logger = logging.getLogger("CAMERA505.CSI")


class WifiCsiPacketParser:
    """
    Parses CSI packets in format:
    timestamp_ms,rssi,len,byte0;byte1;byte2;...
    """
    def __init__(self, num_subcarriers: int = 52):
        self.num_subcarriers = num_subcarriers
        self.last_timestamp = 0
        self.last_rssi = -50
        
    def parse_line(self, line: str) -> Optional[Dict[str, Any]]:
        line_clean = line.strip()
        if not line_clean or line_clean.startswith("#"):
            return None
            
        parts = line_clean.split(',')
        if len(parts) < 4:
            return None
            
        try:
            ts = int(parts[0])
            rssi = int(parts[1])
            length = int(parts[2])
            raw_bytes_str = parts[3].split(';')
            
            raw_bytes = [int(b) for b in raw_bytes_str if b]
            if not raw_bytes:
                return None
                
            # Complex CSI subcarrier unpacking (Real + Imaginary pairs)
            amplitudes = []
            phases = []
            for i in range(0, len(raw_bytes) - 1, 2):
                real = raw_bytes[i]
                imag = raw_bytes[i + 1]
                amp = math.sqrt(real * real + imag * imag)
                phase = math.atan2(imag, real)
                amplitudes.append(amp)
                phases.append(phase)
                
            # Extract thoracic respiratory movement proxy (mean subcarrier amplitude deviation)
            mean_amp = float(np.mean(amplitudes)) if amplitudes else 0.0
            
            return {
                "timestamp_ms": ts,
                "rssi": rssi,
                "length": length,
                "amplitudes": amplitudes,
                "phases": phases,
                "respiratory_proxy": mean_amp
            }
        except Exception as e:
            return None
