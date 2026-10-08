# Letter Studio

The Letter Tagger (the page you use on claude.ai) with a Django back end that fills
letters with **real Jinja** (docxtpl) and turns them into **PDF with LibreOffice**, the
same way CompUp produces letters. It runs on your own computer.

What the back end adds to the Letter Tagger:

- **Make the PDF** for the employee you're previewing (Check tab → *Real render and PDF*,
  or *Real PDF* next to the employee picker). Shows the page count.
- **Filled .docx** for that employee, to open in Word or send for sign-off.
- **Real Jinja errors**: if the letter can't be filled (a missing field used with
  `| float`, a typing mistake in a tag), you get the message and the text around it.
- **Font check**: lists the fonts the letter uses and whether LibreOffice on this computer
  has them, or a look-alike with the same letter widths (Calibri → Carlito, Arial →
  Liberation Sans…). A missing font such as Aptos makes lines and pages shift.

Everything else (tagging, logic, tables, preview, test every employee, Excel files,
setups) is the same page as on claude.ai. The team library needs claude.ai, so it is off here.

## Open it in PyCharm

1. Install **Python 3.9 or newer** (python.org) and **LibreOffice** (libreoffice.org/download).
2. Get the code. In PyCharm: **File → New → Project from Version Control…**, paste
   `https://github.com/kshitij-wq/letter.git`, Clone. (Or unzip `letter-studio.zip` and use **File → Open…**.)
3. PyCharm asks for an interpreter (a yellow bar, or bottom-right "No interpreter"):
   choose **Add New Interpreter → Add Local Interpreter → Virtualenv → New**, location
   `letter-studio/.venv`, base Python 3.9+, OK.
4. Open `requirements.txt` and click **Install requirements** in the bar at the top
   (or in PyCharm's Terminal: `pip install -r requirements.txt`).
5. Top right, pick the run configuration **Run Letter Studio** and press ▶.
   Your browser opens http://127.0.0.1:8000. Stop it with the red ■.

Other run configurations included: **Run tests**, **Click-through test (sweep)** and
**Rebuild page from frontend_src**.
Works in PyCharm Community and Professional.

Without PyCharm: double-click `start_windows.bat` (Windows) or run `./start_mac_linux.sh`.

## Quick start (terminal)

You need **Python 3.9+** and **LibreOffice**.

1. Install LibreOffice: <https://www.libreoffice.org/download/> (Windows / macOS), or
   `sudo apt install libreoffice-writer fonts-crosextra-carlito fonts-crosextra-caladea fonts-liberation2` (Ubuntu).
2. In this folder:

   ```bash
   python -m venv .venv
   # Windows:  .venv\Scripts\activate
   # macOS/Linux:  source .venv/bin/activate
   pip install -r requirements.txt
   python manage.py runserver
   ```

3. Open <http://127.0.0.1:8000>.

If the *Real render and PDF* box says LibreOffice wasn't found, set its path and restart:

```bash
# Windows (PowerShell)
$env:SOFFICE_PATH = "C:\Program Files\LibreOffice\program\soffice.exe"
# macOS
export SOFFICE_PATH=/Applications/LibreOffice.app/Contents/MacOS/soffice
```

### Docker

```bash
docker build -t letter-studio .
docker run --rm -p 8000:8000 letter-studio
```

The image includes LibreOffice and the Carlito, Caladea and Liberation fonts. Add any other
fonts your clients use (and that CompUp's server has) to match its PDFs.

## Tests

```bash
python manage.py test renderer          # back end: filters, rendering, API, PDF (19 tests)
pip install -r requirements-dev.txt && python -m playwright install chromium
python tests_ui/sweep.py                # page: loads every test letter in every view, clicks every button
python tests_ui/sweep.py --letters my.docx --data my.xlsx   # the same with your own files
```

The sweep fails on any error in the page (a crash, a failed request), so run it after
changing `frontend_src/letter-tagger.html`. GitHub runs both on every push
(`.github/workflows/ci.yml`), on Python 3.9 and 3.12, with LibreOffice.

The test letters in `tests_ui/fixtures/` are made up. **Don't commit real client letters or
employee data**: keep them in a `private/` folder (ignored by git) or name them `*.local.docx`.

## Settings (environment variables)

| Variable | Default | What it does |
|---|---|---|
| `SOFFICE_PATH` | searched | Path to LibreOffice's `soffice` |
| `LS_PDF_PARALLEL` | `2` | PDFs converted at the same time |
| `LS_PDF_TIMEOUT` | `120` | Seconds before a conversion is stopped |
| `LS_AUTOESCAPE` | `1` | Escape `&`, `<`, `>` in employee data (guide 11.3) |
| `LS_MAX_UPLOAD_MB` | `25` | Largest letter accepted |
| `DJANGO_DEBUG` | `1` | Set `0` on a shared server |
| `DJANGO_SECRET_KEY` | dev key | Set a real one on a shared server |
| `DJANGO_ALLOWED_HOSTS` | `localhost,127.0.0.1` | Host names allowed to serve the app |
| `TIME_ZONE` | `Asia/Kolkata` | For `currentDatetime()` |

## API

| Endpoint | |
|---|---|
| `GET /api/health` | `{app, pdf, libreoffice, fonts, autoescape, system}` |
| `POST /api/render` | multipart: `template` (.docx), `context` (JSON of one employee's values), `format` (`pdf` \| `docx` \| `json`), `name`. Returns the file, or `{"text": …}` for `json`. Errors: `422 {error, kind, tag, context}`; LibreOffice problems `503`. |

The page sends the tagged .docx it builds plus the same values the preview uses, so the
PDF matches what you see in *Employee preview*.

## How it fits together

```
frontend_src/letter-tagger.html   the page (same source as the claude.ai artifact)
tools/build_frontend.py           wraps it into renderer/frontend/index.html with local libraries
renderer/engine.py                Jinja environment + CompUp filters, docxtpl rendering, friendly errors
renderer/pdf.py                   LibreOffice conversion (own profile per run, timeout, parallel limit), font list
renderer/views.py                 /, /api/health, /api/render
renderer/tests.py                 python manage.py test renderer
```

The page notices it is running here (it can reach `/api/health`) and turns on the
server features; on claude.ai it doesn't, so one source works in both places.
After changing `frontend_src/letter-tagger.html`, run `python tools/build_frontend.py`.

`renderer/engine.py` holds the filters `indian_comma`, `int_comma`, `format_date` and
`currentDatetime()` as the preview assumes CompUp has them. If CompUp's differ, change
them there (and in `makeEnv` in the page, so the quick preview agrees).

Templates are filled in Jinja's **sandbox**, so an uploaded letter can't reach Python
internals.

## What we took from the earlier prototype (Python-Blank)

| Prototype | Here |
|---|---|
| FastAPI + SQLite, upload and count tags, "health score" | Django; checks are the Letter Tagger's (open ifs, names not in the data, float `.0`, rows hidden by the wrong field…) |
| Adds `{% if %}` around a paragraph, `{%tr if %}` marker rows for table rows | Logic tags anywhere, row hiding inside the existing rows; `{%tr %}` support is a good next step if CompUp's engine is docxtpl |
| Planned: users and roles, template library with versions, tag registry, rules, audit log, Sentry error → fix | Not built yet. Ideas below. |
| Saves every upload in `uploads/` | Nothing is stored; files live in memory for one request |

Next steps that fit the prototype's plan:

1. **Template library** (Django models): client → template → versions, with who saved
   each version and a diff; restore an older one.
2. **Tag registry**: the shared tag list (name, label, default format, source) that feeds
   the tag picker, replacing the claude.ai team library.
3. **Batch PDFs**: PDFs for every employee in the data file, as a zip.
4. **Error → fix**: paste a CompUp/Sentry error, find the tag that caused it.
5. **Sign-in and roles** before putting it on a shared server.
