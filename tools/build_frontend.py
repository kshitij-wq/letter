"""Build renderer/frontend/index.html (the whole page, one self-contained file) from the React app in frontend/.

    python tools/build_frontend.py

This runs `npm --prefix frontend ci` when node_modules is missing, then `npm --prefix frontend run build` (Vite with
vite-plugin-singlefile: the scripts, styles, fonts and libraries are inlined, so the file works offline and can be
published as a claude.ai artifact). The built file is committed, so running Letter Studio never needs Node:
only whoever changes the page does.
"""
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FRONT = ROOT / "frontend"
OUT = ROOT / "renderer" / "frontend" / "index.html"


def run(cmd):
    print("$", " ".join(str(c) for c in cmd), flush=True)
    subprocess.run(cmd, check=True)


def main():
    npm = shutil.which("npm")
    if not npm:
        sys.exit("npm was not found. Install Node.js 22 or newer (https://nodejs.org) to rebuild the page.")
    if not (FRONT / "node_modules").exists():
        run([npm, "--prefix", str(FRONT), "ci"])
    run([npm, "--prefix", str(FRONT), "run", "build"])
    if not OUT.exists():
        sys.exit(f"The build finished but {OUT.relative_to(ROOT)} is missing.")
    print(f"Wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
