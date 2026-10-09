# Letter Studio — notes for Claude Code

Django app that serves the Letter Tagger page and checks CompUp letter templates with real
Jinja (docxtpl). Users are HR/compensation people preparing CompUp letter templates; keep
UI text plain and short. There is no PDF feature on purpose (removed at the user's request).

## Commands

- Run: `python run_local.py` (checks packages, opens the browser) or `python manage.py runserver` → http://127.0.0.1:8000
- PyCharm run configurations live in `.idea/runConfigurations/`
- Tests: `python manage.py test renderer`
- After editing the page: `python tools/build_frontend.py`, then `python tests_ui/sweep.py` (clicks through the page, fails on any JS error)

## Where things are

- `frontend_src/letter-tagger.html` — source of the page (also published as a claude.ai artifact). One file: CSS, HTML, JS.
  - `runChecks` / `tagSyntaxProblem` / `locateTags`: the Check tab's findings and where they are
  - `realCheck` / `realBatch`: calls `/api/validate` when the back end is there
  - condition builder: `cbHtml`, `cbExpr`, `cbParse`, `cbEnglish`, `applyParaCondition`
- `renderer/frontend/index.html` — generated; don't edit by hand.
- `renderer/engine.py` — Jinja environment, CompUp filters, `validate_docx`, `render_docx`, plain-language errors.
- `renderer/views.py` — `/`, `/api/health`, `/api/validate`, `/api/assist`, `/api/render`.
- `renderer/assistant.py` — Claude helpers (`suggest_tags`, `review`, `condition`, `ask`): system prompt with the CompUp tag rules, JSON-schema answers via `output_config.format`, plain-language API errors. Key from `ANTHROPIC_API_KEY` (`.env`), model `LS_CLAUDE_MODEL`.

## Rules

- Never commit real client letters or employee data; test files in `tests_ui/fixtures/` are made up.
- `index.html` is full of `{{ }}` / `{% %}` examples: serve it as a file (`views.index`), never through Django templates.
- Keep the filters in `engine.py` and the preview filters in the page (`makeEnv`) in step.
- Keep the page's own syntax checks (`tagSyntaxProblem`) worded like `_friendly` in `engine.py`.
- Conditions the builder writes must stay readable by `cbParse` (round trip) and work in both the preview engine and Jinja.
- Render user templates only with `SandboxedEnvironment`.
- Don't store uploaded letters or employee data on disk.
- Claude gets the letter text, tags, column names and values of few-category columns only (`columnsForClaude`); never employee rows, names or amounts. The API key never goes to the browser.
- Tests must not call the real API: mock `renderer.assistant.urllib.request.urlopen`; the sweep fakes `/api/assist`.
- The page must keep working on claude.ai: server features stay behind the `/api/health` probe (`probeServer`, only when `window.claude` is absent).
