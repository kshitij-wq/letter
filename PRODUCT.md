# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

CompUp implementation consultants and client HR / compensation teams, in equal measure. Both use the tool in bursts a few times per compensation cycle (appraisal season), not daily, so a guided flow matters more than raw speed. They know Word letters and their employee data well; most do not know Jinja and should not need to.

## Product Purpose

Letter Tagger turns a client's Word compensation letter (appraisal, revision, promotion) into a CompUp letter template: placeholders become Jinja tags mapped to employee data fields, conditional paragraphs and table rows become if/else blocks, and the result is checked with the same engine CompUp fills letters with (docxtpl). Success: a template that renders correctly for every employee on the first upload to CompUp, with no one hand-editing `{{ }}`.

## Positioning

It checks the template with real Jinja (docxtpl 0.20.2, the engine CompUp uses) and with the client's own employee rows, so problems show up before the letters go out, not after. It works on the client's actual .docx and keeps its formatting.

## Operating Context

- Input: a client .docx (often with highlighted placeholders such as `[Employee Name]`, `<<Designation>>`, `XXXX`, Word merge fields), optionally a CSV/Excel of employee rows or column names.
- Output: a tagged .docx for CompUp, a mapping CSV, and a setup file to reuse next cycle.
- Runs as a Django app (`python run_local.py`) and also as a claude.ai artifact (same page, server features hidden when `/api/health` is absent).

## Capabilities and Constraints

- Detects placeholders, salary tables with empty cells, existing tags; maps them to CompUp tags or CSV columns; money formats and guards.
- Logic tags (if / elif / else / endif), a condition builder that round-trips through `cbParse`, combine-two-versions into if/else.
- Template check (page checks + server validation with docxtpl), employee preview (preview engine), test every employee (server batch when available).
- Undo/redo, autosave in the browser only, setup file, team library (claude.ai only), Claude helpers (server key only).
- No PDF feature, on purpose. No data stored on a server; uploads stay in the browser except for validation requests.
- Never show or send employee rows to Claude; never invent schema keys.

## Brand Commitments

- Name: "CompUp" (brand) and "Letter Tagger" (product). CompUp teal is the primary accent.
- UI copy is plain and short, for HR people, not developers.

## Evidence on Hand

- `tests_ui/fixtures/` holds made-up letters and data (Northwind Appliances, ACME). There are no real client letters, customers or metrics in the repo; none may be invented.

## Product Principles

1. The letter is the work: keep the document at the centre and faithful to Word.
2. Say what is wrong, where, and the one action that fixes it.
3. Never claim success the engine did not confirm; sample values are always labelled as sample.
4. Jinja is available, never required.
5. Nothing leaves the browser that does not have to.

## Accessibility & Inclusion

Inferred (not confirmed): WCAG 2.1 AA contrast and full keyboard use, since it is an enterprise tool used by HR teams.
