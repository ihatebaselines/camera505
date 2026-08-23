import subprocess
import os

proc = subprocess.run(["tasklist", "/V", "/FO", "CSV"], capture_output=True, text=True)
for line in proc.stdout.splitlines():
    if any(k in line.lower() for k in ["arduino", "ide", "serial", "java", "electron"]):
        print(line)
