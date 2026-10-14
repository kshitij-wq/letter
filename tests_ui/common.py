"""Shared by the browser tests: ports, the Django server, a static server for the built page, the Chromium launch.

Import it with  sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  from a script in tests_ui/react/.
"""
from __future__ import annotations

import http.server
import os
import socket
import socketserver
import subprocess
import sys
import threading
import time
from pathlib import Path
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parent.parent
FIX = ROOT / "tests_ui" / "fixtures"
PAGE = ROOT / "renderer" / "frontend" / "index.html"


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def start_django(port: int | None = None, env: dict | None = None):
    """Run the real Django server on a free port. Returns (process, "http://127.0.0.1:<port>/")."""
    port = port or free_port()
    proc = subprocess.Popen([sys.executable, "manage.py", "runserver", f"127.0.0.1:{port}", "--noreload"], cwd=ROOT,
                            env={**os.environ, "LS_NO_BROWSER": "1", "DJANGO_DEBUG": "1", **(env or {})},
                            stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT)
    url = f"http://127.0.0.1:{port}/"
    for _ in range(60):
        try:
            urlopen(url + "api/health", timeout=1)
            return proc, url
        except Exception:  # noqa: BLE001 - still starting
            time.sleep(0.5)
    proc.kill()
    raise SystemExit("The Django server did not start.")


class PageHandler(http.server.BaseHTTPRequestHandler):
    """Serves the built page at / and answers 404 to everything else (the page then stays in "claude.ai mode")."""

    def log_message(self, *a):
        pass

    def do_GET(self):
        if self.path.split("?")[0] in ("/", "/index.html"):
            b = PAGE.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(b)))
            self.end_headers()
            self.wfile.write(b)
        else:
            self.send_response(404)
            self.end_headers()


class _Server(socketserver.ThreadingMixIn, socketserver.TCPServer):
    daemon_threads = True
    allow_reuse_address = True


def start_static(handler=PageHandler):
    """A threaded HTTP server on a free port. Returns (server, port)."""
    srv = _Server(("127.0.0.1", 0), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, srv.server_address[1]


def launch(p, **kw):
    """p.chromium.launch(...) using CHROMIUM_PATH when Playwright has no browser of its own (sync or async)."""
    exe = os.environ.get("CHROMIUM_PATH")
    return p.chromium.launch(**({"executable_path": exe} if exe else {}), **kw)
