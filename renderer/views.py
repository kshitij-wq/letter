"""HTTP endpoints. The page at / is the Letter Tagger; it calls /api/validate to check templates with real Jinja."""
from __future__ import annotations

import json
import logging
import platform
import re
from pathlib import Path

import django
import docxtpl
import jinja2
from django.conf import settings
from django.http import HttpResponse, HttpResponseNotAllowed, JsonResponse
from django.templatetags.static import static
from django.views.decorators.csrf import ensure_csrf_cookie

from .engine import RenderError, docx_text, render_docx, validate_docx

log = logging.getLogger("renderer")
FRONTEND = Path(__file__).resolve().parent / "frontend" / "index.html"
DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


@ensure_csrf_cookie
def index(request):
    # The page is full of {{ … }} and {% … %} examples, so it is served as a file, not a Django template.
    html = FRONTEND.read_text(encoding="utf-8").replace("__STATIC__/", static("renderer/"))
    return HttpResponse(html, content_type="text/html; charset=utf-8")


def health(request):
    return JsonResponse({
        "status": "ok",
        "app": "Letter Studio",
        "validate": True,
        "render": True,
        "autoescape": settings.LETTER_STUDIO["AUTOESCAPE"],
        "versions": {"python": platform.python_version(), "django": django.get_version(),
                     "docxtpl": getattr(docxtpl, "__version__", ""), "jinja2": jinja2.__version__},
    })


def _safe_name(name, ext):
    stem = re.sub(r"[^\w.\- ]+", "_", Path(name or "letter").stem).strip() or "letter"
    return f"{stem[:80]}.{ext}"


def _json_errors(view):
    def wrapped(request):
        try:
            return view(request)
        except Exception:  # noqa: BLE001 - always answer the page in JSON, never an HTML error page
            log.exception("%s failed", view.__name__)
            return JsonResponse({"error": "Something went wrong on the server. The details are in the terminal where Letter Studio is running.", "kind": "server"}, status=500)
    wrapped.__name__ = view.__name__
    return wrapped


def _upload(request):
    """The .docx from the request, or a JsonResponse saying what is wrong with it."""
    upload = request.FILES.get("template")
    if not upload:
        return None, JsonResponse({"error": "Send the tagged letter as “template”."}, status=400)
    if not upload.name.lower().endswith(".docx"):
        return None, JsonResponse({"error": "The template has to be a .docx file."}, status=400)
    if upload.size > settings.MAX_UPLOAD_MB * 1024 * 1024:
        return None, JsonResponse({"error": f"The letter is larger than {settings.MAX_UPLOAD_MB} MB. Make the pictures in it smaller, or raise LS_MAX_UPLOAD_MB."}, status=413)
    return upload, None


@_json_errors
def render(request):
    """POST multipart: template (.docx), context (JSON), format (docx | json), name.

    docx returns the filled file; json returns the filled text, for quick checks.
    Errors come back as JSON with a plain-language message and the tag near the problem.
    """
    if request.method != "POST":
        return HttpResponseNotAllowed(["POST"])
    upload, err = _upload(request)
    if err:
        return err
    try:
        context = json.loads(request.POST.get("context") or "{}")
        if not isinstance(context, dict):
            raise ValueError
    except ValueError:
        return JsonResponse({"error": "The employee values aren't valid JSON."}, status=400)
    fmt = (request.POST.get("format") or "docx").lower()
    if fmt not in {"docx", "json"}:
        return JsonResponse({"error": "format must be docx or json."}, status=400)
    autoescape = request.POST.get("autoescape")
    autoescape = settings.LETTER_STUDIO["AUTOESCAPE"] if autoescape is None else autoescape.lower() in {"1", "true", "yes"}

    try:
        filled = render_docx(upload.read(), context, autoescape=autoescape)
    except RenderError as exc:
        return JsonResponse(exc.as_dict(), status=422)

    name = request.POST.get("name") or upload.name
    if fmt == "json":
        return JsonResponse({"ok": True, "text": docx_text(filled)})
    resp = HttpResponse(filled, content_type=DOCX_TYPE)
    resp["Content-Disposition"] = f'attachment; filename="{_safe_name(name, "docx")}"'
    return resp


@_json_errors
def validate(request):
    """POST multipart: template (.docx) and, optionally, employees (JSON list of
    {"label": "E1 · Asha", "values": {...}}). Checks the template with real Jinja; makes no file."""
    if request.method != "POST":
        return HttpResponseNotAllowed(["POST"])
    upload, err = _upload(request)
    if err:
        return err
    employees = None
    if request.POST.get("employees"):
        try:
            employees = json.loads(request.POST["employees"])
            if not isinstance(employees, list) or not all(isinstance(e, dict) for e in employees):
                raise ValueError
        except ValueError:
            return JsonResponse({"error": "employees must be a JSON list of {label, values}."}, status=400)
    autoescape = request.POST.get("autoescape")
    autoescape = settings.LETTER_STUDIO["AUTOESCAPE"] if autoescape is None else autoescape.lower() in {"1", "true", "yes"}
    try:
        return JsonResponse(validate_docx(upload.read(), employees, autoescape=autoescape))
    except RenderError as exc:
        return JsonResponse(exc.as_dict(), status=422)
