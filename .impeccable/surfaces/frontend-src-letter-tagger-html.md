---
version: 1
slug: "frontend-src-letter-tagger-html"
primary_target: "frontend_src/letter-tagger.html"
related_targets: []
---

## Scope

Letter Tagger workspace (frontend_src/letter-tagger.html), the whole page. Visitor mode: Operate. Users: CompUp consultants and client HR/comp teams, a few times per cycle. Job: turn a client .docx into a CompUp template (tags, conditions), validate it with real Jinja and employee data, export the tagged .docx.

Must stay: every feature, every element id the JS and tests_ui/sweep.py use, docxtpl/Jinja behaviour, export formats, undo/redo, claude.ai compatibility.

## Direction contract

THESIS: The letter is the correspondence; everything the tool knows about it is a numbered noting in the margin, like an office file with flagged pages. The page refuses the category's default arrangement, where the document is wedged between a long settings sidebar and a stack of cards.

OWN-WORLD: Notesheet green-grey neutrals (ground #EEF1EF, notesheet layer #F6F8F6, white paper), ink #17211D, CompUp teal #0B6E5F only for primary action, selection and tagged state. Flag colours do the jobs: red error, amber check, indigo condition, blue note, green resolved. Public Sans for UI, IBM Plex Mono for tags only, Source Serif 4 for the letter. 6px controls, 8px panels, 2px paper. Hairline borders; one soft shadow, on the paper only. Authored 16px stroke icons.

STORY: The user uploads the letter, sees every placeholder flagged on the page, maps each one to a field in the inspector, adds conditions by clicking paragraphs, follows the lettered flags until Validate is clean, checks a real employee, then downloads.

FIRST VIEWPORT: A 48px header (CompUp, Letter Tagger, file name, local-save status, undo/redo, Export mapping CSV, primary Download tagged .docx). Below it, a 44px step bar: Document, Tags & Fields, Conditions, Validate, Preview & Export, each with a real count or a check mark. The left panel (360px, collapsible) holds the current step. The centre is the paper on the ground with a slim toolbar (view switch, legend). The right inspector (380px) opens only when a tag, condition or issue is selected. Margin flags A, B, C… sit in the paper's left margin.

FORM: Candidate 5 of 7 (office file with notesheet and page flags), seed b452dcbf. Raises: split-flap (status restyles a row, never reflows it); botanical folio (all three views share paper scale and scroll position); transit map (the inspector keeps the inventory context, back to list); ticket wallet (resolved items stay visible as Resolved, never vanish); star atlas (flags have an index with matching letters).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
