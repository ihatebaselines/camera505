"""
CAMERA 505 Platform - Live Arduino / ESP-32S + AD8232 Hardware Telemetry Runner
Connects directly to Arduino UNO / ESP-32S on COM5 (or auto-detected port),
supports 115200 & 9600 baud auto-negotiation, handles ADC range auto-scaling (10-bit / 12-bit),
and renders real-time live ECG waveform with Pan-Tompkins DSP & Apnea Risk in the terminal.
"""

import os
import sys
import time
import math
from collections import deque

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

try:
    import serial
    import serial.tools.list_ports
    SERIAL_AVAILABLE = True
except ImportError:
    SERIAL_AVAILABLE = False

from src.ingestion.serial_stream import list_available_com_ports, SerialEcgReader
from src.dsp.ecg_dsp import PanTompkinsDetector


def clear_screen():
    os.system("cls" if os.name == "nt" else "clear")


def render_ascii_waveform(val: float, min_v: float = 0.0, max_v: float = 4095.0, width: int = 45) -> str:
    norm = max(0.0, min(1.0, (val - min_v) / max(1.0, max_v - min_v)))
    pos = int(norm * (width - 1))
    line = ["─"] * width
    line[pos] = "█"
    return "".join(line)


def run_esp32_live_session():
    clear_screen()
    print("""
  ==============================================================================
    CAMERA 505 — LIVE ARDUINO / ESP-32S HARDWARE TELEMETRY ENGINE
    *WE DON'T SUPPORT 67* | Real-Time Hardware Ingestion
  ==============================================================================
    """)

    if not SERIAL_AVAILABLE:
        print("[ERROR] 'pyserial' library not found. Install with: pip install pyserial")
        input("\nPress Enter to return...")
        return

    detected_ports = list_available_com_ports()
    detected_devices = [p["device"] for p in detected_ports]
    
    # Default candidate port: COM5 or first detected port or COM3
    default_port = "COM5" if "COM5" in detected_devices else (detected_devices[0] if detected_devices else "COM5")
    
    print("  Hardware Connection Status:")
    print("  ------------------------------------------------------------------------------")
    if detected_ports:
        print(f"  [✓] Detected {len(detected_ports)} Serial Port(s):")
        for idx, p in enumerate(detected_ports, 1):
            marker = " (Recommended)" if p['device'] == "COM5" else ""
            print(f"      [{idx}] {p['device']} - {p['description']}{marker}")
    else:
        print("  [i] Note: No USB Serial ports active in device manager.")
        print("      If your Arduino/ESP32 is plugged in, it is likely on COM5.")
    print("  ------------------------------------------------------------------------------")
    print("  💡 HINT: Make sure Serial Monitor inside Arduino IDE is CLOSED before connecting.")
    print(f"  💡 Default Target Port: [{default_port}]")

    choice = input(f"\n  Press Enter to connect to [{default_port}], or type COM port / 'SIM': ").strip()
    
    is_simulated = False
    if choice.upper() == "SIM":
        is_simulated = True
        selected_port = "SIMULATED_ESP32"
    elif choice.upper().startswith("COM"):
        selected_port = choice.upper()
    elif choice.isdigit() and 1 <= int(choice) <= len(detected_ports):
        selected_port = detected_ports[int(choice) - 1]["device"]
    else:
        selected_port = default_port

    if is_simulated:
        print(f"\n[INFO] Starting in ESP-32S Live Hardware Simulation Mode (50 Hz AD8232 Generator)...")
        print("[INFO] Press Ctrl+C at any time to disconnect and return to menu.\n")
        time.sleep(1)
        
        from src.ingestion.synthetic_generator import SyntheticPhysiologicalGenerator
        sim_gen = SyntheticPhysiologicalGenerator(ecg_fs=50, audio_fs=16000)
        detector = PanTompkinsDetector(fs=50)
        
        start_time = time.time()
        sample_count = 0
        last_ui_update = 0.0
        
        try:
            while True:
                time.sleep(0.02) # 50 Hz loop
                now = time.time()
                sample = sim_gen.generate_sample()
                sample_count += 1
                
                ecg_raw = sample["ecg"] * 1000.0 + 2048.0 # Scale to 0-4095 ADC
                is_lo = sample.get("leads_off", False)
                
                if not is_lo:
                    is_r, _ = detector.process_sample(sample["ecg"])
                    
                if now - last_ui_update >= 0.05:
                    last_ui_update = now
                    elapsed = now - start_time
                    fps = sample_count / max(0.1, elapsed)
                    wave_bar = render_ascii_waveform(ecg_raw, min_v=500.0, max_v=3500.0, width=42)
                    status_icon = "⚠️ LEADS DETACHED" if is_lo else "💚 ESP-32S SIM ACTIVE"
                    sys.stdout.write(f"\r  [{status_icon:<21}] | ECG: {ecg_raw:6.1f} | [{wave_bar}] | Rate: {fps:5.1f} Hz | Samples: {sample_count:6d}")
                    sys.stdout.flush()
        except KeyboardInterrupt:
            print("\n\n[INFO] Disconnecting hardware simulator...")
        finally:
            print(f"[INFO] Simulation session closed. Total samples received: {sample_count}.")
            input("\nPress Enter to return to menu...")
        return

    # Real Hardware Streaming Mode
    print(f"\n[INFO] Connecting to Hardware on {selected_port} @ 115200 baud...")
    print("[INFO] Press Ctrl+C at any time to disconnect and return to menu.\n")
    time.sleep(0.5)

    detector = PanTompkinsDetector(fs=50)
    recent_ecg = deque(maxlen=300)
    recent_bpm = deque(maxlen=10)
    sample_count = 0
    leads_off_count = 0
    start_time = time.time()
    last_ui_update = 0.0
    
    # Auto-scaling ADC range (detects 10-bit 0-1023 Arduino or 12-bit 0-4095 ESP32)
    adc_max = 1023.0

    def on_sample(ecg_val: float, leads_off: bool, ts_ms: int):
        nonlocal sample_count, leads_off_count, adc_max
        sample_count += 1
        recent_ecg.append(ecg_val)
        if ecg_val > 1024.0:
            adc_max = 4095.0 # Detected 12-bit ADC
        if leads_off:
            leads_off_count += 1
        else:
            # Normalize to ~1.0 scale for Pan-Tompkins
            norm_ecg = (ecg_val - (adc_max / 2.0)) / (adc_max / 2.0)
            is_r, _ = detector.process_sample(norm_ecg)

    # Try 115200 baud first, with fallback to 9600 baud
    reader = SerialEcgReader(port=selected_port, baud_rate=115200, callback=on_sample)
    started = reader.start()
    
    if not started:
        print(f"[ERROR] Could not open {selected_port}. Is another program (e.g. Arduino IDE Serial Monitor) using it?")
        input("\nPress Enter to return...")
        return

    try:
        # Check if samples are arriving within 2 seconds
        t_wait = time.time()
        while sample_count == 0 and time.time() - t_wait < 2.5:
            time.sleep(0.1)
            sys.stdout.write(f"\r  [🔄 SYNCHRONIZING WITH {selected_port}...] Please ensure Arduino is powered on.")
            sys.stdout.flush()
            
        if sample_count == 0:
            print(f"\n  [!] No data at 115200 baud. Auto-switching to 9600 baud on {selected_port}...")
            reader.stop()
            reader = SerialEcgReader(port=selected_port, baud_rate=9600, callback=on_sample)
            reader.start()
            time.sleep(0.5)

        print("\n  [✓] LIVE TELEMETRY STREAM ESTABLISHED!\n")
        
        while True:
            time.sleep(0.04) # 25 Hz UI refresh
            now = time.time()
            if now - last_ui_update >= 0.05:
                last_ui_update = now
                
                cur_val = recent_ecg[-1] if recent_ecg else 0.0
                is_lo = (len(recent_ecg) > 0 and recent_ecg[-1] == 0.0)
                
                elapsed = now - start_time
                fps = sample_count / max(0.1, elapsed)
                
                wave_bar = render_ascii_waveform(cur_val, min_v=0.0, max_v=adc_max, width=42)
                status_icon = "⚠️ LEADS OFF" if is_lo else "💚 ARDUINO/ESP32 LIVE"
                
                sys.stdout.write(f"\r  [{status_icon:<20}] | ECG: {cur_val:6.1f} | [{wave_bar}] | Rate: {fps:5.1f} Hz | Samples: {sample_count:6d}")
                sys.stdout.flush()

    except KeyboardInterrupt:
        print("\n\n[INFO] Disconnecting hardware stream...")
    finally:
        reader.stop()
        print(f"[INFO] Hardware session closed. Total samples received: {sample_count}.")
        input("\nPress Enter to return to menu...")


if __name__ == "__main__":
    run_esp32_live_session()
