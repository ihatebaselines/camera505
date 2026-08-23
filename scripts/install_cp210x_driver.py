import os
import urllib.request
import zipfile
import subprocess
import sys

driver_dir = os.path.join(os.getcwd(), "drivers", "cp210x")
os.makedirs(driver_dir, exist_ok=True)
zip_path = os.path.join(driver_dir, "cp210x.zip")

urls = [
    "https://www.silabs.com/documents/public/software/CP210x_Universal_Windows_Driver.zip",
    "https://www.silabs.com/documents/public/software/CP210x_Windows_Drivers.zip",
    "https://cdn.sparkfun.com/assets/learn_tutorials/8/4/CP210x_Windows_Drivers.zip"
]

downloaded = False
for url in urls:
    print(f"Trying to download from {url}...")
    try:
        req = urllib.request.Request(
            url,
            headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
        )
        with urllib.request.urlopen(req, timeout=15) as response, open(zip_path, 'wb') as out_file:
            out_file.write(response.read())
        print(f"Successfully downloaded {os.path.getsize(zip_path)} bytes from {url}!")
        downloaded = True
        break
    except Exception as e:
        print(f"Failed {url}: {e}")

if downloaded:
    try:
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            zip_ref.extractall(driver_dir)
        print(f"Extracted to {driver_dir}.")
        
        # Look for .inf files to install with pnputil
        inf_files = []
        for root, dirs, files in os.walk(driver_dir):
            for f in files:
                if f.lower().endswith(".inf"):
                    inf_files.append(os.path.join(root, f))
                    
        print(f"Found INF files: {inf_files}")
        for inf in inf_files:
            print(f"Installing driver: pnputil /add-driver {inf} /install ...")
            cmd = f'pnputil /add-driver "{inf}" /install'
            res = subprocess.run(cmd, shell=True, capture_output=True, text=True)
            print("STDOUT:", res.stdout)
            print("STDERR:", res.stderr)
            
    except Exception as e:
        print(f"Extraction / Install error: {e}")
