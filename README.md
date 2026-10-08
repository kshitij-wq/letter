# Letter Studio

The Letter Tagger (the page you use on claude.ai) with a small Django back end that checks
templates with **real Jinja** (docxtpl), the engine CompUp fills letters with. It runs on
your own computer. Nothing else to install: no LibreOffice, no database.

## What it does

**Tag a client letter.** Upload the Word letter, pick a tag for every name, amount and date,
and add conditions. Download the tagged `.docx` for CompUp.

**Check a tagged template.** Click *Check a tagged template* (under the letter upload, or in
the Check tab) and upload a template that is already tagged. The Check tab lists every
problem with its tags and conditions, and where it is:

- typing mistakes: a single `=` in a condition, a filter Jinja doesn't know (`| floot`),
  a quote or bracket left open, `{% iff %}`;
- an `if` that is never closed, an `endif` or `else` with no `if` above it, an if that
  opens and closes in different table cells;
- names that aren't in your data file (with "did you mean"), fields used with `| float`
  that some employees don't have, numbers that print as `1234567.0`, `&` inside quotes,
  tags in text boxes.

Each problem has the page and paragraph; click it to jump there. Tags with a problem are
red in the letter. When the page runs here (not on claude.ai), the file is also parsed by
real Jinja, and those findings are marked **Real Jinja**.

**Test every employee.** Load the data file (CSV or Excel) and click *Test every employee*.
The page fills the letter for each row and lists empty values, text where a number is
needed, and so on. Here it then fills every employee again with real Jinja and lists anyone
CompUp couldn't make the letter for.

**Conditions without writing Jinja.** Select paragraphs (or words inside a sentence) and use
*Show only when…*: pick a field, a test (is, is one of, is more than, is empty…) and a
value; values from your data file are offered as buttons. It shows the condition in plain
words, how many employees it is true for, and writes the `if` / `else` / `end if` for you.
*Write it myself* switches to typing the condition.

## Open it in PyCharm

1. Install **Python 3.9 or newer** (python.org). The Python that comes with macOS works.
2. Get the code. In PyCharm: **File → New → Project from Version Control…**, paste
   `https://github.com/kshitij-wq/letter.git`, Clone.
3. PyCharm asks for an interpreter (a yellow bar, or bottom-right "No interpreter"):
   choose **Add New Interpreter → Add Local Interpreter → Virtualenv → New**, OK.
4. Open `requirements.txt` and click **Install requirements** in the bar at the top
   (or in PyCharm's Terminal: `pip install -r requirements.txt`).
5. Top right, pick the run configuration **Run Letter Studio** and press ▶.
   Your browser opens http://127.0.0.1:8000. Stop it with the red ■.

Other run configurations: **Run tests**, **Click-through test (sweep)** and
**Rebuild page from frontend_src**. Works in PyCharm Community and Professional.

Without PyCharm: double-click `start_windows.bat` (Windows) or run `./start_mac_linux.sh`.

## Quick start (terminal)

```bash
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python manage.py runserver         # then open http://127.0.0.1:8000
```

"That port is already in use": stop the other run (red ■ in PyCharm), or
`lsof -ti :8000 | xargs kill -9` (macOS), or use another port: `python manage.py runserver 8080`.

## Updating with git (PyCharm)

- Get the latest: **⌘T** (Git → Pull).
- Send your changes: **⌘K** (Commit) → write a note → **Commit and Push**.

After every push GitHub runs the tests (**Actions** tab on GitHub: green ✓ or red ✗).

## Tests

```bash
python manage.py test renderer          # back end: filters, real-Jinja check, API
pip install -r requirements-dev.txt && python -m playwright install chromium
python tests_ui/sweep.py                # page: every view, tab and button, tagged templates, broken files
python tests_ui/sweep.py --letters my.docx --data my.xlsx   # the same with your own files
```

The sweep fails on any error in the page (a crash, a failed request), so run it after
changing `frontend_src/letter-tagger.html`. GitHub runs both on every push
(`.github/workflows/ci.yml`), on Python 3.9 and 3.12.

The test letters in `tests_ui/fixtures/` are made up. **Don't commit real client letters or
employee data**: keep them in a `private/` folder (ignored by git) or name them `*.local.docx`.

## Settings (environment variables)

| Variable | Default | What it does |
|---|---|---|
| `LS_AUTOESCAPE` | `1` | Escape `&`, `<`, `>` in employee data (guide 11.3) |
| `LS_MAX_UPLOAD_MB` | `25` | Largest letter accepted |
| `DJANGO_DEBUG` | `1` | Set `0` on a shared server |
| `DJANGO_SECRET_KEY` | dev key | Set a real one on a shared server |
| `DJANGO_ALLOWED_HOSTS` | `localhost,127.0.0.1` | Host names allowed to serve the app |
| `TIME_ZONE` | `Asia/Kolkata` | For `currentDatetime()` |

## API

| Endpoint | |
|---|---|
| `GET /api/health` | `{app, validate, autoescape, versions}` |
| `POST /api/validate` | multipart: `template` (.docx), optional `employees` (JSON list of `{label, values}`). Returns `{ok, syntax: [...], variables: [...], employees: {tested, failed: [...]}}`. Each problem has `friendly` (plain words), `part` / `part_label` (body, header…), `para_index`, `line_text` and `tag`. Makes no file. |
| `POST /api/render` | multipart: `template`, `context` (JSON of one employee's values), `format` (`docx` \| `json`). Returns the filled .docx, or `{"text": …}`. Errors: `422 {error, kind, tag, context}`. |

Errors always come back as JSON (`400` bad request, `413` too large, `422` the letter can't
be read or filled, `500` with the details in the terminal).

## How it fits together

```
frontend_src/letter-tagger.html   the page (same source as the claude.ai artifact)
tools/build_frontend.py           wraps it into renderer/frontend/index.html with local libraries
renderer/engine.py                Jinja environment + CompUp filters, validate_docx, render_docx, plain-language errors
renderer/views.py                 /, /api/health, /api/validate, /api/render
renderer/tests.py                 python manage.py test renderer
tests_ui/sweep.py                 click-through test of the page
```

The page notices it is running here (it can reach `/api/health`) and turns on the real-Jinja
check; on claude.ai it doesn't, so one source works in both places.
After changing `frontend_src/letter-tagger.html`, run `python tools/build_frontend.py`.

`renderer/engine.py` holds the filters `indian_comma`, `int_comma`, `format_date` and
`currentDatetime()` as the preview assumes CompUp has them. If CompUp's differ, change
them there (and in `makeEnv` in the page, so the preview agrees).

Templates are read in Jinja's **sandbox**, so an uploaded letter can't reach Python internals.

### Docker (for a shared server later)

```bash
docker build -t letter-studio .
docker run --rm -p 8000:8000 -e DJANGO_SECRET_KEY=change-me letter-studio
```

## What we took from the earlier prototype (Python-Blank)

| Prototype | Here |
|---|---|
| FastAPI + SQLite, upload and count tags, "health score" | Django; the Check tab lists each problem with where it is, and real Jinja checks the file |
| Adds `{% if %}` around a paragraph, `{%tr if %}` marker rows for table rows | Conditions on paragraphs and words (builder), row hiding inside the existing rows |
| Planned: users and roles, template library with versions, tag registry, rules, audit log, Sentry error → fix | Not built yet. Ideas below. |
| Saves every upload in `uploads/` | Nothing is stored; files live in memory for one request |

Next steps that fit the prototype's plan:

1. **Template library** (Django models): client → template → versions, with who saved
   each version and a diff; restore an older one.
2. **Tag registry**: the shared tag list (name, label, default format, source) that feeds
   the tag picker, replacing the claude.ai team library.
3. **Error → fix**: paste a CompUp/Sentry error, find the tag that caused it.
4. **Sign-in and roles** before putting it on a shared server.
