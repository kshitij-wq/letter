@echo off
rem Double-click to start Letter Studio on Windows (first run installs the packages).
cd /d "%~dp0"
if not exist .venv (
  echo Creating the Python environment...
  py -3 -m venv .venv || python -m venv .venv
)
call .venv\Scripts\activate.bat
python -m pip install -q -r requirements.txt
python run_local.py
pause
