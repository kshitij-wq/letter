"""HTTP endpoints. The page at / is the Letter Tagger; it calls these to fill and convert letters."""
from __future__ import annotations

import json
import logging
import re
from pathlib import Path

from django.conf import settings
from django.http import HttpResponse, HttpResponseNotAllowed, JsonResponse
from django.templatetags.static import static
from django.views.decorators.csrf import ensure_csrf_cookie

from .engine import RenderError, docx_text, render_docx
from .pdf import PdfError, docx_to_pdf, installed_fonts, pdf_page_count, system_info

log = logging.getLogger("renderer")
FRONTEND = Path(__file__).resolve().parent / "frontend" / "index.html"
DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


@ensure_csrf_cookie
def index(request):
    # The page is full of {{ … }} and {% … %} examples, so it is served as a file, not a Django template.
    html = FRONTEND.read_text(encoding="utf-8").replace("__STATIC__/", static("renderer/"))
    return HttpResponse(html, content_type="text/html; charset=utf-8")


def health(request):
    info = system_info()
    return JsonResponse({
        "status": "ok",
        "app": "Letter Studio",
        "render": True,
        "pdf": bool(info["soffice"]),
        "libreoffice": info["libreoffice"],
        "fonts": installed_fonts(),
        "autoescape": settings.LETTER_STUDIO["AUTOESCAPE"],
        "system": info,
    })


def _safe_name(name, ext):
    stem = re.sub(r"[^\w.\- ]+", "_", Path(name or "letter").stem).strip() or "letter"
    return f"{stem[:80]}.{ext}"


def render(request):
    try:
        return _render(request)
    except Exception:  # noqa: BLE001 - always answer the page in JSON, never an HTML error page
        log.exception("render failed")
        return JsonResponse({"error": "Something went wrong on the server while filling the letter. The details are in the terminal where Letter Studio is running.", "kind": "server"}, status=500)


def _render(request):
    """POST multipart: template (.docx), context (JSON), format (docx | pdf | json), name.

    docx/pdf return the file; json returns the filled text, for quick checks.
    Errors come back as JSON with a plain-language message and the tag near the problem.
    """
    if request.method != "POST":
        return HttpResponseNotAllowed(["POST"])
    upload = request.FILES.get("template")
    if not upload:
        return JsonResponse({"error": "Send the tagged letter as “template”."}, status=400)
    if not upload.name.lower().endswith(".docx"):
        return JsonResponse({"error": "The template has to be a .docx file."}, status=400)
    if upload.size > settings.MAX_UPLOAD_MB * 1024 * 1024:
        return JsonResponse({"error": f"The letter is larger than {settings.MAX_UPLOAD_MB} MB. Make the pictures in it smaller, or raise LS_MAX_UPLOAD_MB."}, status=413)
    try:
        context = json.loads(request.POST.get("context") or "{}")
        if not isinstance(context, dict):
            raise ValueError
    except ValueError:
        return JsonResponse({"error": "The employee values aren't valid JSON."}, status=400)
    fmt = (request.POST.get("format") or "pdf").lower()
    if fmt not in {"pdf", "docx", "json"}:
        return JsonResponse({"error": "format must be pdf, docx or json."}, status=400)
    autoescape = request.POST.get("autoescape")
    autoescape = settings.LETTER_STUDIO["AUTOESCAPE"] if autoescape is None else autoescape.lower() in {"1", "true", "yes"}

    try:
        filled = render_docx(upload.read(), context, autoescape=autoescape)
    except RenderError as exc:
        return JsonResponse(exc.as_dict(), status=422)

    name = request.POST.get("name") or upload.name
    if fmt == "json":
        return JsonResponse({"ok": True, "text": docx_text(filled)})
    if fmt == "docx":
        resp = HttpResponse(filled, content_type=DOCX_TYPE)
        resp["Content-Disposition"] = f'attachment; filename="{_safe_name(name, "docx")}"'
        return resp
    try:
        pdf = docx_to_pdf(filled)
    except PdfError as exc:
        return JsonResponse({"error": str(exc), "kind": "pdf"}, status=503)
    resp = HttpResponse(pdf, content_type="application/pdf")
    resp["Content-Disposition"] = f'inline; filename="{_safe_name(name, "pdf")}"'
    resp["X-Page-Count"] = str(pdf_page_count(pdf))
    resp["Access-Control-Expose-Headers"] = "X-Page-Count"
    return resp
