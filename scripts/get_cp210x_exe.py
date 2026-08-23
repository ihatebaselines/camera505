import os
import urllib.request
import zipfile

out_dir = os.path.join(os.getcwd(), "drivers", "cp210x_exe")
os.makedirs(out_dir, exist_ok=True)
zip_path = os.path.join(out_dir, "cp210x_exe.zip")

url = "https://cdn.sparkfun.com/assets/learn_tutorials/8/4/CP210x_Windows_Drivers.zip"
print(f"Downloading {url}...")
try:
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=15) as r, open(zip_path, 'wb') as f:
        f.write(r.read())
    print(f"Downloaded {os.path.getsize(zip_path)} bytes.")
    with zipfile.ZipFile(zip_path, 'r') as z:
        z.extractall(out_dir)
    print(f"Extracted to {out_dir}:")
    for item in os.listdir(out_dir):
        print("  -", item)
except Exception as e:
    print(f"Error: {e}")
