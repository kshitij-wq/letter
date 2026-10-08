"""Fill a tagged .docx with one employee's values using real Jinja (docxtpl).

The filters below (indian_comma, int_comma, format_date, currentDatetime) copy how the
Letter Tagger preview assumes CompUp behaves. If CompUp's own filters differ, change
them here; everything else in the app follows.
"""
from __future__ import annotations

import io
import re
from datetime import date, datetime
from decimal import Decimal
from zoneinfo import ZoneInfo

from django.conf import settings
from docxtpl import DocxTemplate
from jinja2 import TemplateError, TemplateSyntaxError, Undefined, UndefinedError
from jinja2.sandbox import SandboxedEnvironment

NUMBER_RE = re.compile(r"[-+]?\d+(\.\d+)?")


class RenderError(Exception):
    """A template that Jinja can't fill, explained for people who write letters."""

    def __init__(self, message, kind="error", tag="", context=None, part=""):
        super().__init__(message)
        self.message = message
        self.kind = kind
        self.tag = tag
        self.context = context or []
        self.part = part

    def as_dict(self):
        return {"error": self.message, "kind": self.kind, "tag": self.tag, "context": self.context, "part": self.part}


# ---------------------------------------------------------------- filters

def _to_number(value):
    if isinstance(value, bool) or value is None or isinstance(value, Undefined):
        return None
    if isinstance(value, (int, float, Decimal)):
        return value
    text = str(value).strip().replace(",", "")
    if NUMBER_RE.fullmatch(text):
        return float(text) if "." in text else int(text)
    return None


def _group(number, indian):
    negative = number < 0
    number = abs(number)
    if isinstance(number, float) and number.is_integer():
        number = int(number)
    if isinstance(number, Decimal):
        text = format(number, "f")
    else:
        text = str(number) if isinstance(number, int) else repr(number)
    whole, _, decimals = text.partition(".")
    if indian:
        last3, rest = whole[-3:], whole[:-3]
        if rest:
            rest = re.sub(r"(\d)(?=(\d{2})+$)", r"\1,", rest) + ","
        whole = rest + last3
    else:
        whole = "{:,}".format(int(whole))
    return ("-" if negative else "") + whole + ("." + decimals if decimals else "")


def indian_comma(value):
    """12,00,000 style grouping. Text that isn't a number is printed as it is."""
    if value is None or value == "" or isinstance(value, Undefined):
        return ""
    number = _to_number(value)
    return str(value) if number is None else _group(number, indian=True)


def int_comma(value):
    """1,200,000 style grouping."""
    if value is None or value == "" or isinstance(value, Undefined):
        return ""
    number = _to_number(value)
    return str(value) if number is None else _group(number, indian=False)


def format_date(value, in_format="%d-%m-%Y", out_format="%B %d, %Y"):
    """Reformat a date. Values that don't match in_format are printed as they are."""
    if value is None or value == "" or isinstance(value, Undefined):
        return ""
    if isinstance(value, (date, datetime)):
        return value.strftime(out_format)
    try:
        return datetime.strptime(str(value).strip(), in_format).strftime(out_format)
    except ValueError:
        return str(value)


def current_datetime(fmt="%B %d, %Y"):
    return datetime.now(ZoneInfo(settings.TIME_ZONE)).strftime(fmt)


def make_env(autoescape=True):
    # Sandboxed: templates come from uploads, so they must not reach Python internals.
    env = SandboxedEnvironment(autoescape=autoescape, undefined=Undefined)
    env.filters.update({
        "indian_comma": indian_comma,
        "int_comma": int_comma,
        "format_date": format_date,
    })
    env.globals.update({"currentDatetime": current_datetime})
    return env


# ---------------------------------------------------------------- render

def _friendly(exc):
    text = str(exc)
    if isinstance(exc, UndefinedError):
        m = re.search(r"'([^']+)' is undefined", text)
        if m:
            return f"“{m.group(1)}” isn't in the data for this employee, and the tag uses it in a way that needs a value (for example with | float). Add the column, or write {m.group(1)} | default(0)."
        m = re.search(r"has no attribute '([^']+)'", text)
        if m:
            return f"“{m.group(1)}” is missing for this employee (for example custom_schema.{m.group(1)}), and the tag needs a value there. Add the column, or use | default(…)."
        return f"A value is missing for this employee: {text}"
    if isinstance(exc, TemplateSyntaxError):
        if "expected token 'end of statement block'" in text:
            return f"A tag has a typing mistake: {text}"
        if "Unexpected end of template" in text or "endif" in text and "Encountered unknown tag" in text:
            return f"An if or for block isn't closed properly: {text}"
        return f"A tag has a typing mistake: {text}"
    return text


def render_docx(template_bytes: bytes, context: dict, autoescape: bool | None = None) -> bytes:
    """Return the filled .docx as bytes, or raise RenderError."""
    if autoescape is None:
        autoescape = settings.LETTER_STUDIO["AUTOESCAPE"]
    try:
        tpl = DocxTemplate(io.BytesIO(template_bytes))
        # opening the parts early turns a broken file into a clear message
        tpl.init_docx()
    except Exception as exc:  # noqa: BLE001 - any failure here means "not a usable .docx"
        raise RenderError("That file isn't a .docx Word can open.", kind="file") from exc

    env = make_env(autoescape)
    try:
        tpl.render(context or {}, jinja_env=env, autoescape=autoescape)
    except TemplateError as exc:
        lines = [re.sub(r"\s+", " ", x).strip() for x in getattr(exc, "docx_context", []) or []]
        lines = [x for x in lines if x][:7]
        tag = ""
        for line in lines:
            m = re.search(r"\{[{%].*?[}%]\}", line)
            if m:
                tag = m.group(0)
                break
        part = getattr(getattr(tpl, "current_rendering_part", None), "partname", "") or ""
        raise RenderError(_friendly(exc), kind=type(exc).__name__, tag=tag, context=lines, part=str(part)) from exc
    except Exception as exc:  # noqa: BLE001 - filters or data can fail in many ways
        raise RenderError(f"The letter couldn't be filled: {exc}", kind=type(exc).__name__) from exc

    out = io.BytesIO()
    tpl.save(out)
    return out.getvalue()


def docx_text(docx_bytes: bytes) -> dict:
    """Plain text of the filled letter (body paragraphs, table rows, headers, footers) for quick checks."""
    from docx import Document

    doc = Document(io.BytesIO(docx_bytes))
    body = [p.text for p in doc.paragraphs]
    tables = [[[c.text for c in row.cells] for row in t.rows] for t in doc.tables]
    headers, footers = [], []
    for section in doc.sections:
        headers += [p.text for p in section.header.paragraphs]
        footers += [p.text for p in section.footer.paragraphs]
    return {"body": body, "tables": tables, "headers": headers, "footers": footers}
