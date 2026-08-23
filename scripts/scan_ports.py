import serial
import serial.tools.list_ports

ports = list(serial.tools.list_ports.comports())
print(f"Detected by list_ports: {len(ports)}")
for p in ports:
    print(f"  -> {p.device}: {p.description} ({p.hwid})")

active = []
for i in range(1, 33):
    port_name = f"COM{i}"
    try:
        s = serial.Serial(port_name, 115200, timeout=0.2)
        s.close()
        active.append(port_name)
    except Exception as e:
        if "PermissionError" in str(e) or "Access is denied" in str(e):
            active.append(f"{port_name} (BUSY/LOCKED by Arduino IDE)")

print(f"Probing COM1..COM32 found active ports: {active}")
