"""Start Letter Studio on this computer.

In PyCharm: right-click this file → Run 'run_local'. Or from a terminal: python run_local.py

It checks the Python packages, starts the server on http://127.0.0.1:8000
and opens it in your browser. Stop it with the red square in PyCharm (or Ctrl+C).
"""
import importlib.util
import os
import sys
import threading
import webbrowser
from pathlib import Path

HERE = Path(__file__).resolve().parent
PORT = os.environ.get("PORT", "8000")
NEEDED = {"django": "Django", "docxtpl": "docxtpl", "docx": "python-docx", "jinja2": "Jinja2", "whitenoise": "whitenoise"}


def main():
    os.chdir(HERE)
    sys.path.insert(0, str(HERE))
    missing = [pkg for mod, pkg in NEEDED.items() if importlib.util.find_spec(mod) is None]
    if missing:
        print("Missing Python packages:", ", ".join(missing))
        print("Install them with:  pip install -r requirements.txt")
        print("(In PyCharm: open requirements.txt and click 'Install requirements' in the yellow bar.)")
        sys.exit(1)

    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "letterstudio.settings")
    import django
    django.setup()
    from renderer import assistant
    if assistant.ready():
        print(f"Claude: ready ({assistant.config()['model']})")
    else:
        print("Claude: not set up (optional). Copy .env.example to .env and add your ANTHROPIC_API_KEY.")

    url = f"http://127.0.0.1:{PORT}/"
    print(f"\nLetter Studio is starting at {url}\n")
    if os.environ.get("LS_NO_BROWSER") != "1":
        threading.Timer(1.5, lambda: webbrowser.open(url)).start()

    from django.core.management import call_command
    call_command("runserver", f"127.0.0.1:{PORT}", use_reloader=False)


if __name__ == "__main__":
    main()
