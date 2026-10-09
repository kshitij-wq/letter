"""Claude in Letter Studio: suggestions from the Anthropic API, with your own API key.

The key is read from ANTHROPIC_API_KEY on this computer (or the .env file) and never reaches
the browser. The page sends the letter's text, tag names, column names and the values of
columns that only have a few categories (levels, yes/no, template names): no employee rows.
"""
from __future__ import annotations

import json
import logging
import socket
import ssl
import urllib.error
import urllib.request

from django.conf import settings

log = logging.getLogger("renderer")
API_URL = "https://api.anthropic.com/v1/messages"
API_VERSION = "2023-06-01"


class AssistError(Exception):
    def __init__(self, message, status=502):
        super().__init__(message)
        self.message = message
        self.status = status


def config():
    c = settings.LETTER_STUDIO
    return {"key": c.get("CLAUDE_API_KEY") or "", "model": c.get("CLAUDE_MODEL") or "claude-sonnet-5-5",
            "timeout": int(c.get("CLAUDE_TIMEOUT") or 120)}


def ready():
    return bool(config()["key"])


def _ssl_context():
    # the Python that ships with macOS may not know the usual certificate authorities; certifi does
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        return ssl.create_default_context()


def _api_error(status, body):
    try:
        detail = (json.loads(body).get("error") or {}).get("message", "")
    except ValueError:
        detail = ""
    if status == 401:
        return AssistError("The Claude API key was refused. Check ANTHROPIC_API_KEY in your .env file and restart Letter Studio.", 502)
    if status == 403:
        return AssistError(f"This API key isn't allowed to do that. {detail}".strip(), 502)
    if status == 404:
        return AssistError(f"The model “{config()['model']}” isn't available for this key. Set LS_CLAUDE_MODEL to one that is. {detail}".strip(), 502)
    if status == 413:
        return AssistError("The letter is too long to send in one go.", 413)
    if status == 429:
        return AssistError("Too many requests, or the API account has no credit left. Wait a minute, or check the account at console.anthropic.com.", 429)
    if status in (500, 529) or status >= 500:
        return AssistError("Claude is busy right now. Try again in a minute.", 503)
    return AssistError(f"The Claude API answered {status}. {detail}".strip(), 502)


def ask_claude(system: str, user: str, schema: dict, max_tokens: int = 4000) -> dict:
    """One request to the Messages API; the answer is JSON that matches schema."""
    cfg = config()
    if not cfg["key"]:
        raise AssistError("Claude isn't set up yet: add ANTHROPIC_API_KEY to the .env file in the letter-studio folder and restart. See the README.", 503)
    body = {
        "model": cfg["model"],
        "max_tokens": max_tokens,
        "system": system,
        "messages": [{"role": "user", "content": user}],
        "output_config": {"format": {"type": "json_schema", "schema": schema}},
    }
    req = urllib.request.Request(API_URL, data=json.dumps(body).encode("utf-8"), method="POST", headers={
        "x-api-key": cfg["key"], "anthropic-version": API_VERSION, "content-type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=cfg["timeout"], context=_ssl_context()) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        raise _api_error(exc.code, exc.read().decode("utf-8", "replace")) from exc
    except (urllib.error.URLError, socket.timeout, TimeoutError, ssl.SSLError) as exc:
        reason = getattr(exc, "reason", exc)
        if "CERTIFICATE_VERIFY_FAILED" in str(reason):
            raise AssistError("Python couldn't check api.anthropic.com's certificate. Run: pip install certifi, then restart.", 502) from exc
        raise AssistError(f"Couldn't reach the Claude API ({reason}). Check the internet connection or proxy.", 502) from exc
    stop = data.get("stop_reason")
    if stop == "refusal":
        raise AssistError("Claude declined to answer this one.", 422)
    if stop == "max_tokens":
        raise AssistError("Claude's answer was cut off because it was too long. Try with fewer rows or a shorter letter.", 422)
    text = "".join(b.get("text", "") for b in data.get("content", []) if b.get("type") == "text")
    try:
        out = json.loads(text)
    except ValueError as exc:
        log.warning("Claude answer wasn't JSON: %s", text[:500])
        raise AssistError("Claude's answer couldn't be read. Try again.", 502) from exc
    usage = data.get("usage") or {}
    out["_usage"] = {"model": data.get("model", cfg["model"]), "input_tokens": usage.get("input_tokens"), "output_tokens": usage.get("output_tokens")}
    return out


# ---------------------------------------------------------------- what Claude knows about CompUp letters

SYSTEM = """You help the HR / compensation team at CompUp turn client Word letters into CompUp letter templates and check them. The people using you are not programmers: answer in short, plain English, and use tag names exactly.

How CompUp fills letters: a .docx template is filled per employee with Jinja (Python Jinja2 via docxtpl, sandboxed), then LibreOffice makes the PDF.

Tag rules:
- {{ value }} prints a value. {% if … %} … {% elif … %} … {% else %} … {% endif %} shows text for some employees. A logic tag on a line of its own uses trim marks: {%- if … -%} … {%- endif -%}. Quotes inside tags are straight quotes. Names are lower case, case sensitive.
- Standard tags: first_name, last_name, email, mobile, emp_code, joined_on, current_date, gender, organization, organization_address, currency_code, effective_date, ctc, old_ctc, increment_amount, new_base, eligible_pay, variable_pay, variable_payout, variable_payout_percentage, emp_variable_plan_name.
- Performance sheet: employee_schema.<column>, e.g. employee_schema.designation, employee_schema.level, employee_schema.promotion_needed, employee_schema.updated_designation, employee_schema.updated_level.
- Salary components: <component>_current_amount and <component>_old_amount (e.g. basic_current_amount). Factors: <factor>_new_amount.
- Data uploaded in the cycle: custom_schema.<column> where <column> is the heading lower-cased with spaces and special characters turned into _ (e.g. "Merit Hike %" → custom_schema.merit_hike_).
- Uploaded values are text. Compare text with | lower | trim (e.g. {% if custom_schema.promo | lower | trim == "yes" %}). Convert numbers with | float before comparing or calculating. A field used with | float or | int that is missing for an employee stops the whole letter with "is undefined"; | default(0) makes it count as 0.
- Money with Indian commas: {{ x | indian_comma }} (12,34,567); whole numbers: {{ '{:.0f}'.format(x | float) | indian_comma }}. International commas: | int_comma.
- Dates: {{ x | format_date('%d-%m-%Y', '%d %B %Y') }} (input format, output format). Today: {{ currentDatetime('%B %d, %Y') }}.
- & < > inside quotes in a tag are written \\u0026 \\u003c \\u003e.

When you map letter text to data: use the letter's own context (the sentence, the table row label and the column header such as "Last Drawn" vs "Revised") together with the column names and their example values. Old/current/last-drawn values and new/revised values usually come in pairs of columns (e.g. basic1 / basic2, old_ctc / new_ctc); work out which is which from the names and context, and say so in the reason. Prefer a data column that exists over inventing a name. If nothing fits, say so with low confidence.
Never invent employee data. Keep reasons to one sentence."""


def _j(obj):
    return json.dumps(obj, ensure_ascii=False, indent=1)


def _str(v, n=20000):
    return str(v or "")[:n]


TAG_SCHEMA = {
    "type": "object",
    "properties": {
        "suggestions": {"type": "array", "items": {"type": "object", "properties": {
            "id": {"type": "string"},
            "field": {"type": "string", "description": "the data column or CompUp tag name, e.g. custom_schema.basic1"},
            "tag": {"type": "string", "description": "the full tag to write into the letter, e.g. {{ custom_schema.basic1 | indian_comma }}"},
            "confidence": {"type": "string", "enum": ["high", "medium", "low"]},
            "reason": {"type": "string"},
        }, "required": ["id", "field", "tag", "confidence", "reason"], "additionalProperties": False}},
        "notes": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["suggestions", "notes"], "additionalProperties": False,
}

REVIEW_SCHEMA = {
    "type": "object",
    "properties": {
        "summary": {"type": "string"},
        "items": {"type": "array", "items": {"type": "object", "properties": {
            "severity": {"type": "string", "enum": ["fix", "check", "idea"]},
            "title": {"type": "string"},
            "detail": {"type": "string"},
            "quote": {"type": "string", "description": "exact text or tag from the letter where this applies, empty if general"},
            "suggestion": {"type": "string", "description": "the corrected tag or wording, empty if none"},
        }, "required": ["severity", "title", "detail", "quote", "suggestion"], "additionalProperties": False}},
    },
    "required": ["summary", "items"], "additionalProperties": False,
}

CONDITION_SCHEMA = {
    "type": "object",
    "properties": {
        "condition": {"type": "string", "description": "the Jinja expression only, without {% if and %}"},
        "explanation": {"type": "string"},
        "fields": {"type": "array", "items": {"type": "string"}},
        "assumptions": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["condition", "explanation", "fields", "assumptions"], "additionalProperties": False,
}

ANSWER_SCHEMA = {
    "type": "object",
    "properties": {"answer": {"type": "string"}, "tags": {"type": "array", "items": {"type": "string"}}},
    "required": ["answer", "tags"], "additionalProperties": False,
}


def suggest_tags(p: dict) -> dict:
    places = p.get("placeholders") or []
    if not places:
        raise AssistError("There is nothing to suggest tags for.", 400)
    user = (
        f"Letter: {_str(p.get('letter_name'), 200)}\n"
        f"How data columns are written in tags here: {_str(p.get('tag_style'), 300)}\n\n"
        f"Data columns (name, how to write it, type, number of distinct values, examples of category values):\n{_j(p.get('columns') or [])[:60000]}\n\n"
        f"Text in the letter that needs a tag (with where it sits and the tool's own guess):\n{_j(places[:150])[:80000]}\n\n"
        "For every id, give the best field and the full tag to write. Use money formatting (| indian_comma) for amounts, "
        "and keep the format of dates as the letter shows them. In notes, list anything the team should check (e.g. a merge field whose name doesn't match what the letter shows)."
    )
    return ask_claude(SYSTEM, user, TAG_SCHEMA, max_tokens=8000)


def review_template(p: dict) -> dict:
    user = (
        f"Letter: {_str(p.get('letter_name'), 200)}\n"
        f"Employees in the data used for checks: {_str(p.get('employees'), 200)}\n\n"
        f"Data columns:\n{_j(p.get('columns') or [])[:40000]}\n\n"
        f"What the tool's own checks found:\n{_j(p.get('findings') or [])[:20000]}\n\n"
        f"Conditions in the letter and how many employees get each:\n{_j(p.get('blocks') or [])[:20000]}\n\n"
        f"The template, paragraph by paragraph (page: text with tags):\n{_str(p.get('letter'), 90000)}\n\n"
        "Review the template as an experienced CompUp template author. Look for: tags that will print wrong or stop the letter, "
        "conditions that pick the wrong employees, values in the wrong place (e.g. old vs new amounts swapped, a total that doesn't match its parts), "
        "missing formatting, text that should depend on the employee but is typed in, and wording that doesn't fit some employees. "
        "Don't repeat the tool's findings unless you add something. 'fix' = will be wrong, 'check' = probably wrong, 'idea' = an improvement. Quote the exact text so it can be found."
    )
    return ask_claude(SYSTEM, user, REVIEW_SCHEMA, max_tokens=8000)


def write_condition(p: dict) -> dict:
    ask = _str(p.get("request"), 2000).strip()
    if not ask:
        raise AssistError("Describe the condition first, e.g. “promoted employees whose PLI changed”.", 400)
    user = (
        f"Write a Jinja condition for: {ask}\n"
        f"It decides whether this text is shown: {_str(p.get('context'), 1500)}\n"
        f"Current condition (if changing one): {_str(p.get('current'), 1000)}\n\n"
        f"Data columns:\n{_j(p.get('columns') or [])[:50000]}\n\n"
        "Write it the CompUp way so the team's builder can show it: text as  F | string | lower | trim == \"value\"  (values lower case), "
        "lists as  F | string | lower | trim in [\"a\", \"b\"], numbers as  (F | default(0) | string | replace(\",\", \"\") | float) > 5, "
        "empty as  (F | default('', true) | string | trim) == \"\"; join with and / or. Use only columns that exist."
    )
    return ask_claude(SYSTEM, user, CONDITION_SCHEMA, max_tokens=2000)


def answer_question(p: dict) -> dict:
    q = _str(p.get("question"), 3000).strip()
    if not q:
        raise AssistError("Type a question first.", 400)
    user = (
        f"Question: {q}\n\nLetter: {_str(p.get('letter_name'), 200)}\n"
        f"Data columns:\n{_j(p.get('columns') or [])[:40000]}\n\n"
        f"The template, paragraph by paragraph:\n{_str(p.get('letter'), 80000)}\n\n"
        "Answer the question about this template. If you suggest tags, put each full tag in tags."
    )
    return ask_claude(SYSTEM, user, ANSWER_SCHEMA, max_tokens=3000)


TASKS = {"suggest_tags": suggest_tags, "review": review_template, "condition": write_condition, "ask": answer_question}
