import time
import sys
import os

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from src.ingestion.serial_stream import SerialEcgReader

count = 0
samples_log = []

def on_sample(v, lo, ts):
    global count
    count += 1
    samples_log.append((v, lo))
    if count <= 10 or count % 15 == 0:
        print(f"  [LIVE RX #{count:04d}] ECG Voltage = {v:6.1f} ADC | LeadsOff = {lo}")

print("="*75)
print("  CONNECTING TO PHYSICAL HARDWARE (COM3 @ 115200 BAUD)...")
print("="*75)

reader = SerialEcgReader(port="COM3", baud_rate=115200, callback=on_sample)
reader.start()
time.sleep(3.0)
reader.stop()

print("="*75)
print(f"  FINISHED! Received {count} live biopotential samples from physical hardware!")
if count > 0:
    print(f"  Average Sample Value: {sum(s[0] for s in samples_log)/len(samples_log):.1f}")
print("="*75)
