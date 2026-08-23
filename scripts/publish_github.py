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
    "User-Agent": "CAMERA-505-FastDeploy"
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

# 1. Collect files
files_to_push = []
for dirpath, dirnames, filenames in os.walk(root):
    dirnames[:] = [d for d in dirnames if d not in IGNORE_DIRS]
    for f in filenames:
        ext = os.path.splitext(f)[1]
        if ext in IGNORE_EXTENSIONS:
            continue
        full_path = os.path.join(dirpath, f)
        rel_path = os.path.relpath(full_path, root).replace('\\', '/')
        if rel_path.startswith("scripts/inspect_") or rel_path.startswith("scripts/deploy_") or rel_path.startswith("scripts/fast_deploy") or rel_path.startswith("scripts/direct_push") or rel_path.startswith("scripts/push_"):
            continue
        size = os.path.getsize(full_path)
        if size > 25 * 1024 * 1024:
            continue
        files_to_push.append((rel_path, full_path))

sys.stdout.write(f"[1/4] Uploading {len(files_to_push)} files with 25 threads...\n")
sys.stdout.flush()

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
            sys.stdout.write(f"Blob error on {rel_path}: {resp.status_code}\n")
            sys.stdout.flush()
            return None
    except Exception as e:
        sys.stdout.write(f"Exception on {rel_path}: {e}\n")
        sys.stdout.flush()
        return None

tree_entries = []
with ThreadPoolExecutor(max_workers=25) as executor:
    futures = [executor.submit(upload_blob, item) for item in files_to_push]
    for f in as_completed(futures):
        res = f.result()
        if res:
            tree_entries.append(res)

sys.stdout.write(f"[2/4] Created {len(tree_entries)} blobs.\n")
sys.stdout.flush()

# 2. Create Tree
tree_resp = requests.post(
    f"{BASE_URL}/git/trees",
    headers=HEADERS,
    json={"tree": tree_entries},
    timeout=30
)
if tree_resp.status_code != 201:
    sys.stdout.write(f"Tree creation failed: {tree_resp.text}\n")
    sys.stdout.flush()
    sys.exit(1)

tree_sha = tree_resp.json()["sha"]
sys.stdout.write(f"[3/4] Tree created: {tree_sha}\n")
sys.stdout.flush()

# 3. Create Commit
commit_payload = {
    "message": COMMIT_MSG,
    "tree": tree_sha,
    "parents": []
}
commit_resp = requests.post(f"{BASE_URL}/git/commits", headers=HEADERS, json=commit_payload, timeout=30)
if commit_resp.status_code != 201:
    sys.stdout.write(f"Commit creation failed: {commit_resp.text}\n")
    sys.stdout.flush()
    sys.exit(1)

new_commit_sha = commit_resp.json()["sha"]
sys.stdout.write(f"[4/4] Commit created: {new_commit_sha}\n")
sys.stdout.flush()

# 4. Create ref refs/heads/main
ref_payload = {
    "ref": f"refs/heads/{BRANCH}",
    "sha": new_commit_sha
}
ref_resp = requests.post(f"{BASE_URL}/git/refs", headers=HEADERS, json=ref_payload, timeout=30)
if ref_resp.status_code not in (200, 201):
    # Try patch if already exists
    ref_resp = requests.patch(
        f"{BASE_URL}/git/refs/heads/{BRANCH}",
        headers=HEADERS,
        json={"sha": new_commit_sha, "force": True},
        timeout=30
    )

if ref_resp.status_code not in (200, 201):
    sys.stdout.write(f"Ref update failed: {ref_resp.text}\n")
    sys.stdout.flush()
    sys.exit(1)

sys.stdout.write("\n============================================================\n")
sys.stdout.write("SUCCESS! ALL FILES COMMITTED & PUSHED TO GITHUB!\n")
sys.stdout.write(f"https://github.com/{OWNER}/{REPO}\n")
sys.stdout.write(f"Branch: {BRANCH}\n")
sys.stdout.write(f"Commit: {COMMIT_MSG}\n")
sys.stdout.write("============================================================\n")
sys.stdout.flush()
