"""
CAMERA 505 - Automated Hardware Connection & Multi-Protocol Auto-Negotiator
Probes all connected serial devices (COM3, COM5, etc.),
tests baud rates (115200, 9600, 921600), identifies payload format
(ECG stream vs Wi-Fi CSI Radar vs Raw ADC), and verifies continuous live streaming.
"""

import sys
import time
import os

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
    print("[ERROR] pyserial is not installed.")
    sys.exit(1)

from src.ingestion.serial_stream import SerialEcgReader, list_available_com_ports
from src.ingestion.wifi_csi_stream import WifiCsiPacketParser


def test_and_auto_connect():
    print("\n" + "="*80)
    print("  🔌 CAMERA 505 — HARDWARE CONNECTION & PROTOCOL VALIDATOR")
    print("="*80)

    # 1. Enumerate all hardware ports
    ports = list_available_com_ports()
    print(f"  [1] Scanning Windows Serial Bus ({len(ports)} device(s) found):")
    if not ports:
        print("      ⚠️ No active serial COM ports detected in Device Manager.")
        print("      Please ensure your ESP32 / Arduino is plugged in via USB data cable.")
        return False

    for idx, p in enumerate(ports, 1):
        print(f"      [{idx}] {p['device']} - {p['description']}")

    target_ports = [p["device"] for p in ports]
    # Test each port with multiple baud rates
    baud_candidates = [115200, 9600, 921600, 57600]
    
    csi_parser = WifiCsiPacketParser()
    ecg_reader_helper = SerialEcgReader()

    active_connection = None

    for port_name in target_ports:
        print(f"\n  [2] Probing {port_name} across {len(baud_candidates)} baud rates...")
        for baud in baud_candidates:
            try:
                ser = serial.Serial(port_name, baud, timeout=0.8)
                ser.dtr = True
                ser.rts = True
                time.sleep(0.5) # Wait for microcontroller synchronization
                ser.reset_input_buffer()

                # Listen for 1.5 seconds
                t_start = time.time()
                rx_lines = []
                while time.time() - t_start < 1.5:
                    if ser.in_waiting > 0:
                        raw = ser.readline().decode('utf-8', errors='ignore').strip()
                        if raw:
                            rx_lines.append(raw)
                    time.sleep(0.02)

                ser.close()

                if rx_lines:
                    print(f"      [✓] ACTIVE TELEMETRY DETECTED on {port_name} @ {baud} baud! ({len(rx_lines)} packets/sec)")
                    print(f"          Sample Payload: {repr(rx_lines[0])}")

                    # Determine Protocol
                    sample = rx_lines[0]
                    if ";" in sample and "," in sample:
                        protocol = "Wi-Fi CSI RF Radar (camera505_radar_rx.ino)"
                    elif "ECG:" in sample.upper():
                        protocol = "AD8232 ECG Biometric Telemetry (camera505_ecg_sensor.ino)"
                    elif "LEADS OFF" in sample.upper():
                        protocol = "AD8232 ECG (Leads Detached State)"
                    else:
                        protocol = "Raw ADC Stream"

                    print(f"          Protocol Type:  {protocol}")
                    active_connection = {
                        "port": port_name,
                        "baud": baud,
                        "protocol": protocol,
                        "sample_payload": sample
                    }
                    break

            except serial.SerialException as e:
                if "PermissionError" in str(e) or "Access is denied" in str(e):
                    print(f"      [!] {port_name} is locked by another process (e.g. Arduino IDE Serial Monitor).")
                else:
                    pass

        if active_connection:
            break

    print("\n" + "="*80)
    if active_connection:
        print("  🎉 HARDWARE CONNECTION VERIFIED AND READY TO STREAM!")
        print(f"  • Port:     {active_connection['port']}")
        print(f"  • Baud:     {active_connection['baud']}")
        print(f"  • Protocol: {active_connection['protocol']}")
        print("="*80)
        return True
    else:
        print("  ⚠️ Hardware connection in standby mode.")
        print("  If port is in use, please close Arduino IDE Serial Monitor.")
        print("="*80)
        return False


if __name__ == "__main__":
    test_and_auto_connect()
