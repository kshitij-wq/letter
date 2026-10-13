# Letter Studio — notes for Claude Code

Django app that serves the Letter Tagger page and checks CompUp letter templates with real
Jinja (docxtpl). Users are HR/compensation people preparing CompUp letter templates; keep
UI text plain and short. There is no PDF feature on purpose (removed at the user's request).

## Commands

- Run: `python run_local.py` (checks packages, opens the browser) or `python manage.py runserver` → http://127.0.0.1:8000
- PyCharm run configurations live in `.idea/runConfigurations/`
- Tests: `python manage.py test renderer`
- After editing the page: `python tools/build_frontend.py`, then `python tests_ui/sweep.py` (clicks through the page, fails on any JS error; `--quick` covers only 3 letters, so run the full sweep before merging; `--only conditions tags ...` runs single stages; `SWEEP_TRACE=1` prints what it is doing). The sweep drives the React page (stable selectors: `data-testid` such as `step-<id>`, `seg-<view>`, `step-panel`, `confirm-ok`, `#inspector`, `#paper`). In a container without Playwright's own browser, set `CHROMIUM_PATH`.
- The page is a React app in `frontend/` (Vite, one self-contained file built into `renderer/frontend/index.html`). `python tools/build_frontend.py` builds *that* (needs Node 22; runs `npm ci` when `frontend/node_modules` is missing). Checks: `npm --prefix frontend run typecheck | lint | test`, and `python tests_ui/parity.py` (drives the old page, kept in `tests_ui/legacy/`, and the new one through the same scripted actions over `window.__lt` and fails on any difference in the built .docx, findings, rows, setup JSON, preview and employee test). `tests_ui/react/export.py` and `validate.py` are smaller smoke tests of the same page; CI runs parity, the sweep and both.

## Where things are

- `frontend/src/engine/*.js` — all the business logic of the page, moved verbatim out of the old single file, with no DOM drawing: modules per area (catalog, helpers, state, alias, docx, detect, tables, logic, preview, data, pipeline, checks, fixes, undo, setup, edits, team, claude, conditions, blocks, rows, build, paper, downloads, sample, steps, server, load, platform) plus `events.js` (`notify()` replaces every `render*()`; `on('toast'|'error'|'show'|'reveal'|'flashRow'|'clearSelection'|'tab'|'loaded', fn)` replaces `toast()` and friends) and `actions.js` (the bodies of the old event handlers, taking values as arguments). `engine/index.js` is the public API and publishes `window.__lt`. React reads `state` and re-renders on `subscribe`/`getRev` (`hooks/useEngine.ts`). Pure HTML-string builders for the letter live in `paper.js` (`paperHtml(view)`).
- `frontend/src/ui/*` — the design system (Radix + Tailwind v4 tokens from `styles.css`: Button, IconButton, Dialog + `confirm()`, FieldPicker (cmdk), SegmentedControl, Notice, VirtualList ...). Import from `@/ui`. Colours only through the token names (`bg-panel`, `text-muted`, `border-hairline`, `text-accent` ...) so light and dark both work.
- `frontend/src/features/*` — the interface. `shell/` (Header, StepBar, SidePanel, Inspector, CommandPalette, `registry.ts`), `paper/` (the letter canvas, margin flags, legend, `paperEvents.ts`), `firstrun/`, and one folder per step (`document`, `tags`, `conditions`, `validate`, `export`). Each feature folder has a `register.ts` (auto-loaded by `features/register.ts`) that plugs in with `registerStep`, `registerInspector` (opened by `openInspector(kind, args)`), `registerCommands`, `registerCanvasSlot`, `setPaperHandler` (a click on a placeholder, table cell, condition line or flag) and `setFlagProvider`. UI-only state is the zustand store in `src/store.ts`; the current step and view stay in the engine (`state.tab`, `state.view`). `window.__ltUi` exposes the store and these hooks to browser tests.
- Roomy layout (UI scale in `styles.css`: 13/14/15/17/20px, body 15px, controls 40px, side panel 400px, inspector 420px). Tags & fields: progress header, `tags/NextCard.tsx` ("Next to tag": field picker, Tag it, Skip; success state with Review all), `tags/TagList.tsx` (rows grouped by status, inline "Pick field" on untagged rows), and the rarely used parts folded below as `Section`s with a `summary` line (`useCollapsed`; `openSection(id)` unfolds one from outside). `paper/SelectionToolbar.tsx` is the floating bar next to selected words (`data-testid=sel-toolbar`). The sweep stage `nexttag` covers these.
- Edit letter (SuperDoc, `superdoc@1.47.2`, AGPL-3.0; pinned to 1.x on purpose, 2.x pulls in a proprietary engine): `engine/editor.js` (tag guard `docTags`/`missingTags`, `saveEditor` = export docx -> `loadDocx` -> `importSetup`, `undoEditorChange`, `flushEditor` called by `buildBlob`/`realCheck`/`runBatch`/`downloadSetup`) and `features/editor/` (`EditorView` status + notices, `EditorSurface` the SuperDoc instance, `tagChips.ts` the chip layer). The engine's docx stays the template; a save that loses a tag is blocked until the person restores or keeps it. Test: `python tests_ui/react/editor.py`.
- `tests_ui/legacy/index.html` — the old single-file page, kept only as the reference for `tests_ui/parity.py`. Don't edit it.
- `DESIGN.md` / `.impeccable/design.json` — the design system (tokens, components, rules); `PRODUCT.md` — product record. Use only CSS tokens from `:root` so light and dark both work.
  - `runChecks` / `tagSyntaxProblem` / `locateTags`: the Check tab's findings and where they are
  - `realCheck` / `realBatch`: calls `/api/validate` when the back end is there
  - condition builder: `cbHtml`, `cbExpr`, `cbParse`, `cbEnglish`, `applyParaCondition`
- Letter Assistant (a chat that edits the letter through tools): `renderer/agent_tools.json` is the one tool list (names, schemas, `kind` read/write, `allow_auto`); the server (`assistant.agent_turn`, task `agent`) only validates history and relays it. `engine/agent.js` is the loop (max 8 rounds, argument check against the same schemas, a write becomes a proposal card the person Applies or Rejects) and `engine/agentTools.js` the tools, thin wrappers over engine actions; each write runs as one undo step, is checked after, and is rolled back on any failure. Tools call `flushEditor()` first and `syncEditorSource()` after a change so the SuperDoc view reloads. UI: `features/assistant/`; tests `engine/agent.test.js`, `renderer/tests_agent.py`, `tests_ui/react/assistant.py` (fakes `/api/assist`).
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
