import os
import sys
import subprocess

TOKEN = os.environ.get("GITHUB_TOKEN")
OWNER = "ihatebaselines"
REPO = "camera505"
BRANCH = "main"
COMMIT_MSG = "ilove67,ihatebaselines,but stop making jokes with 67"

if not TOKEN:
    raise SystemExit("Set GITHUB_TOKEN in your local shell; never store it in source code.")

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GIT_DIR = os.path.join(os.environ.get("TEMP", "C:\\Temp"), "mingit")
GIT_EXE = os.path.join(GIT_DIR, "cmd", "git.exe")

def run_git(args, cwd=ROOT_DIR):
    cmd = [GIT_EXE] + args
    res = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)
    return res

print(f"[1/4] Configuring Git repo...")
run_git(["init"])
run_git(["config", "user.name", "ihatebaselines"])
run_git(["config", "user.email", "ihatebaselines@users.noreply.github.com"])
run_git(["branch", "-M", BRANCH])

print(f"[2/4] Staging all project files...")
run_git(["add", "."])

print(f"[3/4] Committing...")
commit_res = run_git(["commit", "-m", COMMIT_MSG])
print(commit_res.stdout)

print(f"[4/4] Pushing to https://github.com/{OWNER}/{REPO}...")
remote_url = f"https://ihatebaselines:{TOKEN}@github.com/ihatebaselines/camera505.git"
push_res = run_git(["push", remote_url, f"main:{BRANCH}", "--force"])

print("STDOUT:", push_res.stdout)
print("STDERR:", push_res.stderr)
print("RETURNCODE:", push_res.returncode)

# Clean up remote
run_git(["remote", "set-url", "origin", f"https://github.com/{OWNER}/{REPO}.git"])
