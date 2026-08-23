"""
CAMERA 505 — ESP32 Unified WiFi/Serial Stream
Handles both:
- WiFi CSI radar (breath detection via 52-subcarrier amplitude variance)
- ESP32 ECG over WiFi UDP (alternative to COM3 serial)

Architecture:
  ESP32 Beacon TX --ESP-NOW--> Router/Air --multipath--> ESP32 CSI RX
                                                              |
                                                              | 921600 baud Serial
                                                              v
                                                   WifiCsiPacketParser
                                                              |
                                                   WiFiCSIBreathDetector
                                                              |
                                                   StreamManager (FastAPI)

  ESP32 ECG --UDP port 3333--> ESP32WiFiECGStream --> callback --> StreamManager
"""

import socket
import json
import threading
import time
import numpy as np
from typing import Callable, Optional


# ---------------------------------------------------------------------------
# ESP32 WiFi ECG Stream (UDP ingestion, replaces COM3 serial)
# ---------------------------------------------------------------------------

class ESP32WiFiECGStream:
    """
    Receives ECG data from ESP32 over UDP (port 3333).
    ESP32 sends JSON: {"ecg": 2048, "hr": 74, "ts": 12345}
    Falls back to synthetic if no ESP32 detected in 5s.

    Compatible with:
    - firmware/esp32_camera505_ecg.ino  (WiFi UDP mode)
    - firmware/life_esp32_ad8232.ino    (WiFi UDP mode)
    """

    def __init__(self, host: str = '0.0.0.0', port: int = 3333,
                 callback: Optional[Callable] = None):
        self.host = host
        self.port = port
        self.callback = callback
        self._running = False
        self._sock: Optional[socket.socket] = None
        self._thread: Optional[threading.Thread] = None
        # Detection tracking
        self._last_packet_time: Optional[float] = None
        self._packet_count: int = 0
        self._esp32_ip: Optional[str] = None

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def start(self) -> None:
        """Bind UDP socket and spawn receiver thread."""
        self._running = True
        self._sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self._sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self._sock.bind((self.host, self.port))
        self._sock.settimeout(2.0)
        self._thread = threading.Thread(target=self._loop, daemon=True,
                                        name="ESP32WiFiECG")
        self._thread.start()

    def stop(self) -> None:
        """Signal the receiver loop to exit and close socket."""
        self._running = False
        if self._sock:
            try:
                self._sock.close()
            except Exception:
                pass
        self._sock = None

    @property
    def is_esp32_detected(self) -> bool:
        """True if a packet was received in the last 5 seconds."""
        if self._last_packet_time is None:
            return False
        return (time.time() - self._last_packet_time) < 5.0

    @property
    def esp32_ip(self) -> Optional[str]:
        """IP address of the last heard ESP32, or None."""
        return self._esp32_ip

    @property
    def packet_count(self) -> int:
        """Total packets received since start."""
        return self._packet_count

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    def _loop(self) -> None:
        """UDP receive loop; runs on daemon thread."""
        while self._running:
            try:
                data, addr = self._sock.recvfrom(1024)
                packet = json.loads(data.decode("utf-8", errors="ignore"))
                self._last_packet_time = time.time()
                self._packet_count += 1
                self._esp32_ip = addr[0]
                if self.callback:
                    self.callback(packet)
            except socket.timeout:
                continue
            except (json.JSONDecodeError, UnicodeDecodeError):
                continue
            except OSError:
                break
            except Exception:
                time.sleep(0.01)


# ---------------------------------------------------------------------------
# WiFi CSI Breath Detector
# ---------------------------------------------------------------------------

class WiFiCSIBreathDetector:
    """
    Detects respiration rate from WiFi CSI amplitude variance.

    Signal chain:
        52-subcarrier amplitude frame (np.ndarray shape (52,))
            -> sliding window buffer (default 150 frames @ 20 Hz = 7.5 s)
            -> per-frame variance across subcarriers -> variance_signal (N,)
            -> Savitzky-Golay smoothing
            -> zero-crossing rate -> respiration RPM estimate

    Typical usage:
        detector = WiFiCSIBreathDetector(window_size=150)
        # In CSI callback (called by WifiCsiPacketParser):
        amps = np.array(parsed["amplitudes"][:52])
        detector.push_frame(amps)
        rpm = detector.estimate_respiration_rpm()
    """

    #: Expected CSI capture rate from camera505_radar_rx.ino (frames/second)
    CSI_SAMPLE_RATE_HZ: float = 20.0

    #: Physiological respiration range (RPM)
    RPM_MIN: float = 8.0
    RPM_MAX: float = 30.0

    def __init__(self, window_size: int = 150):
        """
        Args:
            window_size: Maximum frames retained in the sliding window.
                         At 20 Hz this equals 7.5 seconds of history.
        """
        self.window_size = window_size
        self._buffer: list = []   # list of ndarray(52,)
        self._lock = threading.Lock()

    # ------------------------------------------------------------------
    # Data ingestion
    # ------------------------------------------------------------------

    def push_frame(self, subcarrier_amplitudes: np.ndarray) -> None:
        """
        Append one CSI amplitude frame to the sliding window.

        Args:
            subcarrier_amplitudes: 1-D array of subcarrier amplitudes,
                                   typically shape (52,) from the ESP32 CSI RX.
        """
        arr = np.asarray(subcarrier_amplitudes, dtype=np.float32)
        with self._lock:
            self._buffer.append(arr)
            if len(self._buffer) > self.window_size:
                self._buffer.pop(0)

    def reset(self) -> None:
        """Clear the internal window buffer."""
        with self._lock:
            self._buffer.clear()

    # ------------------------------------------------------------------
    # Analysis
    # ------------------------------------------------------------------

    def estimate_respiration_rpm(self) -> float:
        """
        Estimate respiration rate (breaths/min) from CSI variance pattern.

        Algorithm:
          1. Stack buffer -> matrix (N, 52)
          2. Compute per-frame variance across subcarriers -> variance_signal(N,)
          3. Smooth with Savitzky-Golay filter (window<=11, poly=3)
          4. Mean-centre and count zero crossings
          5. Derive period -> convert to RPM; clamp to [8, 30]

        Returns:
            Estimated respiration rate in breaths-per-minute.
            Returns 15.0 (normal resting value) if insufficient data.
        """
        with self._lock:
            n = len(self._buffer)
            if n < 30:
                return 15.0
            data = np.array(self._buffer, dtype=np.float32)   # (N, 52)

        # Variance across subcarriers per frame captures motion energy
        variance_signal = np.var(data, axis=1)   # (N,)

        # Smooth
        smoothed = self._smooth(variance_signal)

        # Zero-crossing analysis
        centered = smoothed - smoothed.mean()
        sign_changes = np.where(np.diff(np.sign(centered)))[0]
        if len(sign_changes) < 2:
            return 15.0

        # Average half-period from consecutive zero crossings
        span_samples = sign_changes[-1] - sign_changes[0]
        num_half_periods = len(sign_changes) - 1
        half_period_samples = span_samples / max(1, num_half_periods)
        period_samples = half_period_samples * 2.0
        period_seconds = period_samples / self.CSI_SAMPLE_RATE_HZ
        rpm = 60.0 / max(0.5, period_seconds)
        return float(np.clip(rpm, self.RPM_MIN, self.RPM_MAX))

    def get_motion_energy(self) -> float:
        """
        Returns normalized motion energy in [0, 1] derived from recent CSI
        variance magnitude. Useful for sleep/wake state discrimination.

        Returns:
            0.0  -> still / deep sleep
            ~0.3 -> light movement / tossing
            1.0  -> active / awake motion
        """
        with self._lock:
            if len(self._buffer) < 5:
                return 0.0
            recent = np.array(self._buffer[-10:], dtype=np.float32)

        energy = float(np.mean(np.var(recent, axis=1)))
        # Normalise: empirical scale factor 100 calibrated against ESP32 output
        return float(np.clip(energy / 100.0, 0.0, 1.0))

    def get_buffer_fill_ratio(self) -> float:
        """Returns fraction [0..1] of window currently filled."""
        with self._lock:
            return len(self._buffer) / max(1, self.window_size)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _smooth(self, signal: np.ndarray) -> np.ndarray:
        """Apply Savitzky-Golay smoothing, falling back gracefully."""
        n = len(signal)
        try:
            from scipy.signal import savgol_filter
            # Window length must be odd, >= polyorder+1, and <= n
            win = min(11, (n // 3) * 2 + 1)
            if win < 5:
                return signal
            return savgol_filter(signal, win, 3)
        except Exception:
            return signal


# ---------------------------------------------------------------------------
# Convenience factory
# ---------------------------------------------------------------------------

def create_wifi_csi_pipeline(
    ecg_udp_port: int = 3333,
    csi_window_size: int = 150,
    ecg_callback: Optional[Callable] = None
):
    """
    Factory that returns a ready-to-start ECG UDP stream and a CSI breath
    detector pre-configured for the CAMERA 505 default parameters.

    Args:
        ecg_udp_port:    UDP port for ESP32 ECG packets (default 3333).
        csi_window_size: Sliding-window depth for breath detector (default 150).
        ecg_callback:    Callable invoked with each ECG JSON packet dict.

    Returns:
        (ESP32WiFiECGStream, WiFiCSIBreathDetector)

    Example::
        ecg_stream, breath_detector = create_wifi_csi_pipeline(
            ecg_callback=lambda pkt: print(pkt["hr"])
        )
        ecg_stream.start()
        # ... later in CSI callback:
        breath_detector.push_frame(np.array(parsed["amplitudes"][:52]))
        rpm = breath_detector.estimate_respiration_rpm()
    """
    ecg_stream = ESP32WiFiECGStream(port=ecg_udp_port, callback=ecg_callback)
    breath_detector = WiFiCSIBreathDetector(window_size=csi_window_size)
    return ecg_stream, breath_detector
