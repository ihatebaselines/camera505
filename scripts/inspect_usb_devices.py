import sys
import subprocess
import json

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

print("="*80)
print("  WINDOWS USB & HARDWARE ENUMERATION")
print("="*80)

# Use PowerShell with JSON export
ps_cmd = """
Get-CimInstance Win32_PnPEntity | Where-Object { $_.PNPClass -in 'Ports','USB' -or $_.Name -like '*Serial*' -or $_.Name -like '*Arduino*' -or $_.Name -like '*CH340*' -or $_.Name -like '*CP210*' -or $_.Name -like '*FTDI*' } | Select-Object Name, DeviceID, Status, PNPClass | ConvertTo-Json
"""

try:
    proc = subprocess.run(["powershell", "-NoProfile", "-Command", ps_cmd], capture_output=True, text=True, timeout=10)
    if proc.stdout.strip():
        data = json.loads(proc.stdout)
        if isinstance(data, dict):
            data = [data]
        print(f"Found {len(data)} matching PNP entities:")
        for item in data:
            print(f"  • [{item.get('Status')}] {item.get('Name')} (Class: {item.get('PNPClass')})")
            print(f"    ID: {item.get('DeviceID')}")
    else:
        print("No matching USB/Serial devices returned by CIM.")
except Exception as e:
    print(f"Error querying CIM: {e}")

# Check serial ports via pyserial
import serial.tools.list_ports
ports = list(serial.tools.list_ports.comports())
print(f"\nPySerial Detected COM Ports ({len(ports)}):")
for p in ports:
    print(f"  • {p.device}: {p.description}")
