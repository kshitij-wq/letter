# Letter Studio — notes for Claude Code

Django app that serves the Letter Tagger page and fills CompUp letter templates with real
Jinja (docxtpl) and LibreOffice. Users are HR/compensation people preparing CompUp letter
templates; keep UI text plain and short.

## Commands

- Run: `python run_local.py` (checks packages and LibreOffice, opens the browser) or `python manage.py runserver` → http://127.0.0.1:8000
- PyCharm run configurations live in `.idea/runConfigurations/`
- Tests: `python manage.py test renderer` (the PDF test is skipped when LibreOffice is missing)
- After editing the page: `python tools/build_frontend.py`, then `python tests_ui/sweep.py` (clicks through the page, fails on any JS error)

## Where things are

- `frontend_src/letter-tagger.html` — source of the page (also published as a claude.ai artifact). One file: CSS, HTML, JS.
- `renderer/frontend/index.html` — generated; don't edit by hand.
- `renderer/engine.py` — Jinja environment, CompUp filters, docxtpl render, error messages.
- `renderer/pdf.py` — LibreOffice conversion and font list.
- `renderer/views.py` — `/`, `/api/health`, `/api/render`.

## Rules

- Never commit real client letters or employee data; test files in `tests_ui/fixtures/` are made up.
- `index.html` is full of `{{ }}` / `{% %}` examples: serve it as a file (`views.index`), never through Django templates.
- Keep the filters in `engine.py` and the preview filters in the page (`makeEnv`) in step.
- Render user templates only with `SandboxedEnvironment`.
- Don't store uploaded letters or employee data on disk beyond the request (temp dirs only).
- One LibreOffice profile per conversion (`-env:UserInstallation`), bounded by `LS_PDF_PARALLEL`.
- The page must keep working on claude.ai: server features stay behind the `/api/health` probe (`probeServer`, only when `window.claude` is absent).
