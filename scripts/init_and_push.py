import os
import sys
import base64
import json
import requests
from concurrent.futures import ThreadPoolExecutor, as_completed

TOKEN = os.environ.get("GITHUB_TOKEN")
OWNER = "ihatebaselines"
REPO = "camera505"
BRANCH = "main"
COMMIT_MSG = "ilove67,ihatebaselines,but stop making jokes with 67"

BASE_URL = f"https://api.github.com/repos/{OWNER}/{REPO}"
HEADERS = {
    "Authorization": f"Bearer {TOKEN}",
    "Accept": "application/vnd.github.v3+json",
    "User-Agent": "CAMERA-505-Deploy"
}

if not TOKEN:
    raise SystemExit("Set GITHUB_TOKEN in your local shell; never store it in source code.")

IGNORE_DIRS = {
    'node_modules', '.next', '.git', '__pycache__', 'catboost_info',
    '.venv', 'venv', 'env', '.idea', '.vscode'
}
IGNORE_EXTENSIONS = {
    '.pyc', '.pyo', '.pyd', '.log', '.tmp', '.DS_Store', '.db', '.sqlite', '.zip'
}

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# 1. Initialize repo if empty by creating README.md
print("[1/5] Initializing repository...")
readme_content = base64.b64encode(b"# CAMERA 505 - Medical Sleep Monitoring Platform\n*WE DON'T SUPPORT 67*\n").decode("utf-8")
init_resp = requests.put(
    f"{BASE_URL}/contents/README.md",
    headers=HEADERS,
    json={"message": "Initialize repository", "content": readme_content, "branch": BRANCH},
    timeout=30
)
if init_resp.status_code in (200, 201):
    print("✓ Initialized repository with README.md")
else:
    print(f"Repo already initialized or response: {init_resp.status_code}")

# 2. Collect all project files
files_to_push = []
for dirpath, dirnames, filenames in os.walk(root):
    dirnames[:] = [d for d in dirnames if d not in IGNORE_DIRS]
    for f in filenames:
        ext = os.path.splitext(f)[1]
        if ext in IGNORE_EXTENSIONS:
            continue
        full_path = os.path.join(dirpath, f)
        rel_path = os.path.relpath(full_path, root).replace('\\', '/')
        if rel_path.startswith("scripts/inspect_") or rel_path.startswith("scripts/deploy_") or rel_path.startswith("scripts/fast_deploy") or rel_path.startswith("scripts/direct_push") or rel_path.startswith("scripts/push_") or rel_path.startswith("scripts/publish_") or rel_path.startswith("scripts/init_and_push"):
            continue
        size = os.path.getsize(full_path)
        if size > 25 * 1024 * 1024:
            continue
        files_to_push.append((rel_path, full_path))

print(f"[2/5] Creating Git blobs for {len(files_to_push)} files...")

def upload_blob(item):
    rel_path, full_path = item
    try:
        with open(full_path, "rb") as f_in:
            content_bytes = f_in.read()
        content_b64 = base64.b64encode(content_bytes).decode("utf-8")
        
        resp = requests.post(
            f"{BASE_URL}/git/blobs",
            headers=HEADERS,
            json={"content": content_b64, "encoding": "base64"},
            timeout=30
        )
        if resp.status_code == 201:
            return {
                "path": rel_path,
                "mode": "100644",
                "type": "blob",
                "sha": resp.json()["sha"]
            }
        else:
            print(f"Error on {rel_path}: {resp.status_code}")
            return None
    except Exception as e:
        print(f"Exception on {rel_path}: {e}")
        return None

tree_entries = []
with ThreadPoolExecutor(max_workers=25) as executor:
    futures = [executor.submit(upload_blob, item) for item in files_to_push]
    for f in as_completed(futures):
        res = f.result()
        if res:
            tree_entries.append(res)

print(f"[3/5] Successfully uploaded {len(tree_entries)} blobs.")

# 3. Create Tree
print("[4/5] Creating Git Tree...")
tree_resp = requests.post(
    f"{BASE_URL}/git/trees",
    headers=HEADERS,
    json={"tree": tree_entries},
    timeout=30
)
if tree_resp.status_code != 201:
    print("Tree creation failed:", tree_resp.text)
    sys.exit(1)
tree_sha = tree_resp.json()["sha"]

# 4. Get parent commit SHA
parent_shas = []
ref_resp = requests.get(f"{BASE_URL}/git/ref/heads/{BRANCH}", headers=HEADERS, timeout=10)
if ref_resp.status_code == 200:
    parent_shas.append(ref_resp.json()["object"]["sha"])

# 5. Create Commit
print(f"[5/5] Creating commit: '{COMMIT_MSG}'...")
commit_payload = {
    "message": COMMIT_MSG,
    "tree": tree_sha,
    "parents": parent_shas
}
commit_resp = requests.post(f"{BASE_URL}/git/commits", headers=HEADERS, json=commit_payload, timeout=30)
if commit_resp.status_code != 201:
    print("Commit creation failed:", commit_resp.text)
    sys.exit(1)
new_commit_sha = commit_resp.json()["sha"]

# 6. Update Ref
update_resp = requests.patch(
    f"{BASE_URL}/git/refs/heads/{BRANCH}",
    headers=HEADERS,
    json={"sha": new_commit_sha, "force": True},
    timeout=30
)

if update_resp.status_code not in (200, 201):
    print("Ref update failed:", update_resp.text)
    sys.exit(1)

print("\n" + "=" * 60)
print("SUCCESS! PROJECT PUBLISHED TO GITHUB!")
print(f"Repository: https://github.com/{OWNER}/{REPO}")
print(f"Branch: {BRANCH}")
print(f"Commit: {COMMIT_MSG}")
print("=" * 60 + "\n")
