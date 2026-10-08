"""Convert a filled .docx to PDF with LibreOffice, the way CompUp produces letters."""
from __future__ import annotations

import logging
import os
import platform
import re
import shutil
import subprocess
import tempfile
import threading
from functools import lru_cache
from pathlib import Path

from django.conf import settings

log = logging.getLogger("renderer")

_slots = threading.BoundedSemaphore(max(1, settings.LETTER_STUDIO["PDF_PARALLEL"]))

COMMON_PATHS = [
    "/usr/bin/soffice",
    "/usr/bin/libreoffice",
    "/usr/local/bin/soffice",
    "/opt/libreoffice/program/soffice",
    "/Applications/LibreOffice.app/Contents/MacOS/soffice",
    r"C:\Program Files\LibreOffice\program\soffice.exe",
    r"C:\Program Files (x86)\LibreOffice\program\soffice.exe",
]


class PdfError(Exception):
    pass


def find_soffice() -> str | None:
    configured = settings.LETTER_STUDIO["SOFFICE_PATH"]
    if configured:
        return configured if Path(configured).exists() else None
    for name in ("soffice", "libreoffice"):
        found = shutil.which(name)
        if found:
            return found
    for path in COMMON_PATHS:
        if Path(path).exists():
            return path
    return None


@lru_cache(maxsize=1)
def libreoffice_version() -> str | None:
    soffice = find_soffice()
    if not soffice:
        return None
    try:
        out = subprocess.run([soffice, "--version"], capture_output=True, text=True, timeout=60)
        return (out.stdout or out.stderr).strip().splitlines()[0] if (out.stdout or out.stderr) else None
    except Exception:  # noqa: BLE001
        return None


@lru_cache(maxsize=1)
def installed_fonts() -> list[str] | None:
    """Font families LibreOffice can use on this machine (Linux/macOS with fontconfig). None if unknown."""
    fc = shutil.which("fc-list")
    if not fc:
        return None
    try:
        out = subprocess.run([fc, ":", "family"], capture_output=True, text=True, timeout=60).stdout
    except Exception:  # noqa: BLE001
        return None
    families = set()
    for line in out.splitlines():
        for name in line.split(","):
            name = name.strip()
            if name:
                families.add(name)
    return sorted(families, key=str.casefold)


def docx_to_pdf(docx_bytes: bytes) -> bytes:
    soffice = find_soffice()
    if not soffice:
        raise PdfError("LibreOffice isn't installed on this computer, or SOFFICE_PATH is wrong. See the README.")
    timeout = settings.LETTER_STUDIO["PDF_TIMEOUT"]
    with _slots, tempfile.TemporaryDirectory(prefix="ls_pdf_") as work:
        work_dir = Path(work)
        src = work_dir / "letter.docx"
        src.write_bytes(docx_bytes)
        # A separate profile per conversion lets several run at once without locking each other.
        profile = (work_dir / "profile").resolve().as_uri()
        cmd = [soffice, f"-env:UserInstallation={profile}", "--headless", "--norestore", "--nolockcheck",
               "--convert-to", "pdf", "--outdir", str(work_dir), str(src)]
        try:
            proc = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        except subprocess.TimeoutExpired as exc:
            raise PdfError(f"LibreOffice took longer than {timeout} s and was stopped.") from exc
        pdf = work_dir / "letter.pdf"
        if not pdf.exists():
            log.warning("LibreOffice failed: %s %s", proc.stdout, proc.stderr)
            raise PdfError("LibreOffice couldn't convert the letter. " + (proc.stderr or proc.stdout or "").strip()[:300])
        return pdf.read_bytes()


def pdf_page_count(pdf_bytes: bytes) -> int:
    return len(re.findall(rb"/Type\s*/Page(?![s\w])", pdf_bytes))


def system_info() -> dict:
    return {
        "python": platform.python_version(),
        "platform": platform.platform(terse=True),
        "soffice": find_soffice(),
        "libreoffice": libreoffice_version(),
        "pdf_parallel": settings.LETTER_STUDIO["PDF_PARALLEL"],
        "cpu": os.cpu_count(),
    }
