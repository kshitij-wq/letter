---
name: Letter Tagger
description: A notesheet-green office file where the letter sits on paper and every finding is a lettered flag in its margin.
colors:
  ground: "#EEF1EF"
  notesheet: "#F6F8F6"
  panel: "#FFFFFF"
  paper: "#FFFFFF"
  paper-ink: "#1B1B1B"
  paper-line: "#E1E4E2"
  ink: "#17211D"
  muted: "#58665F"
  hairline: "#DCE2DE"
  hairline-soft: "#E9EEEB"
  teal: "#0B6E5F"
  teal-deep: "#095C50"
  teal-wash: "#E0F0EB"
  on-teal: "#FFFFFF"
  tag-ink: "#7A4300"
  tag-wash: "#FFF2D9"
  tag-line: "#EDCB8A"
  highlighter: "#FFF0A3"
  highlighter-ink: "#3A3200"
  flag-red: "#B42318"
  flag-red-wash: "#FCEBE9"
  flag-amber: "#8F5600"
  flag-amber-wash: "#FFF3DC"
  flag-green: "#17784A"
  flag-green-wash: "#E3F3EA"
  flag-blue: "#2F5B86"
  flag-blue-wash: "#E8F0F8"
  flag-indigo: "#4B4FA8"
  flag-indigo-wash: "#ECEDFB"
typography:
  headline:
    fontFamily: "Public Sans, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "18px"
    fontWeight: 600
    lineHeight: 1.3
  title:
    fontFamily: "Public Sans, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.45
  subtitle:
    fontFamily: "Public Sans, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "13.5px"
    fontWeight: 600
    lineHeight: 1.45
  body:
    fontFamily: "Public Sans, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "13.5px"
    fontWeight: 400
    lineHeight: 1.45
  body-small:
    fontFamily: "Public Sans, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "12.5px"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "Public Sans, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    lineHeight: 1.5
    fontFeature: "tnum"
  tag:
    fontFamily: "IBM Plex Mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
    fontSize: "12.5px"
    fontWeight: 400
    lineHeight: 1.55
  letter:
    fontFamily: "Source Serif 4, Georgia, Times New Roman, serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.55
rounded:
  paper: "2px"
  tag: "3px"
  badge: "4px"
  control: "6px"
  panel: "8px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  xxl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.teal}"
    textColor: "{colors.on-teal}"
    rounded: "{rounded.control}"
    typography: "{typography.subtitle}"
    padding: "5px 12px"
    height: "32px"
  button-primary-hover:
    backgroundColor: "{colors.teal-deep}"
    textColor: "{colors.on-teal}"
  button-secondary:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    typography: "{typography.subtitle}"
    padding: "5px 12px"
    height: "32px"
  button-secondary-hover:
    backgroundColor: "{colors.hairline-soft}"
    textColor: "{colors.ink}"
  button-ghost:
    backgroundColor: "{colors.ground}"
    textColor: "{colors.muted}"
    rounded: "{rounded.control}"
    padding: "5px 12px"
    height: "32px"
  button-danger:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.flag-red}"
    rounded: "{rounded.control}"
    padding: "5px 12px"
    height: "32px"
  input:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    typography: "{typography.body}"
    padding: "5px 8px"
    height: "32px"
  chip:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    typography: "{typography.body-small}"
    padding: "0 10px"
    height: "28px"
  chip-selected:
    backgroundColor: "{colors.teal-wash}"
    textColor: "{colors.teal}"
  badge:
    backgroundColor: "{colors.hairline-soft}"
    textColor: "{colors.muted}"
    rounded: "{rounded.badge}"
    typography: "{typography.label}"
    padding: "0 6px"
  badge-error:
    backgroundColor: "{colors.flag-red-wash}"
    textColor: "{colors.flag-red}"
  badge-check:
    backgroundColor: "{colors.flag-amber-wash}"
    textColor: "{colors.flag-amber}"
  badge-note:
    backgroundColor: "{colors.flag-blue-wash}"
    textColor: "{colors.flag-blue}"
  badge-resolved:
    backgroundColor: "{colors.flag-green-wash}"
    textColor: "{colors.flag-green}"
  badge-condition:
    backgroundColor: "{colors.flag-indigo-wash}"
    textColor: "{colors.flag-indigo}"
  notice:
    backgroundColor: "{colors.flag-blue-wash}"
    textColor: "{colors.flag-blue}"
    rounded: "{rounded.control}"
    typography: "{typography.body-small}"
    padding: "8px 12px"
  notice-check:
    backgroundColor: "{colors.flag-amber-wash}"
    textColor: "{colors.ink}"
  notice-error:
    backgroundColor: "{colors.flag-red-wash}"
    textColor: "{colors.ink}"
  step-tab:
    backgroundColor: "{colors.notesheet}"
    textColor: "{colors.muted}"
    typography: "{typography.subtitle}"
    padding: "0 10px"
    height: "44px"
  step-tab-selected:
    textColor: "{colors.ink}"
  step-done-mark:
    backgroundColor: "{colors.flag-green}"
    textColor: "{colors.panel}"
    rounded: "{rounded.pill}"
    size: "20px"
  placeholder-row:
    backgroundColor: "{colors.notesheet}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "6px 8px"
    height: "48px"
  placeholder-row-selected:
    backgroundColor: "{colors.teal-wash}"
    textColor: "{colors.ink}"
  tag-chip:
    backgroundColor: "{colors.tag-wash}"
    textColor: "{colors.tag-ink}"
    rounded: "{rounded.tag}"
    typography: "{typography.tag}"
    padding: "0 3px"
  condition-tag:
    backgroundColor: "{colors.flag-indigo-wash}"
    textColor: "{colors.flag-indigo}"
    rounded: "{rounded.tag}"
    typography: "{typography.tag}"
    padding: "0 5px"
  margin-flag-error:
    backgroundColor: "{colors.flag-red}"
    textColor: "{colors.panel}"
    typography: "{typography.label}"
    width: "20px"
    height: "18px"
  margin-flag-check:
    backgroundColor: "{colors.flag-amber}"
    textColor: "{colors.panel}"
    typography: "{typography.label}"
    width: "20px"
    height: "18px"
  paper:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.paper-ink}"
    rounded: "{rounded.paper}"
    typography: "{typography.letter}"
    padding: "72px 80px"
    width: "816px"
  inspector:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    width: "380px"
---

# Design System: Letter Tagger

## Overview

**Creative North Star: "The Office File"**

The letter is the correspondence, and everything the tool knows about it is a lettered noting in its margin, like flagged pages in a government file. The page is built as a desk: a pale green-grey ground, a slightly lighter notesheet layer for the steps and the current step's panel, and the letter itself on white paper in the middle. The category's usual arrangement, a document wedged between a long settings sidebar and a stack of cards, is refused. The left panel holds only the current step; the right inspector appears only when something is selected; the findings live on the paper.

The mood is quiet, clerical and exact: hairline rules instead of boxes, one calm teal reserved for the action you take, and a small set of flag colours that each mean one thing. It is a tool for HR and compensation people who open it a few times a cycle, so every surface says what is wrong, where, and the one action that fixes it, in short plain sentences.

Dark mode keeps the same world: the desk goes to deep green-black, the notesheet lifts one step, and the paper itself darkens, so the letter never glares against its ground.

**Key Characteristics:**
- Three tonal layers (ground, notesheet, white) separated by 1px hairlines, not shadows.
- Teal #0B6E5F marks the primary action, selection and focus, and nothing else.
- Five flag colours with fixed jobs: red error, amber to-check, indigo condition, blue note, green tagged or resolved.
- Three type voices that never swap: Public Sans for the tool, IBM Plex Mono for tags, Source Serif 4 for the letter.
- Margin flags are lettered pennants (A, B, C) that match the lettered items in the Validate list.
- Status restyles a row; it never reflows it. Resolved items stay visible as Resolved.
- 6px controls, 8px panels, 2px paper.

## Colors

A desaturated green-grey desk with one teal accent and five signal colours; every neutral leans the same cool green hue (about 157-168 in OKLCH) so nothing looks pasted in.

### Primary
- **CompUp Teal** (#0B6E5F): the single accent. Fills the primary button (Download tagged .docx), the selected step's underline, selected rows and chips (as text and 1px border), the focus ring, links, the progress fill, and the caret. Hover is **Deep Teal** (#095C50). Text on teal is **On Teal** white (#FFFFFF). **Teal Wash** (#E0F0EB) is the selected-row, selected-chip, drop-target and text-selection ground.

### Neutral
- **Desk Ground** (#EEF1EF): the page behind the letter, and the track under the segmented view switch's hairlines.
- **Notesheet** (#F6F8F6): the layer that holds the current step: the left panel, the step bar, the view toolbar, inset fields in the inspector, and rule cards in the condition builder.
- **Panel White** (#FFFFFF): the header, the inspector, inputs, buttons and popovers.
- **Office Ink** (#17211D): body text and strong UI text; also the tooltip and toast ground.
- **Filing Grey** (#58665F): secondary text, icons, placeholder text, unselected step labels.
- **Hairline** (#DCE2DE) and **Hairline Soft** (#E9EEEB): every border and divider; soft is for rows inside a list, hairline for control and panel edges. Soft also serves as the hover wash on rows and quiet buttons.
- **Paper** (#FFFFFF) with **Paper Ink** (#1B1B1B) and **Paper Line** (#E1E4E2): the letter's own page, table borders and part outlines. Kept separate from the panel so the letter can be recoloured on its own.
- **Tag Ink** (#7A4300) on **Tag Wash** (#FFF2D9) with **Tag Line** (#EDCB8A); dark #FFC873 on #3A2A0E with #6B4B17: the yellow pill that holds a Jinja tag, so tags stand apart from the letter's own text at a glance.
- **Highlighter** (#FFF0A3) with ink #3A3200: the yellow marker that shows text still needing a tag, as in the client's own Word highlighting.

### Signal flags
- **Flag Red** (#B42318, wash #FCEBE9): errors that stop the template, unresolved or stray condition blocks, empty values.
- **Flag Amber** (#8F5600, wash #FFF3DC): to check, warnings, sample values, picking mode.
- **Flag Indigo** (#4B4FA8, wash #ECEDFB): conditions only: the bracket in the margin, the if/else lines, condition tags and the condition badge.
- **Flag Blue** (#2F5B86, wash #E8F0F8): notes and information, and the default notice.
- **Flag Green** (#17784A, wash #E3F3EA): tagged, filled and resolved: tagged placeholders, completed step marks, a clean check.

Dark theme (set under `prefers-color-scheme` and `data-theme="dark"`): ground #0F1513, panel #161E1B, notesheet #1B2420, ink #E3ECE8, muted #9AABA4, hairline #2A3632, soft #212B27; teal lifts to #4CC2A6 (hover #6BD3BA, text on it #06241D, wash #163A32); paper #1C2421 with ink #E6EAE8; flags lighten to red #FF8A7E, amber #F2B55C, green #5ED39A, blue #9DB8D8, indigo #A9ACF5 on deep washes.

### Named Rules
**The Earned Teal Rule.** Teal means "this is what you do" or "this is what you have selected". It never colours a status, a decoration or a heading. If something is teal, clicking it moves the work forward.

**The One Job Per Flag Rule.** Red, amber, indigo, blue and green each keep one meaning on every surface. A condition is never amber; a note is never red; a success is never teal.

**The Notesheet Layering Rule.** Depth between regions comes from the ground, notesheet and white steps plus a hairline, in that order from the edge of the screen inward.

## Typography

**UI Font:** Public Sans (with system-ui, -apple-system, Segoe UI, sans-serif), weights 400, 500, 600, 700
**Tag Font:** IBM Plex Mono (with ui-monospace, SFMono-Regular, Menlo, Consolas), weights 400, 500
**Letter Font:** Source Serif 4 (with Georgia, Times New Roman, serif), optical size 8-60, weights 400, 600

**Character:** A plain humanist sans for the tool, a typewriter-flavoured mono for anything that is code, and a bookish serif so the letter reads as correspondence rather than data. The three never trade jobs, which lets a reader tell the document, the machinery and the instructions apart at a glance.

### Hierarchy
- **Headline** (600, 18px, 1.3): the first-run heading only, centred and balanced.
- **Title** (600, 15px, 1.45): the product name "Letter Tagger" in the header, dialog titles, the "all clear" statement in the issue inspector, drop-zone titles.
- **Subtitle** (600, 13.5px, 1.45): panel block heads, inspector section heads, step labels, buttons.
- **Body** (400, 13.5px, 1.45): all running UI text, inputs, list items. Panel copy stays near 40-60 characters per line because the side panel is 380px.
- **Body Small** (400, 12.5px, 1.45; also 11.5px for metadata): hints, counts, row summaries, notices, chips.
- **Label** (600, 11px, 1.5, tabular figures): badge text, count pills, flag letters. Numbers always use tabular figures.
- **Tag** (400, 12.5px, 1.55 in the inspector; 12px or 0.82em inline; 11.5px in condition lines): every Jinja tag, field name and expression.
- **Letter** (400, 15px, 1.55): the paper, and the "text in the letter" quote and value preview in the inspector (16px and 15px).

### Named Rules
**The Three Voices Rule.** Sans is the tool, mono is a tag, serif is the letter. A tag in a sentence is set in mono; a quoted line from the letter is set in serif; never the reverse.

**The Sentence Case Rule.** Headings, buttons and labels are sentence case at weight 600. Emphasis comes from weight and ink, not capitals or tracking.

## Layout

An app frame that does not scroll as a page on wide screens: each column scrolls on its own. A 52px header and a 44px step bar sit on top; below them three columns: the current step (380px, resizable and collapsible, on the notesheet layer), the letter (fluid, on the desk ground, with a 48px view toolbar), and the inspector (380px, only present when a tag, condition or issue is selected). The paper is centred, max 816px wide (a Letter page), with 80px side padding and 72px top and bottom padding, narrowing to 56px under 1500px and 20px by 28px on phones. Gutters around the paper are 24px (16px on phones). Spacing rhythm is a 4px base: 4, 8, 12, 16, 24, 32. Panel blocks pad 16px and separate with a soft hairline rather than cards; list rows are 48px tall with 6px 8px padding.

The step bar is a numbered sequence (Document, Tags & fields, Conditions, Validate, Preview & export) connected by 20px hairlines, each with a count or a check mark. Responsive behaviour: at 1280px and below the inspector floats over the right edge as a drawer; at 980px and below the page scrolls normally, the current step becomes a 88vw drawer on the left with a scrim, and the view toolbar sticks under the step bar; at 600px the header drops the company name, file name and save state; at 440px the mapping CSV button gives way; at 380px Download becomes icon-only. Touch targets stay 28-32px minimum.

## Elevation & Depth

Flat and hairline-built. Regions are told apart by tonal layers and 1px borders; at rest nothing in the tool has a shadow except the paper, which sits on the desk with a faint two-part lift. Floating things (popovers, dialogs, the legend popover, toast, and the inspector or step drawer when they overlay the page) take one deeper soft shadow. The active segment in the view switch carries a 1px hairline-weight lift so it reads as a raised key.

### Shadow Vocabulary
- **Paper lift** (`box-shadow: 0 1px 2px rgb(23 33 29 / .06), 0 6px 24px rgb(23 33 29 / .08)`): the letter on its desk. Dark theme uses 0 1px 2px rgb(0 0 0 / .35), 0 6px 24px rgb(0 0 0 / .35).
- **Pop** (`box-shadow: 0 8px 28px rgb(23 33 29 / .16)`): anything floating over the page.
- **Key lift** (`box-shadow: 0 1px 2px rgb(23 33 29 / .14)`): the selected segment only.

### Named Rules
**The Hairline First Rule.** Separate with a 1px rule or a tone change before reaching for a shadow. A panel, row or card never gets one.

**The Paper Is Lifted Rule.** The letter is the only resting surface that casts a shadow; anything else that casts one is floating above it.

## Shapes

Small, even radii and straight rules. Controls (buttons, inputs, chips, rows, notices) are 6px; panels, file rows, popovers and dialogs are 8px; badges 4px; inline tag pills 3px; the paper just 2px so it reads as a sheet, not a card. Count pills and step marks are fully round. The one signature silhouette is the pennant flag: a 20 by 18px rectangle with its right edge cut to a point (a 76% notch), carrying a bold letter. Icons are authored 16px outline glyphs at 1.5px stroke with round caps and joins, inheriting text colour; 12 to 14px inside badges and chips, 24 to 28px in empty states.

### Named Rules
**The Pennant Rule.** A lettered pennant is the only way a finding is marked on the paper. Do not invent other marker shapes for issues.

## Components

Quiet and legible: buttons and chips are outlined, status is carried by tint and a small mark, and nothing moves except short tints and the 1.2 second flash that shows where a click landed.

### Buttons
- **Shape:** 6px corners, 32px high (28px small, 32px square for icon-only), 5px 12px padding, weight 600, 6px gap to an icon.
- **Primary:** Teal fill with white text and a matching 1px border; one per view (Download tagged .docx). Hover goes to Deep Teal.
- **Secondary (default):** Panel white with a hairline border and ink text. Hover tints to Hairline Soft and darkens the border to Filing Grey.
- **Ghost:** Transparent with muted text, ink and a soft wash on hover; for undo/redo and quiet tools.
- **Danger:** Red text and red border on white; hover fills with the red wash.
- **Press and busy:** 0.5px downward nudge on press; a 12px spinner replaces the icon while busy. Disabled drops to 45% opacity.
- **Focus:** a 2px teal outline at 2px offset on every focusable element (inside fields it is inset).

### Chips and filters
- **Style:** 28px high, 6px corners, white with a hairline border and 12.5px text at weight 500; an optional count in muted semibold.
- **State:** Selected turns Teal Wash with teal text and a teal border. Pressed toggles in the validate summary go dashed and muted when switched off.

### Badges and notices
- **Badge:** 11px semibold, 4px corners, 0 6px padding, tint plus matching ink from the flag set (Fix and Error red, Check amber, Note blue, Tagged and Resolved green, Condition indigo, plain grey default). Count pills on step tabs are fully round.
- **Notice:** An inline strip, 6px corners, 8px 12px padding, 12.5px text, no border. Blue by default; amber and red variants keep ink text and tint only the icon and ground.

### Inputs / Fields
- **Style:** 32px high, 1px hairline border, 6px corners, white ground, 5px 8px padding; selects take a drawn 16px chevron; text areas start at 60px.
- **Focus:** the 2px teal outline, inset by one pixel, with the border turning teal.
- **Error / Disabled:** the Jinja editor turns its border red when invalid; disabled fields drop to 55% opacity.
- **Combobox:** a field list in an 8px-radius popover with sticky group heads, 30px options, and a mono code on the right in muted type.

### Navigation (step bar)
- **Style:** 44px notesheet strip under the header. Each step is a 20px round mark (number, or a green check when done), a 13.5px semibold label and an optional count pill (amber for to-do, solid red for errors).
- **States:** Unselected is Filing Grey; hover and selected go to ink; selected also gets a 2px teal bar under the label. Steps are joined by 20px hairlines. On phones the list scrolls sideways and the joins disappear.

### Placeholder rows (list)
- **Style:** 48px grid of a 24px status mark, the found text and field summary, a right-aligned count, and a chevron. Status is a mark tint only (green tagged, amber to check, yellow needs a tag, grey otherwise) so the row never changes size.
- **State:** hover washes Hairline Soft; selected is Teal Wash with a 1px teal inset ring; a 1.2 second teal wash flash marks a row you were just sent to.

### Inspector
- **Style:** a 380px white column with a 48px head (title, close), hairline separators, 16px section padding and 16px gaps. It keeps the inventory context: the quote from the letter, then mapping, format, live preview of the real value and the written tag, with a sticky foot of Include, previous/next and a primary Done.
- **Behaviour:** appears only on selection. At 1280px and below it overlays from the right with the Pop shadow.

### Tag chips and placeholders on the paper (signature)
Placeholders are marked as the client's own text, still readable. Needs a tag is the Highlighter yellow; tagged is Flag Green wash with a 2px green underline inset; to check is amber wash with an amber underline. Inserted Jinja is a mono pill (Tag Ink on Tag Wash, 3px corners, 1px Tag Line border) at 0.82em. A filled value is underlined with a 1px green line, a sample value with a 2px dotted grey line, and a missing value is a dashed red mono pill.

### Condition brackets (signature)
A condition is shown as a bracket, not a box. Paragraphs inside an if-block get a 2px indigo bar in the paper's left margin, set 16px plus 6px per nesting level out; an else part uses the same bar dashed; an unclosed block uses a longer red dash. The if, elif, else and endif lines sit between paragraphs at 12px UI size: an indigo-wash mono tag, a short plain-English reading in muted text, and a 1px paper-line rule running to the edge; hover tints indigo wash, and an error turns the tag red.

### Margin flags (signature)
Each finding on the Check view is a pennant in the paper's left margin level with its paragraph: 20 by 18px (16px on phones), red for an error, amber for a warning, white bold letter A, B, C in order. The same letter heads the matching item in the Validate list. Hover or focus outlines the paragraph in the flag colour; the open flag gets a 2px ink ring. When fixed, the flag goes quiet grey and the item moves to a Resolved group that stays visible. More flags than the margin fits stack downward.

### Paper
The letter is white, 2px corners, with the Paper lift shadow, set in Source Serif 4. Letter parts such as header and footer are dashed boxes; tables keep the letter's own 1px paper-line borders; a page break is a full-bleed desk-coloured strip with the page number. Hovering a paragraph washes it; selecting one gives it a Teal Wash ground and a 1px teal outline.

### Motion
Colour, background and border changes take 150ms ease; drawers slide in 200ms; tooltips wait 150ms; the where-you-landed flash fades a teal wash over 1.2 seconds. Spinners are 0.7 to 0.8 seconds. All of it drops to a near-zero duration under `prefers-reduced-motion`.

## Do's and Don'ts

### Do:
- **Do** keep the letter in the middle and on white (or the dark paper), set in Source Serif 4, with the tool around it on the notesheet and ground layers.
- **Do** mark every finding on the paper as a lettered pennant and give the matching Validate item the same letter.
- **Do** let status change colour and mark only: a row, step or flag keeps its size and position when its status changes.
- **Do** keep resolved items on screen, labelled Resolved, in a collapsible group.
- **Do** use teal for the one primary action, selection and focus; use the flag colours only for their one job each.
- **Do** separate regions with a 1px Hairline or a tone change, with 6px controls and 8px panels.
- **Do** write tags in IBM Plex Mono at their size and quotes from the letter in Source Serif 4.
- **Do** label sample values as sample (dotted underline, amber "Sample" badge) and never style them like real data.
- **Do** keep copy plain and short, in sentence case, saying what is wrong, where, and the one fix.

### Don't:
- **Don't** put the letter in a card inside a stack of cards or beside a long settings sidebar; the current step is a single panel and the inspector appears only on demand.
- **Don't** colour a status, heading or decoration teal.
- **Don't** give panels, rows, cards or buttons a resting shadow; only the paper has one, and floating layers take the Pop shadow.
- **Don't** add small uppercase, letter-spaced labels above headings; section titles are sentence-case semibold.
- **Don't** put a coloured stripe on a card, row or notice; the only stripe in the system is the condition bracket in the letter's margin.
- **Don't** mark issues with any shape other than the lettered pennant, or use glyph characters in place of the authored 16px stroke icons.
- **Don't** swap the three type voices: no serif in controls, no sans or mono for the letter body.
- **Don't** make elements vanish when they are done; mark them done.
