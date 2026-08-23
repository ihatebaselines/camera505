import os
import urllib.request
import zipfile
import json

dest_dir = os.path.join(os.getcwd(), "firmware", "dragosgatan_fatn")
os.makedirs(dest_dir, exist_ok=True)
zip_path = os.path.join(dest_dir, "repo.zip")

urls = [
    "https://github.com/dragosgatan/fatn/archive/refs/heads/main.zip",
    "https://github.com/dragosgatan/fatn/archive/refs/heads/master.zip"
]

downloaded = False
for url in urls:
    try:
        print(f"Downloading from {url}...")
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=15) as resp, open(zip_path, 'wb') as f:
            f.write(resp.read())
        print(f"Downloaded {os.path.getsize(zip_path)} bytes.")
        with zipfile.ZipFile(zip_path, 'r') as z:
            z.extractall(dest_dir)
        print(f"Extracted to {dest_dir}")
        downloaded = True
        break
    except Exception as e:
        print(f"Failed {url}: {e}")

if not downloaded:
    # Use GitHub API
    api_url = "https://api.github.com/repos/dragosgatan/fatn/contents"
    try:
        req = urllib.request.Request(api_url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=15) as resp:
            items = json.loads(resp.read())
        print("GitHub API contents:")
        for item in items:
            print("  -", item.get("name"), item.get("download_url"))
            if item.get("download_url"):
                fpath = os.path.join(dest_dir, item["name"])
                urllib.request.urlretrieve(item["download_url"], fpath)
                print(f"    Saved {item['name']}")
    except Exception as e:
        print(f"API failed: {e}")

print("\nAll files in destination:")
for root, dirs, files in os.walk(dest_dir):
    for f in files:
        print("  •", os.path.join(root, f))
