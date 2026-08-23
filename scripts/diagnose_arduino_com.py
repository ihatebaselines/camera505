"""
CAMERA 505 - Arduino / ESP32 Serial Hardware Diagnostic Utility
Probes COM5 (and other ports), tests baud rates, inspects DTR reset,
and displays raw incoming bytes from the microcontroller.
"""

import sys
import time
import os

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

try:
    import serial
    import serial.tools.list_ports
except ImportError:
    print("[ERROR] pyserial is not installed.")
    sys.exit(1)

def diagnose_port(port_name="COM5"):
    print("\n" + "="*80)
    print(f"  [DIAGNOSTIC] HARDWARE ON {port_name}")
    print("="*80)

    # 1. Check all detected ports
    all_ports = list(serial.tools.list_ports.comports())
    print(f"  Available Windows COM Ports ({len(all_ports)} found):")
    for p in all_ports:
        print(f"    • {p.device}: {p.description} [{p.hwid}]")

    # 2. Try opening COM5 at 115200 and 9600 baud
    for baud in [115200, 9600, 57600]:
        print(f"\n  [-->] Testing connection to {port_name} at {baud} baud (with DTR/RTS reset)...")
        try:
            ser = serial.Serial(
                port=port_name,
                baudrate=baud,
                timeout=1.0,
                rtscts=False,
                dsrdtr=False
            )
            ser.dtr = True
            ser.rts = True
            time.sleep(1.8) # Wait for Arduino bootloader reset
            ser.reset_input_buffer()

            print(f"  [✓] Successfully opened {port_name} @ {baud} baud! Listening for 3 seconds...")
            t_start = time.time()
            lines_received = []
            
            while time.time() - t_start < 3.0:
                if ser.in_waiting > 0:
                    raw_bytes = ser.readline()
                    line = raw_bytes.decode('utf-8', errors='replace').strip()
                    if line:
                        lines_received.append(line)
                        print(f"      RX ({len(raw_bytes)} bytes): {repr(line)}")
                time.sleep(0.05)

            ser.close()

            if lines_received:
                print(f"  [SUCCESS] Received {len(lines_received)} lines from {port_name} at {baud} baud!")
                return True
            else:
                print(f"  [!] Port opened at {baud} baud, but 0 bytes were received.")

        except serial.SerialException as e:
            print(f"  [ERROR] Could not open {port_name} at {baud} baud: {e}")
            if "PermissionError" in str(e) or "Access is denied" in str(e):
                print("  ⚠️ REASON: Port is LOCKED by another application (close Arduino IDE Serial Monitor!).")
                return False

    print("\n  [?] Summary: No raw telemetry received on COM5.")
    return False

if __name__ == "__main__":
    target = sys.argv[1] if len(sys.argv) > 1 else "COM5"
    diagnose_port(target)
