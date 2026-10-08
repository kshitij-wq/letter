#!/usr/bin/env bash
# Start Letter Studio on macOS or Linux (first run installs the packages).
cd "$(dirname "$0")"
[ -d .venv ] || python3 -m venv .venv
source .venv/bin/activate
python -m pip install -q -r requirements.txt
python run_local.py
