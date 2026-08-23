"""
LIFE Platform - Serial COM Port Reader
Handles real-time ingestion from ESP32 / Arduino hardware via USB Serial.
Supports CSV, JSON, RAW, and Binary packet framing.
"""

import threading
import time
import json
import logging
from typing import List, Dict, Tuple, Optional, Callable, Any
from collections import deque

try:
    import serial
    import serial.tools.list_ports
    SERIAL_AVAILABLE = True
except ImportError:
    SERIAL_AVAILABLE = False

logger = logging.getLogger("LIFE.Serial")


def list_available_com_ports() -> List[Dict[str, str]]:
    """Lists all detected COM / Serial ports on the system."""
    if not SERIAL_AVAILABLE:
        return []
    ports = []
    for p in serial.tools.list_ports.comports():
        ports.append({
            "device": p.device,
            "description": p.description,
            "hwid": p.hwid
        })
    return ports


class SerialEcgReader:
    """
    Background worker thread reading from ESP32 AD8232 via USB Serial.
    """
    def __init__(self, port: str = "COM3", baud_rate: int = 115200, callback: Optional[Callable] = None):
        self.port = port
        self.baud_rate = baud_rate
        self.callback = callback
        
        self.running = False
        self.thread: Optional[threading.Thread] = None
        self.ser: Optional[serial.Serial] = None
        
        self.recent_samples = deque(maxlen=2000)
        self.reconnect_interval = 3.0
        self.last_reconnect_attempt = 0.0
        self._char_accum = ""
        self._char_accum_time = 0.0

    def start(self):
        if not SERIAL_AVAILABLE:
            logger.error("pyserial is not installed.")
            return False
            
        self.running = True
        self.thread = threading.Thread(target=self._read_loop, daemon=True)
        self.thread.start()
        logger.info(f"Serial reader thread started on {self.port} @ {self.baud_rate} baud.")
        return True

    def stop(self):
        self.running = False
        if self.ser and self.ser.is_open:
            try:
                self.ser.close()
            except Exception:
                pass
        if self.thread and self.thread.is_alive():
            self.thread.join(timeout=1.0)
        logger.info("Serial reader stopped.")

    def _read_loop(self):
        while self.running:
            try:
                if self.ser is None or not self.ser.is_open:
                    try:
                        self.ser = serial.Serial(self.port, self.baud_rate, timeout=1.0)
                        logger.info(f"Successfully connected to {self.port}")
                        # Flush initial garbage
                        time.sleep(0.1)
                        self.ser.reset_input_buffer()
                    except Exception as e:
                        time.sleep(self.reconnect_interval)
                        continue

                # Read line from serial
                raw_line = self.ser.readline().decode('utf-8', errors='ignore').strip()
                if not raw_line or raw_line.startswith('#'):
                    continue # Skip comments or empty lines

                # Handle per-char firmware (user's working sketch prints "Leads Off" / "ESP-32S Ready" char-by-char)
                if len(raw_line) == 1 and raw_line in "Leads OffESP-32SReady-":
                    now = time.time()
                    if now - self._char_accum_time > 0.5:
                        self._char_accum = ""
                    self._char_accum += raw_line
                    self._char_accum_time = now
                    accum_upper = self._char_accum.upper()
                    if "LEADS OFF" in accum_upper:
                        self._char_accum = ""
                        parsed = (0.0, True, int(time.time() * 1000))
                        self.recent_samples.append((0.0, True, int(time.time() * 1000)))
                        if self.callback:
                            self.callback(0.0, True, int(time.time() * 1000))
                        continue
                    if "READY" in accum_upper or "ESP-32S" in accum_upper:
                        if len(self._char_accum) > 15:
                            self._char_accum = ""
                        continue
                    if len(self._char_accum) > 20:
                        self._char_accum = ""
                    continue
                else:
                    # Reset char accumulator on normal line
                    if self._char_accum:
                        self._char_accum = ""

                parsed = self._parse_line(raw_line)
                if parsed:
                    ecg_val, leads_off, timestamp_ms = parsed
                    self.recent_samples.append((ecg_val, leads_off, timestamp_ms))
                    if self.callback:
                        self.callback(ecg_val, leads_off, timestamp_ms)

            except Exception as e:
                logger.warning(f"Serial read error: {e}. Attempting reconnect...")
                if self.ser and self.ser.is_open:
                    self.ser.close()
                self.ser = None
                time.sleep(self.reconnect_interval)

    def _parse_line(self, line: str) -> Optional[Tuple[float, bool, int]]:
        """
        Parses JSON, CSV, ESP-32S ECG:val,BPM:bpm, Leads Off, or Raw text lines.
        """
        now_ms = int(time.time() * 1000)
        line_clean = line.strip()
        if not line_clean:
            return None

        line_upper = line_clean.upper()

        # 0. Check startup banners / info messages
        if "READY" in line_upper or "ESP-32" in line_upper or line_clean.startswith("#"):
            return None

        # 1. Check Leads Off detection
        if "LEADS OFF" in line_upper or "LEADSOFF" in line_upper or line_clean == "!":
            return 0.0, True, now_ms

        # 2. ESP-32S Key-Value format: "ECG:2048,BPM:72.5" or "ECG:1950"
        if "ECG:" in line_upper:
            parts = line_clean.split(',')
            ecg_val = 0.0
            for p in parts:
                p_item = p.strip().upper()
                if p_item.startswith("ECG:"):
                    try:
                        val_str = p_item.split(":", 1)[1].strip()
                        ecg_val = float(val_str)
                    except ValueError:
                        return None
            return ecg_val, False, now_ms

        # 3. JSON format: {"t": 12345, "v": 2048, "lo": 0}
        if line_clean.startswith('{') and line_clean.endswith('}'):
            try:
                data = json.loads(line_clean)
                v = float(data.get("v", data.get("ecg", 0.0)))
                lo = bool(data.get("lo", data.get("leads_off", 0)))
                t = int(data.get("t", data.get("timestamp_ms", now_ms)))
                return v, lo, t
            except Exception:
                return None

        # 4. CSV format:
        #    rawValue,bpm   (e.g. 2048,72.0)
        #    val,lo_flag,timestamp_ms (e.g. 2048,0,1690000000)
        if ',' in line_clean:
            parts = line_clean.split(',')
            try:
                v = float(parts[0])
                if len(parts) == 2:
                    lo = (v == 0.0)
                    return v, lo, now_ms
                elif len(parts) >= 3:
                    lo = (int(parts[1]) == 1)
                    t = int(parts[2])
                    return v, lo, t
            except Exception:
                return None

        # 5. Raw numeric value
        try:
            v = float(line_clean)
            return v, False, now_ms
        except ValueError:
            return None
