"""Click through the whole Letter Studio page (the React app) and fail on any JavaScript error or broken expectation.

    python tests_ui/sweep.py                       # starts its own server on a free port
    python tests_ui/sweep.py --url http://127.0.0.1:8000/
    python tests_ui/sweep.py --letters my.docx --data my.xlsx --quick

Needs:  pip install playwright  and  python -m playwright install chromium   (CHROMIUM_PATH points at a browser Playwright
doesn't manage itself).  The page must be built first: python tools/build_frontend.py

What it does, in order:
  * the page with no letter: the getting-started screen, bad files give a message, employee data can come first
  * the sample letter, then every letter fixture in every view (client letter, tagged template, employee preview) and every
    step: loads the data files, clicks every visible, enabled button / menu item / switch in the step panel, the inspector,
    the preview bar and the header, selects words and paragraphs in the letter with the mouse, moves between employees,
    undo / redo, and checks that no panel scrolls sideways
  * the Assistant panel with a faked agent (every control; one proposed change applied and undone)
  * the Conditions step end to end (paragraph condition with Builder and Jinja, otherwise text, change a condition, close an
    open block, text by value, a condition inside a sentence, insert a tag here, advanced single tags, place unplaced tags,
    combine two versions, combine several versions) and the click-selects-a-word rules of every step
  * downloads (the .docx, mapping CSV, setup file, CSV template), the setup file round trip, the replace-letter window
  * tagged templates (Check a tagged template), margin flags, one-click fixes, the export checklist
  * a Word mail-merge letter with an employee export, with the Claude helpers (a faked /api/assist)
  * the Letter Studio back end missing (claude.ai without it) and the team library with a fake window.claude
  * bad letters and bad data files, a phone-width screen
Any page error, console error, failed /api request or failed expectation is printed with what was being done at the time.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
import sys
import tempfile
import traceback
import zipfile
from pathlib import Path

from playwright.async_api import async_playwright

from common import launch, start_django

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
FIX = HERE / "fixtures"
LETTERS = ["letterA.docx", "with_header.docx", "northwind.docx", "acme_tagged.docx", "oldtemplate.docx", "letterB.docx"]
TAGGED = ["broken_tagged.docx", "tagged_missing_field.docx", "conditions_tagged.docx"]   # loaded through "Check a tagged template"
DATA = ["emps.csv", "emps.xlsx"]
BAD_LETTERS = ["bad_not_a_docx.docx", "bad_no_body.docx", "zero_bytes.docx"]
BAD_DATA = ["bad_empty.csv", "bad_header_only.csv", "bad.xlsx"]
VIEWS = ["edit", "source", "tagged", "filled"]
TABS = ["doc", "tags", "logic", "check", "export"]
PANEL = "[data-testid=step-panel]"
INSPECTOR = "#inspector"
# Buttons that would hide the panels the sweep clicks in
SKIP_LABELS = {"Hide panel", "Show panel", "Close the assistant"}
IGNORE = ["favicon.ico", "fonts.googleapis", "fonts.gstatic", "ERR_ABORTED"]
MAILMERGE = ("ACME Letter - MHPromotion.docx", "employees_export.csv")   # Word merge fields + an export with a Letter Template column
CLICKABLE = "button, summary, [role=button], [role=menuitem], [role=menuitemradio], [role=menuitemcheckbox], [role=switch], [role=checkbox], [role=combobox]"


async def fake_claude(page):
    """Stand in for the Claude API so the Claude buttons can be clicked without a key."""
    async def health(route):
        resp = await route.fetch()
        data = await resp.json()
        data["assistant"] = {"ready": True, "model": "fake"}
        await route.fulfill(json=data)

    async def assist(route):
        body = json.loads(route.request.post_data or "{}")
        task, pl = body.get("task"), body.get("payload") or {}
        if task == "suggest_tags":
            out = {"suggestions": [{"id": x["id"], "field": "custom_schema.basic1", "tag": "{{ custom_schema.basic1 | indian_comma }}",
                                    "confidence": ["high", "medium", "low"][k % 3], "reason": "fake"} for k, x in enumerate(pl.get("placeholders", [])[:5])],
                   "notes": ["fake note"]}
        elif task == "review":
            out = {"summary": "fake review", "items": [{"severity": "fix", "title": "t", "detail": "d", "quote": "Dear", "suggestion": "{{ first_name }}"}]}
        elif task == "condition":
            out = {"condition": 'custom_schema.promo | string | lower | trim == "yes"', "explanation": "fake", "fields": ["custom_schema.promo"], "assumptions": []}
        elif task == "agent":   # the Assistant: "propose" asks for one tag change, anything else looks at the tags and answers
            last = (pl.get("messages") or [{"content": []}])[-1]["content"]
            if any(b.get("type") == "tool_result" for b in last):
                out = {"content": [{"type": "text", "text": "fake reply"}], "stop_reason": "end_turn"}
            elif any(b.get("text", "").startswith("propose") for b in last):
                row = ((pl.get("context") or {}).get("tags") or {}).get("open") or [{}]
                out = {"content": [{"type": "tool_use", "id": "toolu_sweep", "name": "tag_text", "input": {"row_id": row[0].get("row_id", "none"), "field": "emp_code"}}], "stop_reason": "tool_use"}
            else:
                out = {"content": [{"type": "tool_use", "id": "toolu_sweep", "name": "get_tags", "input": {"status": "need"}}], "stop_reason": "tool_use"}
        else:
            out = {"answer": "fake answer", "tags": ["{{ first_name }}"]}
        await route.fulfill(json=out)
    await page.route("**/api/health", health)
    await page.route("**/api/assist", assist)


# A fake claude.ai host: window.claude with a shared database (the team library) and downloads
INIT_CLAUDE = """
(() => {
  const store = { clients: {}, setups: {} }, subs = [], saved = [];
  const snap = (coll, filter) => ({ docs: Object.entries(store[coll]).filter(([id, d]) => !filter || d[filter[0]] === filter[1]).map(([id, d]) => ({ id, exists: true, data: () => JSON.parse(JSON.stringify(d)) })) });
  const fire = coll => { for (const s of [...subs]) if (s.coll === coll) setTimeout(() => s.cb(snap(coll, s.filter)), 0); };
  const q = (coll, filter) => ({ where: (f, op, v) => q(coll, [f, v]), onSnapshot: (cb) => { const s = { coll, filter, cb }; subs.push(s); setTimeout(() => cb(snap(coll, filter)), 0); return () => { const i = subs.indexOf(s); if (i >= 0) subs.splice(i, 1); }; } });
  const db = { collection: coll => q(coll, null), doc: path => { const [coll, ...rest] = path.split('/'); const id = rest.join('/');
    return { set: async body => { store[coll][id] = JSON.parse(JSON.stringify(body)); fire(coll); }, delete: async () => { delete store[coll][id]; fire(coll); } }; } };
  window.__store = store; window.__saved = saved; window.__apiCalls = [];
  const of = window.fetch; window.fetch = function (u, ...r) { if (String(u).includes('/api/')) window.__apiCalls.push(String(u)); return of.call(this, u, ...r); };
  window.claude = { use: async cap => cap === 'db' ? db : cap === 'downloads' ? { save: async ({ filename, data }) => { saved.push({ filename, size: data && data.size !== undefined ? data.size : String(data).length }); } } : cap === 'user' ? { can: async () => true } : null };
})();
"""


class Sweep:
    @property
    def doing(self):
        return self._doing

    @doing.setter
    def doing(self, text):
        self._doing = text
        if os.environ.get("SWEEP_TRACE"):   # SWEEP_TRACE=1 prints each thing the sweep starts, to find where it hangs
            print(f"  … {text}", flush=True)

    def __init__(self, page, quick=False):
        self.pg = page
        self.quick = quick
        self.doing = "opening the page"
        self.errors = []
        self.clicks = 0
        self.checks = 0
        self.api_404_ok = False
        self.wire(page)

    def wire(self, page):
        self.pg = page
        page.set_default_timeout(8000)   # a control that isn't there is reported after 8 s, not 30
        page.on("pageerror", lambda e: self.fail(f"page error: {e}"))
        page.on("console", self.on_console)
        page.on("dialog", lambda d: asyncio.ensure_future(d.accept()))
        page.on("response", self.on_response)
        # the browser's own "Failed to load resource" line has no address; report the request instead
        page.on("requestfailed", lambda r: self.fail(f"request failed: {r.url} ({r.failure})"))

    def fail(self, msg):
        if any(x in msg for x in IGNORE) or "Failed to load resource" in msg:
            return
        self.errors.append(f"[{self.doing}] {msg}")

    def expect(self, ok, msg):
        """Never weaken these: a false expectation is a failure."""
        self.checks += 1
        if not ok:
            self.fail(msg)
        return ok

    def on_console(self, m):
        # expected problems (a damaged file) are logged as warnings; a programming error is still a bug
        if m.type == "error" or (m.type == "warning" and any(x in m.text for x in ("TypeError", "ReferenceError", "SyntaxError", "RangeError"))):
            self.fail(f"console {m.type}: {m.text}")

    def on_response(self, r):
        # 422 is the normal "this letter can't be filled" answer; anything else 4xx/5xx is a bug
        if "/api/" in r.url and r.status >= 400 and r.status != 422 and not self.api_404_ok:
            self.fail(f"{r.request.method} {r.url} → {r.status}")

    async def settle(self, ms=250):
        await self.pg.wait_for_timeout(ms)

    async def ev(self, js, arg=None):
        if os.environ.get("SWEEP_TRACE") == "2":
            print(f"      ev {js.strip()[:70]!r}", flush=True)
        return await self.pg.evaluate(js, arg)

    async def visible(self, sel):
        loc = self.pg.locator(sel)
        return await loc.count() > 0 and await loc.first.is_visible()

    # ------------------------------------------------------------------------------------------------ overlays
    async def close_overlays(self, keep_inspector=False):
        pg = self.pg
        # a confirm window opened by the click before (Accept all suggestions, Delete, Remove): say yes, so the action runs
        if await self.visible("[data-testid=confirm-ok]"):
            await pg.locator("[data-testid=confirm-ok]").click()
            await self.settle(250)
        # an open list, menu, popover, palette or drawer takes the first Esc; the inspector is only closed when asked
        open_layer = "[role=listbox], [role=menu], [data-radix-popper-content-wrapper], [cmdk-root], [role=dialog]"
        for _ in range(3):
            if await pg.locator(open_layer).count():
                await pg.keyboard.press("Escape")
                await self.settle(150)
            else:
                break
        if not keep_inspector:
            await pg.keyboard.press("Escape")
        else:
            await self.ev("()=>document.activeElement && document.activeElement.blur && document.activeElement.blur()")

    # ------------------------------------------------------------------------------------------------ files
    async def choose(self, click, path):
        """Click something that opens the file picker and hand it a file."""
        async with self.pg.expect_file_chooser() as fc:
            await click()
        await (await fc.value).set_files(str(path if Path(path).is_absolute() else FIX / path))

    async def first_run_visible(self):
        return await self.visible("#first-run-title")

    async def letter_button(self):
        pg = self.pg
        if await self.first_run_visible():
            return pg.get_by_role("button", name="Choose the client's letter, a Word .docx file")
        await self.tab("doc")
        return pg.locator(PANEL).get_by_role("button", name=re.compile(r"^(Replace letter|Choose a letter)"))

    async def load_letter(self, name, keep_edit=False):
        self.doing = f"loading {name}"
        was_sample = await self.ev("()=>!!window.__lt.state.isSample")
        btn = await self.letter_button()
        await self.choose(btn.click, name)
        if await self.confirm_replace() and was_sample:
            self.fail("opening a letter while the unchanged sample was open asked 'Replace the open letter?'")
        await self.settle(1500)
        await self.dismiss_restore()
        if not keep_edit:   # a letter opens in the editor; the other stages work on the client letter view
            await self.ev("()=>window.__lt.setView('source')")
            await self.settle(200)

    async def dismiss_restore(self):
        b = self.pg.get_by_role("button", name="Start fresh")
        if await b.count() and await b.first.is_visible():
            await b.first.click()
            await self.settle(200)

    async def confirm_replace(self):
        """Opening a letter while one with changes is open asks first: say yes. Returns whether the window appeared."""
        await self.settle(300)
        if await self.visible("[data-testid=confirm-ok]"):
            await self.pg.locator("[data-testid=confirm-ok]").click()
            return True
        return False

    async def replace_dialog(self):
        """With changes in the open letter, loading another asks first; Cancel and Esc must keep the open one."""
        self.doing = "replace-letter window"
        await self.load_letter("letterA.docx")   # the unchanged sample never asks
        await self.ev("()=>window.__lt.recordUndo()")
        before = await self.ev("()=>window.__lt.state.fileName")
        for how in ("cancel", "esc"):
            btn = await self.letter_button()
            await self.choose(btn.click, "letterB.docx")
            await self.settle(400)
            if not await self.visible("[data-testid=confirm-cancel]"):
                self.fail("replacing a letter that has changes didn't ask first")
                return
            if how == "cancel":
                await self.pg.locator("[data-testid=confirm-cancel]").click()
            else:
                await self.pg.keyboard.press("Escape")
            await self.settle(400)
            if await self.ev("()=>window.__lt.state.fileName") != before:
                self.fail(f"the replace-letter window ({how}) still replaced the open letter")

    async def load_data(self, name, extra=False):
        self.doing = f"loading data {name}"
        await self.tab("doc")
        panel = self.pg.locator(PANEL)
        if await self.ev("()=>!!window.__lt.state.csv") and extra:
            btn = panel.get_by_role("button", name="Add another data file")
        elif await self.ev("()=>!!window.__lt.state.csv"):
            btn = panel.get_by_role("button", name="Replace data…")
        else:
            btn = panel.get_by_role("button", name="Add data file…")
        if not await btn.count():
            btn = panel.get_by_role("button", name=re.compile(r"data", re.I)).first
        await self.choose(btn.click, name)
        await self.settle(1500)

    # ------------------------------------------------------------------------------------------------ first run
    async def first_run(self):
        """No letter yet: the getting-started page shows, nothing throws, and a bad file gives a message."""
        self.doing = "first run (no letter)"
        pg = self.pg
        self.expect(await self.first_run_visible(), "the getting-started page isn't showing before a letter is loaded")
        self.expect(not await self.ev("()=>!!window.__lt.state.an"), "a letter was loaded before anyone asked for one")
        self.expect(await pg.get_by_role("button", name="Download tagged .docx").is_disabled(), "Download tagged .docx is enabled with no letter")
        self.expect(await pg.get_by_role("button", name="Open the sample letter").count() == 1, "no sample letter button on the getting-started page")
        self.expect(await pg.get_by_role("button", name="Check a tagged template…").count() == 1, "no way to check a tagged template from the getting-started page")
        await self.click_all("header", limit=12)
        await pg.keyboard.press('Control+k')
        await self.settle(300)
        self.expect(await pg.locator('[cmdk-item]').count() > 0, "Ctrl+K opened no command palette on the getting-started page")
        await self.close_overlays()
        # a view switch with no letter must be harmless
        await self.ev("()=>{window.__lt.setView('filled'); window.__lt.setView('source'); for (const t of ['tags','logic','check','export','doc']) window.__lt.setTab(t)}")
        await self.settle(300)
        # a bad file with no letter open: the message shows on the page itself
        drop = pg.get_by_role("button", name="Choose the client's letter, a Word .docx file")
        await self.choose(drop.click, "zero_bytes.docx")
        await self.settle(600)
        alert = pg.get_by_role("alert")
        self.expect(await alert.count() > 0 and "empty" in (await alert.first.inner_text()).lower(), "a 0-byte .docx gave no clear message on the getting-started page")
        await self.choose(drop.click, "bad_not_a_docx.docx")
        await self.settle(600)
        self.expect(await alert.count() > 0, "a file that isn't a .docx gave no message on the getting-started page")
        await self.choose(drop.click, "emps.csv")
        await self.settle(600)
        self.expect(await alert.count() > 0 and "data file" in (await alert.first.inner_text()).lower(), "a data file where the letter goes gave no message")
        # employee data can come first
        await self.choose(pg.get_by_role("button", name="Add employee data").click, "emps.csv")
        await self.settle(800)
        self.expect("emps.csv" in await pg.locator("main").inner_text(), "employee data added before a letter wasn't shown")

    # ------------------------------------------------------------------------------------------------ steps and views
    async def view(self, v):
        await self.close_overlays()
        self.doing = f"view {v}"
        loc = self.pg.locator(f"[data-testid=seg-{v}]")
        if await loc.count() and await loc.first.is_visible():
            await loc.first.click()
        await self.settle(600 if v == "filled" else 250)

    async def open_section(self, title):
        """Unfold a folded section of the step panel (the less-used parts of Tags & fields start folded)."""
        head = self.pg.locator(PANEL).get_by_role("button", name=re.compile(rf"^{title}"))
        if await head.count() and await head.first.get_attribute("aria-expanded") == "false":
            await head.first.click()
            await self.settle(300)

    async def add_box(self):
        await self.open_section("Other text to tag")
        return self.pg.get_by_label("Other text to tag")

    async def tab(self, t):
        await self.close_overlays()
        self.doing = f"step {t}"
        loc = self.pg.locator(f"[data-testid=step-{t}]")
        if await loc.count() and await loc.first.is_visible():
            await loc.first.click()
            await self.settle()

    async def no_sideways_scroll(self, what):
        """Nothing in the page may scroll sideways, and no step panel or inspector may be wider than its column."""
        bad = await self.ev("""()=>{
          const out=[]; const de=document.documentElement;
          if (de.scrollWidth>innerWidth+1) out.push('the page scrolls sideways ('+de.scrollWidth+' > '+innerWidth+')');
          for (const sel of ['[data-testid=step-panel]','#inspector .overflow-y-auto','[role=dialog]']){
            for (const el of document.querySelectorAll(sel)){ if (el.scrollWidth>el.clientWidth+1){ const r=el.getBoundingClientRect(); const wide=[...el.querySelectorAll('*')].find(c=>c.getBoundingClientRect().right>r.right+1); out.push(sel+' scrolls sideways ('+el.scrollWidth+' > '+el.clientWidth+')'+(wide?' at <'+wide.tagName.toLowerCase()+'> '+String(wide.className).slice(0,50)+' "'+(wide.textContent||'').slice(0,30)+'"':'')); } }
          }
          return out;
        }""")
        for b in bad:
            self.fail(f"{what}: {b}")
        self.checks += 1

    async def click_all(self, scope, limit=60):
        """Click every visible, enabled control inside scope, re-reading the list after each click."""
        seen = set()
        for _ in range(limit):
            items = await self.ev(
                """([scope, sel, skip])=>{
                  const root=document.querySelector(scope); if(!root) return [];
                  const els=[...root.querySelectorAll(sel)];
                  return els.map((el,i)=>{ const r=el.getBoundingClientRect(); const vis=r.width>0&&r.height>0&&getComputedStyle(el).visibility!=='hidden';
                    const label=el.getAttribute('aria-label')||'';
                    return {i, key:(el.id||'')+'|'+label+'|'+(el.textContent||'').trim().slice(0,40)+'|'+(el.getAttribute('data-testid')||'')+'|'+(el.getAttribute('role')||el.tagName), label, text:(el.textContent||'').trim().slice(0,40), vis, dis:!!el.disabled||el.getAttribute('aria-disabled')==='true'||el.hasAttribute('data-disabled'), skip:skip.includes(label)}; })
                  .filter(x=>x.vis && !x.dis && !x.skip);
                }""", [scope, CLICKABLE, sorted(SKIP_LABELS)])
            nxt = next((x for x in items if x["key"] not in seen), None)
            if not nxt:
                return
            seen.add(nxt["key"])
            name = nxt["label"] or nxt["text"] or nxt["key"]
            self.doing = f"clicking “{name}” in {scope}"
            loc = self.pg.locator(scope).locator(CLICKABLE).nth(nxt["i"])
            try:
                await loc.click(timeout=3000)
            except Exception as exc:  # noqa: BLE001 - hidden, moved or covered since we listed it
                text = str(exc)
                if "intercepts pointer events" in text:
                    self.fail("a window stayed open over the page: " + text.split("from <")[-1][:120])
                    await self.close_overlays()
                elif "Timeout" not in text and "not visible" not in text and "detached" not in text:
                    self.fail(f"click failed: {text[:300]}")
            self.clicks += 1
            await self.settle(200)
            # a menu opened: use each of its items (the menu closes after one, so open it again for the next)
            if await self.pg.locator("[role=menu]").count():
                await self.use_menu(loc)
            if re.search(r"download|export|docx|mapping|setup file", name, re.I):
                await self.settle(900)
            await self.close_overlays(keep_inspector=True)

    async def use_menu(self, trigger):
        n = await self.pg.locator("[role=menu] [role^=menuitem]").count()
        for k in range(n):
            if not await self.pg.locator("[role=menu]").count():
                try:
                    await trigger.click(timeout=2000)
                    await self.settle(150)
                except Exception:  # noqa: BLE001
                    return
            item = self.pg.locator("[role=menu] [role^=menuitem]").nth(k)
            try:
                if await item.is_enabled():
                    self.doing = f"menu item {k + 1}"
                    await item.click(timeout=2000)
                    self.clicks += 1
                    await self.settle(200)
            except Exception:  # noqa: BLE001
                pass
            await self.close_overlays(keep_inspector=True)

    async def palette_all(self, limit=60):
        """Open the Ctrl+K palette and run every command once (reopening it each time)."""
        pg = self.pg
        self.doing = "command palette"
        for k in range(limit):
            await pg.keyboard.press("Control+k")
            await self.settle(250)
            items = pg.locator("[cmdk-item]")
            n = await items.count()
            if not n:
                self.fail("Ctrl+K didn't open the command palette")
                return
            if k >= n:
                await self.close_overlays()
                return
            label = (await items.nth(k).inner_text()).split("\n")[0]
            self.doing = f"palette command “{label}”"
            try:
                await items.nth(k).click(timeout=2000)
                self.clicks += 1
            except Exception:  # noqa: BLE001
                pass
            await self.settle(300)
            await self.close_overlays()
        await self.close_overlays()

    # ------------------------------------------------------------------------------------------------ the letter
    async def drag_words(self, nth=0, frac=0.5):
        """Drag the mouse across the first line of the nth paragraph that has some text. Returns whether words got selected."""
        pg = self.pg
        await self.ev("()=>window.getSelection().removeAllRanges()")
        idx = await self.ev("()=>[...document.querySelectorAll('#paper p.lp.body')].map((p,i)=>[i,p.textContent.length]).filter(x=>x[1]>50).map(x=>x[0])")
        if len(idx) <= nth:
            return False
        p = pg.locator("#paper p.lp.body").nth(idx[nth])
        await p.evaluate("e=>e.scrollIntoView({block:'center'})")
        await self.settle(500)
        bb = await p.bounding_box()
        if not bb:
            return False
        await pg.mouse.move(bb["x"] + 3, bb["y"] + 11)
        await pg.mouse.down()
        await pg.mouse.move(bb["x"] + bb["width"] * frac, bb["y"] + 11, steps=8)
        await pg.mouse.up()
        await self.settle(400)
        return True

    async def click_word(self, nth=0):
        """A single click on a word. Returns the engine's selection."""
        pg = self.pg
        await self.ev("()=>window.getSelection().removeAllRanges()")
        idx = await self.ev("()=>[...document.querySelectorAll('#paper p.lp.body')].map((p,i)=>[i,p.textContent.length]).filter(x=>x[1]>50).map(x=>x[0])")
        if len(idx) <= nth:
            return None
        p = pg.locator("#paper p.lp.body").nth(idx[nth])
        await p.evaluate("e=>e.scrollIntoView({block:'center'})")
        await self.settle(500)
        bb = await p.bounding_box()
        await pg.mouse.click(bb["x"] + 4, bb["y"] + 11)
        await self.settle(400)
        return await self.ev("()=>JSON.parse(JSON.stringify(window.__lt.state.sel))")

    async def selection_rules(self):
        """In every step but Conditions a click picks the word under the pointer (a drag, several words) and offers Tag this text;
        in Conditions a click picks the paragraph."""
        self.doing = "what a click in the letter selects, in each step"
        await self.view("source")
        for t in TABS:
            await self.tab(t)
            sel = await self.click_word(0)
            if sel is None:
                return
            if t == "logic":
                self.expect(len(sel["pids"]) == 1 and not sel["text"], f"Conditions: a click should select the paragraph, got {json.dumps(sel)[:120]}")
            else:
                self.expect(bool(sel["text"]) and " " not in sel["text"].strip(), f"{t}: a click should select one word, got {json.dumps(sel)[:120]}")
                self.expect(await self.pg.locator("#selTag").count() == 1, f"{t}: a click on a word didn't offer Tag this text")
                # the inspector opening narrows the letter and can push the word out of view: bring it back, the bar follows
                await self.ev("()=>{const s=getSelection(); if (s.rangeCount) s.getRangeAt(0).startContainer.parentElement.scrollIntoView({block:'center'})}")
                await self.settle(400)
                tb = self.pg.locator("[data-testid=sel-toolbar]")
                self.expect(await tb.count() == 1 and await tb.is_visible(), f"{t}: no floating toolbar next to the selected word")
                if await tb.count():
                    self.expect(await tb.get_by_role("button", name="Tag this text").count() == 1, f"{t}: the floating toolbar has no Tag this text")
                    self.expect(await tb.get_by_role("button", name=re.compile("^Show only when")).count() == 1, f"{t}: the floating toolbar has no Show only when")
                    box = await tb.bounding_box()
                    vp = self.pg.viewport_size
                    self.expect(bool(box) and box["x"] >= 0 and box["y"] >= 0 and box["x"] + box["width"] <= vp["width"] and box["y"] + box["height"] <= vp["height"], f"{t}: the floating toolbar is off the screen {box} {vp}")
            await self.close_overlays()
            await self.tab(t)
            await self.close_overlays()
            if t != "logic":
                ok = await self.drag_words(1, 0.6)
                sel = await self.ev("()=>JSON.parse(JSON.stringify(window.__lt.state.sel))")
                if ok:
                    self.expect(bool(sel["text"]) and " " in sel["text"].strip(), f"{t}: dragging should select several words, got {json.dumps(sel)[:120]}")
            await self.close_overlays()

    async def select_text(self):
        self.doing = "selecting text in the letter"
        if await self.drag_words(0, 0.4):
            await self.click_all(INSPECTOR, limit=12)
        await self.close_overlays()
        # the same through the DOM selection API (a selection made by a keyboard or a touch screen)
        await self.ev("""()=>{
          const paper=document.querySelector('#paper'); if(!paper) return;
          const walker=document.createTreeWalker(paper, NodeFilter.SHOW_TEXT); let n, picked=0;
          while((n=walker.nextNode())){ if(n.textContent.trim().length>12){ picked++; if(picked===3){
            const r=document.createRange(); r.setStart(n,0); r.setEnd(n,Math.min(10,n.textContent.length));
            const s=getSelection(); s.removeAllRanges(); s.addRange(r);
            paper.querySelector('.paper-body').dispatchEvent(new MouseEvent('mouseup',{bubbles:true})); break; } } }
        }""")
        await self.settle(300)
        await self.click_all(INSPECTOR, limit=12)
        await self.close_overlays()

    async def tag_badges(self, letter):
        """The Tags step badge follows what the page can see: not done while a placeholder needs a tag, and the count is right."""
        info = await self.ev("""()=>{
          const L=window.__lt, st=L.state;
          const rows=st.rows.filter(r=>r.count);
          const need=rows.filter(r=>['need','check'].includes(L.rowStatus(r))).length + st.tables.reduce((s,t)=>{ if (!t.enabled) return s; const c=L.tableCounts(t); return s+c.all-c.done; },0);
          const tab=document.querySelector('[data-testid=step-tags]'); const n=tab.querySelector('[data-testid=step-count]');
          return {need, hasNeed: rows.some(r=>L.rowStatus(r)==='need'), done: tab.hasAttribute('data-done'), n: n ? n.textContent.trim() : ''};
        }""")
        if info["hasNeed"] and info["done"]:
            self.fail(f"{letter}: the Tags step is marked done while a placeholder still needs a tag")
        if info["n"] != (str(info["need"]) if info["need"] else ""):
            self.fail(f"{letter}: the Tags step badge says '{info['n']}' but {info['need']} placeholders need a tag or a check")
        self.checks += 1

    async def tag_inspector(self, letter):
        """Open a placeholder, click through everything in its panel, then check the step badge."""
        self.doing = f"placeholder panel in {letter}"
        await self.tab("tags")
        row = self.pg.locator(f"{PANEL} [data-row-id]").first
        if await row.count():
            await row.click()
            await self.settle(400)
            await self.click_all(INSPECTOR, limit=14)
        await self.tag_badges(letter)

    async def row_key(self, rid):
        return await self.ev("(id)=>{const r=window.__lt.state.rows.find(x=>x.id===id); return r ? (r.key||'') : null}", rid)

    async def existing_tags_flow(self):
        """A letter that already has tags: the Tags step lists them up front (never 'No placeholders'), Locate cycles through a
        tag's places, a click on a yellow tag in the letter opens its row, and a letter with no tags still says 'No placeholders'."""
        pg = self.pg
        panel = pg.locator(PANEL)
        for name in ("acme_tagged.docx", "conditions_tagged.docx"):
            self.doing = f"Tags: tags already in {name}"
            await self.load_letter(name)
            await self.view("source")
            await self.tab("tags")
            await self.settle(400)
            info = await self.ev("()=>{const o=window.__lt.oldTagNames(); return {total:o.total, names:o.names.map(n=>({id:n.id,count:n.count,places:n.places.length}))}}")
            if not self.expect(info["total"] > 0, f"{name} has no tags the page can see"):
                continue
            txt = await panel.inner_text()
            self.expect(f"This letter already has {info['total']} tag" in txt, f"{name}: the Tags step doesn't say how many tags the letter already has")
            self.expect("No placeholders in the letter" not in txt and "No placeholders yet" not in txt and "of 0 " not in txt, f"{name}: the Tags step says there are no placeholders although the letter has tags")
            rows = panel.locator("[data-testid=existing-tags] li[data-testid^=old-tag-]")
            self.expect(await rows.count() >= min(len(info["names"]), 10), f"{name}: the existing tags aren't listed up front")
            self.expect(await panel.locator("[data-testid=already-tagged]").count() + await panel.locator("[data-testid=next-card]").count() >= 1, f"{name}: neither the Next to tag card nor 'already tagged' is shown")
            # Locate cycles through the places of the most used name
            top = max(info["names"], key=lambda n: n["places"])
            row = panel.locator(f"[data-testid='old-tag-{top['id']}']")
            if await row.count() == 0:
                await panel.get_by_role("button", name=re.compile(r"^Show all \d+ tags")).click()
                await self.settle(200)
            loc = row.get_by_role("button", name=f"Show {top['id']} in the letter")
            self.expect(await loc.count() == 1, f"{name}: no Locate button on the row of {top['id']}")
            if await loc.count():
                await loc.click()
                await self.settle(500)
                self.expect(await self.ev("()=>document.querySelectorAll('#paper .tg.flash').length") >= 1, f"{name}: Locate didn't highlight the tag in the letter")
                if top["places"] > 1:
                    await loc.click()
                    await self.settle(500)
                    self.expect(await row.get_by_text(re.compile(rf"showing 2 of {top['places']}")).count() == 1, f"{name}: a second Locate didn't move on to place 2 of {top['places']}")
            # a plain name (basic) can be switched to custom_schema.basic and back with the Custom tag switch on its row
            plain = await self.ev("()=>{const n=window.__lt.oldTagNames().names.find(n=>/^[a-z_]+$/.test(n.id) && !window.__lt.isCompUpKey(n.id)); return n?n.id:null}")
            if plain:
                prow = panel.locator(f"[data-testid='old-tag-{plain}']")
                if await prow.count() == 0:
                    await panel.get_by_role("button", name=re.compile(r"^Show all \d+ tags")).click()
                    await self.settle(200)
                ptog = prow.get_by_role("switch", name=re.compile("^Custom tag"))
                if self.expect(await ptog.count() == 1, f"{name}: no Custom tag switch on the row of {plain}"):
                    await ptog.click()
                    await self.settle(500)
                    self.expect(await self.ev("(id)=>window.__lt.oldTagNames().names.some(n=>n.id==='custom_schema.'+id)", plain), f"{name}: the Custom tag switch didn't rename {plain} to custom_schema.{plain}")
                    back = panel.locator(f"[data-testid='old-tag-custom_schema.{plain}']").get_by_role("switch", name=re.compile("^Custom tag"))
                    if await back.count():
                        await back.click()
                        await self.settle(500)
                        self.expect(await self.ev("(id)=>window.__lt.oldTagNames().names.some(n=>n.id===id)", plain), f"{name}: turning Custom tag off didn't take custom_schema. off {plain} again")
            # a click on a yellow tag in the letter opens that tag's row
            await self.ev("()=>window.__ltUi.useUi.getState().closeInspector && window.__ltUi.useUi.getState().closeInspector()")
            await self.tab("doc")
            await self.view("source")
            chip = pg.locator("#paper .tg:not(.lg-chip)").first
            if await chip.count():
                await chip.evaluate("e=>e.scrollIntoView({block:'center'})")
                await chip.click()
                await self.settle(500)
                self.expect(await self.ev("()=>window.__lt.state.tab") == "tags", f"{name}: a click on a tag in the letter didn't open Tags & fields")
                self.expect(await panel.locator("[data-testid^=old-tag-][data-open]").count() == 1, f"{name}: a click on a tag in the letter didn't highlight its row")
            await self.close_overlays()
        # no tags at all: the empty state stays
        self.doing = "Tags: a letter without tags"
        await self.load_letter("letterA.docx")
        await self.tab("tags")
        self.expect(await panel.locator("[data-testid=existing-tags]").count() == 0 and "already has" not in await panel.inner_text(), "a letter without tags shows the 'already has tags' list")

    async def next_to_tag_flows(self):
        """Tags & fields: the progress line, the Next-to-tag card (pick a field, Tag it, Skip), the inline Pick field on a row,
        the floating toolbar next to selected words, and the folded sections below the list."""
        pg = self.pg
        self.doing = "Tags: Next to tag card"
        await self.load_letter("letterA.docx")
        await self.view("source")
        await self.tab("tags")
        panel = pg.locator(PANEL)
        self.expect(await panel.get_by_text(re.compile(r"of \d+ tagged")).count() >= 1, "Tags & fields shows no 'N of M tagged' line")
        self.expect(await panel.get_by_role("progressbar").count() >= 1, "Tags & fields shows no progress bar")
        # three words from the letter that are not placeholders yet become "Needs a tag" rows
        words = await self.ev("""()=>{
          const L=window.__lt, have=new Set(L.state.rows.map(r=>r.find)), out=[];
          for (const p of L.state.an.paras){ for (const w of p.model.text.split(/[^A-Za-z]+/)){ if (w.length>=6 && !have.has(w) && !out.includes(w) && out.length<3) out.push(w); } }
          return out; }""")
        if len(words) < 3:
            return
        box = await self.add_box()
        for w in words:
            await box.fill(w)
            await box.press("Enter")
            await self.settle(500)
        await self.ev("()=>window.__ltUi.useUi.getState().closeInspector && window.__ltUi.useUi.getState().closeInspector()")
        await self.close_overlays()
        await self.tab("tags")
        card = pg.locator("[data-testid=next-card]")
        self.expect(await card.count() == 1 and await card.is_visible(), "no Next to tag card while placeholders need a tag")
        if not await card.count():
            return
        self.expect("Next to tag" in await card.inner_text(), "the card isn't headed 'Next to tag'")
        tag_it = card.get_by_role("button", name="Tag it")
        self.expect(await tag_it.is_disabled(), "Tag it is enabled before a field is chosen")
        shown = (await card.locator("button.font-serif").inner_text()).strip()
        left0 = await self.ev("()=>window.__lt.inventoryStats().need")
        await card.locator("#next-field").click()
        await pg.keyboard.type("bonus_pct")
        await self.settle(250)
        await pg.keyboard.press("Enter")
        await self.settle(300)
        self.expect(not await tag_it.is_disabled(), "Tag it stayed disabled after a field was chosen")
        # the Custom tag switch sits next to the field picker, off by default, and adds custom_schema. to the chosen field
        tog = card.get_by_role("switch", name=re.compile("^Custom tag"))
        if self.expect(await tog.count() == 1 and await tog.is_visible(), "the Next to tag card has no visible Custom tag switch"):
            self.expect(await tog.get_attribute("aria-checked") == "false", "the Custom tag switch in the card isn't off by default")
            await tog.click()
            await self.settle(250)
            self.expect(await tog.get_attribute("aria-checked") == "true", "the Custom tag switch in the card didn't turn on")
            self.expect("custom_schema.bonus_pct" in await card.inner_text(), "turning Custom tag on didn't show custom_schema.bonus_pct in the card's field")
            await tog.click()
            await self.settle(250)
            self.expect(await tog.get_attribute("aria-checked") == "false", "the Custom tag switch in the card didn't turn off")
            await tog.click()
            await self.settle(250)
        await tag_it.click()
        await self.settle(600)
        key = await self.ev("(f)=>{const r=window.__lt.state.rows.find(x=>x.find===f); return r ? r.key : null}", shown)
        self.expect(key == "custom_schema.bonus_pct", f"Tag it didn't tag the shown text with the custom tag (key {key!r})")
        self.expect(await self.ev("()=>window.__lt.inventoryStats().need") == left0 - 1, "Tag it didn't take one off 'Needs a tag'")
        nxt = (await card.locator("button.font-serif").inner_text()).strip() if await card.count() else ""
        self.expect(nxt != shown, "the card didn't move on to the next placeholder")
        # Skip moves on without tagging
        need = await self.ev("()=>window.__lt.inventoryStats().need")
        await card.get_by_role("button", name="Skip").click()
        await self.settle(400)
        self.expect(await self.ev("()=>window.__lt.inventoryStats().need") == need, "Skip changed a tag")
        self.expect((await card.locator("button.font-serif").inner_text()).strip() != nxt, "Skip didn't show another placeholder")
        # the list is grouped, and a row with no tag has its own Pick field
        self.expect(await panel.get_by_role("heading", name=re.compile("^Needs a tag")).count() == 1, "the list has no 'Needs a tag' group")
        pick = panel.get_by_role("combobox", name=re.compile("^Pick a field for ")).first
        self.expect(await pick.count() == 1, "an untagged row has no inline Pick field")
        if await pick.count():
            who = (await pick.get_attribute("aria-label"))[len("Pick a field for "):]
            await pick.evaluate("e=>e.scrollIntoView({block:'center'})")
            await pick.click()
            await pg.keyboard.type("first_name")
            await self.settle(250)
            await pg.keyboard.press("Enter")
            await self.settle(500)
            key = await self.ev("(f)=>{const r=window.__lt.state.rows.find(x=>x.find===f); return r ? r.key : null}", who)
            self.expect(key == "first_name", f"the inline Pick field didn't tag its row (key {key!r})")
        # tag whatever is left: the card turns into the success state
        await self.ev("()=>{const L=window.__lt; L.state.rows.filter(r=>r.count && !L.rowStatus(r).startsWith('t') && L.rowStatus(r)!=='off').forEach(r=>{ if(!r.key) L.setRowKey(r.id,'first_name'); else L.confirmRow(r.id)})}")
        await self.settle(500)
        done = pg.locator("[data-testid=next-done]")
        self.expect(await done.count() == 1, "no 'Everything has a tag' card once everything is tagged")
        if await done.count():
            self.expect(await done.get_by_role("button", name="Review all").count() == 1, "the success card has no Review all")
            await done.get_by_role("button", name="Review all").click()
            await self.settle(400)
            self.expect(await self.visible("#inspector[data-kind=tag]"), "Review all didn't open the first placeholder")
        await self.close_overlays()
        # the folded sections below the list each have a one-line summary
        for title in ["Other text to tag", "Tag settings"]:
            head = panel.get_by_role("button", name=re.compile(f"^{title}"))
            self.expect(await head.count() == 1, f"no '{title}' section below the list")
            if await head.count():
                self.expect(len((await head.inner_text()).strip().splitlines()) >= 2, f"'{title}' has no summary line")
        # the toolbar's own buttons: Tag this text adds a row, Show only when opens the condition form
        await self.close_overlays()
        sel = await self.click_word(1)
        tb = pg.locator("[data-testid=sel-toolbar]")
        if sel and await tb.count():
            await tb.get_by_role("button", name="Show only when…").click()
            await self.settle(400)
            self.expect(await self.visible("#cbf-0") or await self.visible("#inspector"), "Show only when… on the floating toolbar opened nothing")
            await self.close_overlays()
            await self.tab("tags")
            sel = await self.click_word(2)
            tb = pg.locator("[data-testid=sel-toolbar]")
            if sel and await tb.count():
                rows = await self.ev("()=>window.__lt.state.rows.length")
                await tb.get_by_role("button", name="Tag this text").click()
                await self.settle(500)
                self.expect(await self.visible("#inspector[data-kind=tag]") or await self.ev("()=>window.__lt.state.rows.length") >= rows, "Tag this text on the floating toolbar did nothing")
        await self.close_overlays()

    async def tag_fix_flows(self):
        """The step badge matches what the panel shows; a detected placeholder can be removed (highlight, flag and count go, undo
        brings it back). The Custom tag switch and the rest are in tests_ui/react/tagfix.py."""
        pg = self.pg
        self.doing = "Tags: badge, Not a placeholder"
        await self.load_letter("letterA.docx")
        await self.view("source")
        await self.tab("tags")
        todo = await self.ev("()=>window.__lt.tagsTodo()")
        badge = (await pg.get_by_test_id("step-tags").get_by_test_id("step-count").inner_text()).strip() if await pg.get_by_test_id("step-tags").get_by_test_id("step-count").count() else "0"
        self.expect(badge == str(todo["total"]), f"the Tags & fields badge says {badge!r} but the page counts {todo['total']}")
        stats = await self.ev("()=>window.__lt.inventoryStats()")
        self.expect(todo["rows"] == stats["need"] + stats["check"], "the badge's placeholder part differs from the list's Needs a tag + To check")
        if todo["cells"]:
            self.expect(await self.visible("[data-testid=tables-todo]"), "the badge counts table cells but the list has no Salary tables row")
        rid = await self.ev("()=>{const r=window.__lt.state.rows.find(x=>x.count>0 && x.scope==='all'); return r ? r.id : null}")
        if not rid:
            return
        find = await self.ev("(i)=>window.__lt.state.rows.find(x=>x.id===i).find", rid)
        n0 = await self.ev("()=>window.__lt.tagsTodo().total")
        needs = await self.ev("(i)=>['need','check'].includes(window.__lt.rowStatus(window.__lt.state.rows.find(x=>x.id===i)))", rid)
        row = pg.locator(f'[data-row-id="{rid}"]')
        await row.click()
        await self.settle(400)
        self.expect(await self.visible("[data-testid=insp-remove]"), "the placeholder panel has no 'Not a placeholder, remove'")
        await pg.get_by_test_id("insp-remove").click()
        await self.settle(500)
        self.expect(await self.ev("(i)=>!window.__lt.state.rows.some(x=>x.id===i)", rid), "Not a placeholder left the row in the list")
        self.expect(await pg.locator(f'#paper .ph[data-row="{rid}"]').count() == 0, "Not a placeholder left the highlight in the letter")
        n1 = await self.ev("()=>window.__lt.tagsTodo().total")
        self.expect(n1 == (n0 - 1 if needs else n0), f"the step count went from {n0} to {n1} after removing a row that {'needed' if needs else 'did not need'} a tag")
        self.expect(await self.ev("(f)=>document.querySelector('#paper').innerText.includes(f)", find), f"the words {find!r} left the letter")
        await self.ev("()=>window.__lt.undo()")
        await self.settle(500)
        self.expect(await self.ev("(i)=>window.__lt.state.rows.some(x=>x.id===i)", rid), "undo didn't bring the removed row back")
        self.expect(await self.ev("()=>window.__lt.tagsTodo().total") == n0, "undo didn't restore the step count")
        await self.close_overlays()

    async def tag_editor_flows(self):
        """The placeholder editor: field picker, custom tag switch, several fields, format, the written tag, include, confirm, delete."""
        pg = self.pg
        self.doing = "Tags: the placeholder editor"
        await self.view("source")
        await self.tab("tags")
        # a click on a placeholder in the letter opens its editor
        ph = pg.locator("#paper .ph").first
        self.expect(await ph.count() == 1, "the letter has no placeholder to click")
        await ph.evaluate("e=>e.scrollIntoView({block:'center'})")
        await ph.click()
        await self.settle(500)
        self.expect(await self.visible("#inspector[data-kind=tag]"), "clicking a placeholder in the letter didn't open its editor")
        rid = await self.ev("()=>{const ui=window.__ltUi.useUi.getState(); return ui.inspector && ui.inspector.args.id}")
        # change the field by typing a column name
        await pg.locator("#tag-key-0").click()
        await pg.keyboard.type("zz_pick")
        await self.settle(250)
        await pg.keyboard.press("Enter")
        await self.settle(400)
        self.expect(await self.row_key(rid) == "zz_pick", f"typing a field name didn't change the row's key: {await self.row_key(rid)!r}")
        self.expect("zz_pick" in await pg.locator("#tag-final").input_value(), "the tag written into the letter doesn't follow the field")
        # and a field from the list
        await pg.locator("#tag-key-0").click()
        await pg.keyboard.type("first_name")
        await self.settle(250)
        await pg.keyboard.press("Enter")
        await self.settle(400)
        self.expect(await self.row_key(rid) == "first_name", f"picking a field from the list didn't change the row's key: {await self.row_key(rid)!r}")
        # custom tag switch adds and removes custom_schema.
        sw = pg.locator(f"{INSPECTOR} [role=switch]")
        self.expect(await sw.count() == 1, "no Custom tag switch for a plain field")
        if await sw.count():
            await sw.click()
            await self.settle(300)
            self.expect((await self.row_key(rid)).startswith("custom_schema."), f"Custom tag on should add custom_schema., key is {await self.row_key(rid)!r}")
            await sw.click()
            await self.settle(300)
            self.expect(not (await self.row_key(rid)).startswith("custom_schema."), f"Custom tag off should remove custom_schema., key is {await self.row_key(rid)!r}")
        # two fields side by side
        await pg.get_by_role("button", name="Add another field").click()
        await pg.keyboard.type("first_name")
        await self.settle(250)
        await pg.keyboard.press("Enter")
        await self.settle(400)
        self.expect("+" in await self.row_key(rid), f"Add another field didn't join two fields: {await self.row_key(rid)!r}")
        await pg.get_by_role("button", name="Remove field 2").click()
        await self.settle(300)
        self.expect("+" not in await self.row_key(rid), "Remove field 2 left the second field in")
        # format
        await pg.locator("#tag-format").click()
        opts = pg.get_by_role("option")
        if await opts.count() > 1:
            await opts.nth(1).click()
            await self.settle(300)
        await self.close_overlays(keep_inspector=True)
        # the tag can be written by hand, and reset
        await pg.locator("#tag-final").fill("{{ my_own_tag }}")
        await self.settle(300)
        reset = pg.get_by_role("button", name="Reset to generated tag")
        self.expect(await reset.count() == 1, "editing the written tag didn't offer 'Reset to generated tag'")
        if await reset.count():
            await reset.click()
            await self.settle(300)
            self.expect("my_own_tag" not in await pg.locator("#tag-final").input_value(), "Reset to generated tag kept the hand-written tag")
        await pg.locator("#tag-final").fill("{{ broken")
        await self.settle(400)
        self.expect(await pg.locator("#tag-problem").count() == 1, "a tag with a typing mistake showed no problem line")
        await pg.get_by_role("button", name="Reset to generated tag").click()
        await self.settle(300)
        # include in template
        inc = pg.get_by_role("checkbox", name="Include in template")
        await inc.click()
        await self.settle(300)
        self.expect(not await self.ev("(id)=>window.__lt.state.rows.find(x=>x.id===id).enabled", rid), "Include in template off left the row on")
        await inc.click()
        await self.settle(300)
        # confirm a suggested mapping, if one is waiting
        conf = pg.get_by_role("button", name="Confirm mapping")
        if await conf.count():
            await conf.click()
            await self.settle(400)
        await pg.get_by_role("button", name="Done", exact=True).click()
        await self.settle(300)
        self.expect(not await self.visible("#inspector"), "Done left the editor open")
        # a text added by hand can be deleted again (with a confirmation)
        await self.view("source")
        box = await self.add_box()
        await box.fill("Annexure 1")
        await box.press("Enter")
        await self.settle(600)
        row = pg.locator(f"{PANEL} [data-row-id]", has_text="Annexure 1")
        self.expect(await row.count() >= 1, "a text added by hand isn't in the list")
        if await row.count():
            await row.first.click()
            await self.settle(300)
            await pg.get_by_role("button", name="Delete", exact=True).click()
            await self.settle(300)
            await pg.locator("[data-testid=confirm-ok]").click()
            await self.settle(500)
            self.expect(await pg.locator(f"{PANEL} [data-row-id]", has_text="Annexure 1").count() == 0, "Delete left the text in the list")
        # keyboard: arrow keys move between rows
        first = pg.locator(f"{PANEL} [data-row-id]").first
        await first.focus()
        await pg.keyboard.press("ArrowDown")
        await self.settle(250)
        moved = await self.ev("()=>document.activeElement && document.activeElement.dataset.rowId")
        self.expect(bool(moved) and moved != await first.get_attribute("data-row-id"), "ArrowDown didn't move to the next placeholder")
        await self.close_overlays()

    async def tables_flows(self):
        """Salary tables: pick a field for an empty cell, the letter shows it, a click on the cell in the letter opens it."""
        pg = self.pg
        self.doing = "Tags: salary tables"
        await self.view("source")
        await self.tab("tags")
        await self.open_section("Salary tables")
        cells = pg.locator(f"{PANEL} [data-cell]", has_text="Needs a tag")
        if not await cells.count():
            return
        before = await self.ev("()=>window.__lt.state.tables.reduce((s,t)=>s+window.__lt.tableCounts(t).done,0)")
        cell = cells.first
        await cell.evaluate("e=>e.scrollIntoView({block:'center'})")
        await cell.locator("[role=combobox]").click()
        await pg.keyboard.type("ctc")
        await self.settle(250)
        await pg.keyboard.press("Enter")
        await self.settle(500)
        after = await self.ev("()=>window.__lt.state.tables.reduce((s,t)=>s+window.__lt.tableCounts(t).done,0)")
        self.expect(after > before, "picking a field for a table cell didn't tag it")
        ghost = pg.locator("#paper .cell-ghost").first
        if await ghost.count():
            await ghost.evaluate("e=>e.scrollIntoView({block:'center'})")
            await self.settle(300)
            await ghost.click()
            await self.settle(500)
            self.expect(await self.ev("()=>window.__lt.state.tab") == "tags", "a click on a table cell in the letter didn't open the Tags step")
        # the format and row-hiding options open and take a change
        opt = pg.get_by_role("button", name=re.compile("Format and row hiding")).first
        if await opt.count():
            await opt.click()
            await self.settle(300)
            await self.click_all(PANEL, limit=15)
        await self.close_overlays()

    async def shell_flows(self):
        """The frame: step panel width and folding, theme, Key, Back to top, palette, undo / redo buttons, Esc."""
        pg = self.pg
        self.doing = "the frame: panel, theme, key, palette"
        await self.tab("tags")
        await self.view("source")
        sep = pg.get_by_role("separator", name="Resize panel")
        w0 = int(await sep.get_attribute("aria-valuenow"))
        await sep.focus()
        await pg.keyboard.press("ArrowRight")
        await pg.keyboard.press("ArrowRight")
        w1 = int(await sep.get_attribute("aria-valuenow"))
        self.expect(w1 == w0 + 40, f"ArrowRight on the panel edge should widen it by 40px ({w0} -> {w1})")
        await pg.keyboard.press("Home")
        self.expect(int(await sep.get_attribute("aria-valuenow")) == int(await sep.get_attribute("aria-valuemin")), "Home on the panel edge didn't give the narrowest width")
        # a drag on the edge
        bb = await sep.bounding_box()
        await pg.mouse.move(bb["x"] + bb["width"] / 2, bb["y"] + 200)
        await pg.mouse.down()
        await pg.mouse.move(bb["x"] + 120, bb["y"] + 200, steps=6)
        await pg.mouse.up()
        w2 = int(await sep.get_attribute("aria-valuenow"))
        self.expect(w2 > int(await sep.get_attribute("aria-valuemin")), f"dragging the panel edge didn't widen it ({w2})")
        await pg.keyboard.press("End")
        await pg.keyboard.press("Home")
        # fold and unfold
        await pg.get_by_role("button", name="Hide panel").click()
        await self.settle(300)
        self.expect(not await self.visible(PANEL), "Hide panel left the step panel showing")
        await pg.get_by_role("button", name="Show panel").click()
        await self.settle(300)
        self.expect(await self.visible(PANEL), "Show panel didn't bring the step panel back")
        # theme
        await pg.locator("header button[aria-label^='Theme']").click()
        await pg.get_by_role("menuitemradio", name="Dark").click()
        await pg.get_by_role("menu").wait_for(state="detached")   # the menu is still leaving; a trigger click now can land on it
        await self.settle(200)
        self.expect(await self.ev("()=>document.documentElement.getAttribute('data-theme')") == "dark", "choosing Dark didn't set the dark theme")
        await pg.locator("header button[aria-label^='Theme']").click()
        await pg.get_by_role("menuitemradio", name="Light").click()
        await pg.get_by_role("menu").wait_for(state="detached")   # the menu is still leaving; a trigger click now can land on it
        self.expect(await self.ev("()=>document.documentElement.getAttribute('data-theme')") == "light", "choosing Light didn't set the light theme")
        await pg.locator("header button[aria-label^='Theme']").click()
        await pg.get_by_role("menuitemradio", name="System").click()
        await pg.get_by_role("menu").wait_for(state="detached")   # the menu is still leaving; a trigger click now can land on it
        self.expect(await self.ev("()=>document.documentElement.getAttribute('data-theme')") is None, "choosing System left a theme set")
        # the key to the marks, and back to top
        key = pg.get_by_role("button", name=re.compile(r"^Key"))
        if await key.count():
            await key.first.click()
            await self.settle(250)
            self.expect(await pg.locator("[role=dialog], [data-radix-popper-content-wrapper]").count() >= 1, "the Key button opened nothing")
            await pg.keyboard.press("Escape")
            await self.settle(200)
        await pg.locator("#paper-scroll").evaluate("e=>{e.scrollTop=600}")
        await self.settle(200)
        await pg.get_by_role("button", name="Back to top of letter").click()
        await self.settle(900)
        self.expect(await pg.locator("#paper-scroll").evaluate("e=>e.scrollTop") < 5, "Back to top didn't scroll the letter to the top")
        # the palette: type a step name, Enter
        await pg.keyboard.press("Control+k")
        await self.settle(250)
        await pg.keyboard.type("conditions")
        await self.settle(250)
        await pg.keyboard.press("Enter")
        await self.settle(400)
        self.expect(await self.ev("()=>window.__lt.state.tab") == "logic", "choosing 'Conditions' in the palette didn't open the step")
        # Esc closes the inspector
        await self.click_word(0)
        self.expect(await self.visible("#inspector"), "selecting something opened no inspector")
        await pg.keyboard.press("Escape")
        await self.settle(250)
        self.expect(not await self.visible("#inspector"), "Esc didn't close the inspector")
        # undo and redo buttons follow the history
        await pg.get_by_role("button", name="Undo", exact=True).click() if await pg.get_by_role("button", name="Undo", exact=True).is_enabled() else None
        await pg.get_by_role("button", name="Redo").click() if await pg.get_by_role("button", name="Redo").is_enabled() else None

    async def drop_and_restore(self):
        """Files dropped on the page, and the work this browser kept for a letter that was open before."""
        pg = self.pg
        self.doing = "files dropped on the page"
        await self.load_letter("letterA.docx")
        await self.tab("doc")
        await self.ev("()=>{const dt=new DataTransfer(); dt.items.add(new File(['x'],'x.docx')); document.querySelector('header').dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:dt}))}")
        await self.settle(400)
        self.expect(await pg.locator("[data-sonner-toast]", has_text="use the Document step").count() >= 1, "a file dropped outside a drop zone didn't say where to drop it")
        import base64
        b64 = base64.b64encode((FIX / "letterB.docx").read_bytes()).decode()
        await self.ev("""(b64)=>{const bin=atob(b64); const u=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) u[i]=bin.charCodeAt(i);
          const dt=new DataTransfer(); dt.items.add(new File([u],'letterB.docx'));
          const z=document.querySelector('[data-testid=step-panel] [data-dropzone]');
          z.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:dt}));
          z.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:dt}));}""", b64)
        await self.settle(1500)
        self.expect(await self.ev("()=>window.__lt.state.fileName") == "letterB.docx", "a letter dropped on the Document step wasn't opened")
        # work kept in this browser comes back
        self.doing = "restore the work kept in this browser"
        await self.load_letter("letterA.docx")
        await self.tab("tags")
        box = await self.add_box()
        await box.fill("Annexure 1")
        await box.press("Enter")
        await self.settle(600)
        await self.load_letter("northwind.docx")    # asks first: the work is flushed to the autosave
        await self.settle(600)
        await self.choose((await self.letter_button()).click, "letterA.docx")
        await self.confirm_replace()
        await self.settle(1500)
        restore = pg.get_by_role("button", name="Restore my work")
        self.expect(await restore.count() == 1, "opening a letter again didn't offer to restore its work")
        if await restore.count():
            await restore.click()
            await self.settle(800)
            self.expect(await self.ev("()=>window.__lt.state.rows.some(r=>r.find==='Annexure 1')"), "Restore my work didn't bring the added text back")

    async def old_tags_flow(self):
        """An older template's own tags: rename, prefix, rewrite amount tags, find and replace, undo a change."""
        pg = self.pg
        self.doing = "Tags: tags already in the letter"
        await self.load_letter("oldtemplate.docx")
        await self.tab("tags")
        head = pg.get_by_role("button", name=re.compile("^Tags already in the letter"))
        if not self.expect(await head.count() == 1, "an older template with tags in it shows no 'Tags already in the letter' section"):
            return
        if await pg.locator("input#old-prefix").count() == 0:
            await head.first.click()
            await self.settle(300)
        await pg.locator("input#old-prefix").evaluate("e=>e.scrollIntoView({block:'center'})")
        await pg.get_by_role("button", name="Add prefix").click()
        await self.settle(500)
        await pg.locator("input#old-prefix").evaluate("e=>e.scrollIntoView({block:'center'})")
        self.expect(await pg.get_by_role("heading", name="Changes made").count() == 1, "Add prefix left no entry in 'Changes made'")
        await pg.get_by_role("button", name="Rewrite").click()
        await self.settle(500)
        await pg.get_by_label("Find", exact=True).fill("ctc")
        await pg.get_by_label("Replace with").fill("ctc")
        await pg.get_by_role("button", name="Replace", exact=True).click()
        await self.settle(500)
        undo = pg.get_by_role("button", name="Undo this change")
        n = await undo.count()
        self.expect(n >= 1, "no change to undo in 'Changes made'")
        if n:
            await undo.first.click()
            await self.settle(500)
            self.expect(await pg.get_by_role("button", name="Undo this change").count() < n, "Undo this change didn't remove the change")
        rename = pg.get_by_role("button", name=re.compile("^Rename "))
        if await rename.count():
            await rename.first.click()
            await self.settle(200)
            await pg.get_by_label(re.compile("^New name for")).first.fill("renamed_tag")
            await pg.get_by_role("button", name="Rename", exact=True).click()
            await self.settle(500)
        await self.close_overlays()

    async def condition_roundtrip(self):
        """Every test the condition builder offers writes a condition that reads back unchanged and runs in the preview engine."""
        self.doing = "condition builder round trip"
        bad = await self.ev("""async ()=>{
          const L=window.__lt, out=[];
          const texts=['yes','A+',"O'Neil",'say "hi"','R&D, Ops','  two  words  ','back'+String.fromCharCode(92)+'slash','é, ü'];
          const nums=['3','12,00,000','-1.5'];
          const one=async (cb,label)=>{
            const e=L.cbExpr(cb); if (!e){ out.push(label+': wrote nothing'); return; }
            const back=L.cbParse(e);
            if (!back || L.cbExpr(back)!==e) out.push(label+': did not read back: '+e);
            const r=await L.cbEmployee(e); if (r.error) out.push(label+': the preview engine failed: '+r.error+' in '+e);
          };
          for (const [op] of L.CB_OPS){
            const vals = L.CB_NOVAL.has(op) ? [''] : L.CB_NUM[op] ? nums : texts;
            for (const v of vals) await one({rules:[{field:'employee_schema.rating', op, value:v}], join:'and', raw:null}, op+' '+JSON.stringify(v));
          }
          for (const join of ['and','or'])
            await one({rules:[{field:'employee_schema.rating', op:'is', value:"O'Neil"},{field:'custom_schema.pay', op:'gt', value:'3'}], join, raw:null}, 'two rules '+join);
          return out;
        }""")
        for b in bad:
            self.fail("condition builder: " + b)
        self.checks += 1

    # ------------------------------------------------------------------------------------------------ Conditions, end to end
    async def pick_field(self, id_, text):
        await self.pg.locator("#" + id_).click()
        await self.pg.keyboard.type(text)
        await self.settle(200)
        await self.pg.keyboard.press("Enter")
        await self.settle(200)

    async def para(self, n, clamp=False):
        """Click the nth paragraph that has some text (so the list of paragraphs doesn't move when tags are added)."""
        idx = await self.ev("()=>[...document.querySelectorAll('#paper p.lp.body')].map((p,i)=>[i,p.textContent.replace(/\\u00a0/g,' ').trim().length]).filter(x=>x[1]>25).map(x=>x[0])")
        if clamp and idx:
            n = min(n, len(idx) - 1)
        if len(idx) <= n:
            self.fail(f"the letter has only {len(idx)} paragraphs with text, wanted number {n + 1}")
            return
        p = self.pg.locator("#paper p.lp.body").nth(idx[n])
        await p.evaluate("e=>e.scrollIntoView({block:'center'})")
        await self.settle(300)
        bb = await p.bounding_box()
        # away from placeholders and condition lines, which have their own meaning when clicked
        for x in (bb["width"] - 8, bb["width"] / 2, 30, 6):
            await p.click(position={"x": x, "y": 6})
            await self.settle(300)
            if await self.ev("()=>window.__lt.state.sel.pids.length"):
                return
            if await self.ev("()=>window.__lt.state.tab") != "logic":
                await self.tab("logic")
        shot = Path(tempfile.gettempdir()) / "sweep-para.png"
        await self.pg.screenshot(path=str(shot))
        self.fail(f"clicking paragraph {n + 1} selected nothing (screenshot: {shot})")

    async def logic_tags(self):
        return await self.ev("()=>window.__lt.state.logic.map(l=>l.text)")

    async def add_condition_btn(self):
        await self.pg.get_by_role("button", name="Add condition").click()
        await self.settle(600)

    async def para_condition(self):
        """Click a paragraph, build a condition with the first value from the data, apply it (used on every letter)."""
        self.doing = "adding a condition to a paragraph"
        await self.view("source")
        await self.tab("logic")
        if await self.pg.locator("#paper p.lp.body").count() < 4:
            return
        before = len(await self.logic_tags())
        await self.para(3)
        if not await self.pg.locator("#cbf-0").count():
            return
        await self.pick_field("cbf-0", "dept")
        chip = self.pg.locator(f"{INSPECTOR} [role=group][aria-label='Values in your data'] button").first
        if await chip.count():
            await chip.click()
        else:
            await self.pg.locator("#cbv-0").fill("Finance")
        await self.settle(400)
        await self.click_all(INSPECTOR, limit=8)
        await self.close_overlays(keep_inspector=True)
        apply = self.pg.get_by_role("button", name="Add condition")
        if await apply.count():
            await apply.click()
            await self.settle(500)
            self.expect(len(await self.logic_tags()) > before, "Add condition did nothing")
        await self.close_overlays()

    async def conditions_flows(self):
        """Every way of adding or changing a condition, on the sample letter with the employee data loaded."""
        pg = self.pg
        self.doing = "Conditions step, end to end"
        await self.view("source")
        await self.tab("logic")
        before = len(await self.logic_tags())

        # 1. a paragraph, built with the builder; the live result counts employees
        self.doing = "condition: paragraph with the builder"
        await self.para(3)
        await self.pick_field("cbf-0", "dept")
        await pg.locator("#cbv-0").fill("Finance")
        await self.settle(500)
        info = await pg.locator("#cbInfo").inner_text()
        self.expect("Shown when" in info and "True for" in info, f"the builder's live result didn't read: {info[:100]!r}")
        await self.add_condition_btn()
        tags = await self.logic_tags()
        self.expect(len(tags) == before + 2 and tags[-2].startswith("{% if") and "endif" in tags[-1], f"a paragraph condition should add an if and an end if, got {tags[before:]}")
        before = len(tags)

        # 2. Builder <-> Jinja round trip
        self.doing = "condition: Builder / Jinja switch"
        await self.para(6)
        await pg.get_by_role("radio", name="Jinja").click()
        await self.settle(300)
        await pg.locator("textarea.cb-rawin").fill('employee_schema.rating | lower == "a"')
        await self.settle(300)
        self.expect("Shown when" in await pg.locator("#cbInfo").inner_text(), "a Jinja condition that the builder can read has no plain-English line")
        await pg.get_by_role("radio", name="Builder").click()
        await self.settle(300)
        cb = await self.ev("()=>window.__lt.state.cb")
        self.expect(cb and cb["raw"] is None and cb["rules"][0]["field"] == "employee_schema.rating" and cb["rules"][0]["value"] == "a", f"Jinja -> Builder lost the condition: {json.dumps(cb)}")
        # a hand-written one the builder can't show says so and offers to start again
        await pg.get_by_role("radio", name="Jinja").click()
        await pg.locator("textarea.cb-rawin").fill("employee_schema.rating | length > 3 and custom_schema.x or y")
        await self.settle(300)
        self.expect(await pg.get_by_role("button", name="Start again with the builder").count() == 1, "a hand-written condition didn't offer 'Start again with the builder'")
        await pg.get_by_role("button", name="Start again with the builder").click()
        await self.settle(300)
        await pg.locator("textarea.cb-rawin").count() == 0 or self.fail("Start again with the builder stayed in Jinja")
        await self.close_overlays()

        # 3. otherwise text, then change the condition
        self.doing = "condition: otherwise text, change condition"
        await self.para(8)
        await self.pick_field("cbf-0", "dept")
        await pg.locator("#cbv-0").fill("Sales")
        await pg.locator("#cbOther").fill("Other line one\nOther line two")
        await self.add_condition_btn()
        tags = await self.logic_tags()
        self.expect(any("{%- else" in t or "{% else" in t for t in tags[before:]), f"otherwise text should add an else, got {tags[before:]}")
        before = len(tags)
        await self.tab("logic")
        await pg.get_by_role("button", name="Change condition").first.click()
        await self.settle(400)
        await pg.locator("#cbv-0").fill("Ops")
        await pg.get_by_role("button", name="Save condition").click()
        await self.settle(600)
        self.expect(any('"ops"' in t for t in await self.logic_tags()), "Save condition didn't change the condition")
        await self.close_overlays()

        # 4. a block left open, then closed where the person says
        self.doing = "condition: close an open block"
        await self.para(10)
        await pg.get_by_text("Advanced: insert a single logic tag").click()
        await pg.locator(f"{INSPECTOR} input[aria-label='Tag text']").fill('{% if custom_schema.x == "1" %}')
        await pg.get_by_role("button", name="Insert tag").click()
        await self.settle(600)
        close = pg.get_by_role("button", name="Choose where it ends")
        self.expect(await close.count() >= 1, "an if with no end if didn't say it is open")
        n = len(await self.logic_tags())
        await close.first.click()
        await self.settle(300)
        self.expect(await pg.locator("#closeCancel").count() == 1, "'Choose where it ends' didn't ask for a paragraph")
        await self.para(12)
        tags = await self.logic_tags()
        self.expect(len(tags) == n + 1 and "endif" in tags[-1], f"clicking a paragraph should close the open if, got {tags[n:]}")
        self.expect(await pg.get_by_role("button", name="Choose where it ends").count() == 0, "the block is closed but the list still says it is open")
        before = len(tags)

        # 5. text by value for a paragraph and for words
        self.doing = "condition: text by value"
        await self.para(5)
        await pg.get_by_role("button", name="Different text by value…").click()
        await self.pick_field("swField", "employee_schema.rating")
        await pg.locator("#swv-0").fill("A")
        await pg.locator("#swt-0").fill("Text for A")
        await pg.locator("#swv-1").fill("B")
        await pg.locator("#swt-1").fill("Text for B")
        await pg.locator("#swOther").fill("Anything else")
        self.expect("elif" in await pg.locator("#swPrev").inner_text(), "the text-by-value preview shows no else if")
        await pg.get_by_role("button", name="Insert", exact=True).click()
        await self.settle(700)
        tags = await self.logic_tags()
        self.expect(len(tags) >= before + 4, f"text by value should add if / else if / else / end if, got {tags[before:]}")
        before = len(tags)
        await self.close_overlays()

        # 6. words: a condition inside a sentence, a tag inserted here, text by value for words
        self.doing = "condition: inside a sentence"
        await self.drag_words(0, 0.5)
        await pg.locator("#selIf").click()
        await self.pick_field("cbf-0", "dept")
        await pg.locator("#cbv-0").fill("Finance")
        await pg.locator("#inOther").fill("other words")
        await self.add_condition_btn()
        tags = await self.logic_tags()
        self.expect(len(tags) == before + 2 and any("other words" in t for t in tags[before:]), f"an inline if should add two tags, got {tags[before:]}")
        before = len(tags)

        self.doing = "condition: insert a tag here"
        await self.drag_words(1, 0.5)
        await pg.locator("#selInsert").click()
        await pg.locator("#inTag").fill("{{ first_name }}")
        await pg.locator("#inWhere").click()
        await pg.get_by_role("option", name="After the words").click()
        await pg.get_by_role("button", name="Insert", exact=True).click()
        await self.settle(600)
        self.expect(len(await self.logic_tags()) == before + 1, "Insert a tag here added nothing")
        before = len(await self.logic_tags())

        self.doing = "condition: text by value for words"
        await self.drag_words(2, 0.5)
        await pg.locator("#selSwitch").click()
        await self.pick_field("swField", "employee_schema.rating")
        await pg.locator("#swv-0").fill("A")
        await pg.locator("#swv-1").fill("B")
        await pg.locator("#swt-1").fill("bee")
        await pg.get_by_role("button", name="Insert", exact=True).click()
        await self.settle(600)
        self.expect(len(await self.logic_tags()) >= before + 2, "text by value for words added nothing")

        # 7. a for loop and a set, typed by hand
        self.doing = "condition: advanced single tags"
        await self.para(4)
        await pg.get_by_text("Advanced: insert a single logic tag").click()
        await pg.get_by_role("button", name="Repeat for", exact=False).click() if await pg.get_by_role("button", name="Repeat for", exact=False).count() else None
        await self.close_overlays()

        # several paragraphs at once (shift-click), one condition around all of them
        self.doing = "condition: several paragraphs"
        await self.close_overlays()
        before = len(await self.logic_tags())
        await self.para(0)
        idx = await self.ev("()=>[...document.querySelectorAll('#paper p.lp.body')].map((p,i)=>[i,p.textContent.replace(/\\u00a0/g,' ').trim().length]).filter(x=>x[1]>25).map(x=>x[0])")
        second = pg.locator("#paper p.lp.body").nth(idx[1])
        await second.evaluate("e=>e.scrollIntoView({block:'center'})")
        bb = await second.bounding_box()
        await pg.keyboard.down("Shift")
        await pg.mouse.click(bb["x"] + bb["width"] - 8, bb["y"] + 6)
        await pg.keyboard.up("Shift")
        await self.settle(400)
        k = await self.ev("()=>window.__lt.state.sel.pids.length")
        self.expect(k >= 2, f"shift-click should select the paragraphs between two clicks, {k} selected")
        self.expect(await pg.get_by_text(f"{k} paragraphs", exact=False).count() >= 1, f"the panel doesn't say it is about {k} paragraphs")
        await self.pick_field("cbf-0", "dept")
        await pg.locator("#cbv-0").fill("Finance")
        await self.add_condition_btn()
        tags = await self.logic_tags()
        self.expect(len(tags) == before + 2, f"a condition around two paragraphs should add an if and an end if, got {tags[before:]}")
        # a click on the selected paragraph again unselects it
        await self.close_overlays()

        # the list: edit a tag by hand, move it, a click on its line in the letter, delete it
        self.doing = "condition: edit a tag in the list"
        lid = await self.ev("()=>{const l=window.__lt.state.logic.find(x=>x.place==='before' && /^\\{%-? *if/.test(x.text) && !x.sw); return l && l.id}")
        if self.expect(bool(lid), "no hand-added if tag to edit in the list"):
            li = pg.locator("[data-lg-key]").filter(has=pg.locator(f"#lgt-{lid}"))
            await li.locator("summary").click()
            box = pg.locator(f"#lgt-{lid}")
            await box.fill('{% if employee_schema.rating == "Z" %}')
            await box.press("Tab")
            await self.settle(500)
            self.expect(any('"Z"' in t for t in await self.logic_tags()), "editing a tag's text in the list didn't change the letter's tag")
            pos = pg.locator(f"#lgp-{lid}")
            if await pos.count():
                await pos.click()
                opts = pg.get_by_role("option")
                n = await opts.count()
                self.expect(n >= 2, "the position list of a tag has no choices")
                if n >= 2:
                    await opts.nth(1).click()
                    await self.settle(400)
                    self.expect(await self.ev("(id)=>window.__lt.state.logic.find(x=>x.id===id).place", lid) != "before", "choosing another position didn't move the tag")
            before_n = len(await self.logic_tags())
            await li.get_by_role("button", name="Delete this tag").click()
            await self.settle(500)
            self.expect(len(await self.logic_tags()) == before_n - 1, "Delete this tag didn't delete the tag")
            await pg.get_by_role("button", name="Undo", exact=True).click()
            await self.settle(400)
            self.expect(len(await self.logic_tags()) == before_n, "Undo didn't bring the deleted tag back")
        self.doing = "condition: a click on a condition line in the letter"
        await self.view("source")
        await self.tab("tags")
        line = pg.locator("#paper .lg-line", has_text="Only when").first
        if self.expect(await line.count() >= 1, "the letter shows no line for its condition"):
            await line.evaluate("e=>e.scrollIntoView({block:'center'})")
            await self.settle(300)
            await line.click()
            await self.settle(500)
            self.expect(await self.ev("()=>window.__lt.state.tab") == "logic", "a click on a condition line didn't open the Conditions step")
            self.expect(await self.ev("()=>!!window.__lt.state.condEdit"), "a click on an if line didn't open Change condition")
            await pg.get_by_role("button", name="Cancel").last.click()
            await self.settle(300)

        # the list shows them all, and undo takes them back
        n = await pg.locator("[data-lg-key]").count()
        self.expect(n >= 6, f"the Conditions list shows {n} items after adding many conditions")
        for _ in range(3):
            await pg.get_by_role("button", name="Undo", exact=True).click()
            await self.settle(200)
        for _ in range(3):
            await pg.get_by_role("button", name="Redo").click()
            await self.settle(200)
        await self.no_sideways_scroll("Conditions list")

    async def unplaced_and_merge(self):
        """Tags that lost their paragraph (a setup applied to another version of the letter) can be placed again; two versions combine."""
        pg = self.pg
        self.doing = "place unplaced tags"
        # a condition saved in a setup file, applied to a letter that doesn't have the paragraph
        await self.load_letter("northwind.docx")
        await self.tab("logic")
        await self.view("source")
        await self.para(2, clamp=True)
        await self.pick_field("cbf-0", "dept")
        await pg.locator("#cbv-0").fill("Finance")
        await self.add_condition_btn()
        await self.close_overlays()
        setup = await self.ev("()=>JSON.stringify(window.__lt.exportSetup())")
        data = json.loads(setup)
        for l in data.get("logic", []):
            l["anchor"] = {"text": "A paragraph that is not in any letter", "before": "zzz", "after": "zzz"}
            l.pop("pid", None)
            l["ctxB"], l["ctxA"] = "zzz", "zzz"
            l["text0"] = l.get("text")
        tmp = Path(tempfile.mkdtemp()) / "unplaced-setup.json"
        tmp.write_text(json.dumps(data))
        await self.load_letter("letterA.docx")
        await self.tab("doc")
        await self.choose(pg.get_by_role("button", name="Load setup file…").click, tmp)
        await self.settle(1000)
        await self.tab("logic")
        n = await self.ev("()=>window.__lt.state.unplaced.length")
        self.expect(n >= 1, "a setup whose condition has no matching paragraph left nothing to place (the test needs one)")
        if n:
            self.expect(await pg.get_by_role("button", name="Place it").count() >= 1, "tags that need a place have no 'Place it' button")
            await pg.get_by_role("button", name="Place it").first.click()
            await self.settle(300)
            self.expect(await pg.locator("#placeCancel").count() == 1, "'Place it' didn't ask for a paragraph")
            await self.para(3, clamp=True)
            self.expect(await self.ev("()=>window.__lt.state.unplaced.length") == n - 1, "clicking a paragraph didn't place the tag")
            if n > 1:
                await pg.get_by_role("button", name="Discard this tag").first.click()
                await self.settle(300)
        # (when the setup logic could still be placed there is nothing unplaced; the engine's parity test covers that path)

    # ------------------------------------------------------------------------------------------------ the assistant
    async def assistant_flows(self):
        """The Assistant panel with a faked agent: every control, then one proposed change applied and undone."""
        pg = self.pg
        self.doing = "the assistant"
        await self.load_letter("northwind.docx")
        await self.load_data("emps.csv")   # earlier stages may leave another data file loaded, and its columns decide which placeholders there are
        await self.view("source")
        if not await self.visible("[data-testid=assistant-panel]"):   # the header sweep may have opened it
            await pg.get_by_test_id("assistant-toggle").click()
        self.expect(await self.visible("[data-testid=assistant-panel]"), "the Assistant button did not open the panel")
        await self.click_all("[data-testid=assistant-panel]", limit=30)
        await self.no_sideways_scroll("assistant panel")
        await pg.wait_for_function("()=>window.__lt.state.rows.some(r=>r.count)")
        await self.ev("()=>{ const r=window.__lt.state.rows.find(r=>r.count); window.__lt.setRowKey(r.id, '') }")   # one placeholder without a tag to propose for
        await pg.get_by_test_id("assistant-input").fill("propose a tag")
        await pg.get_by_test_id("assistant-send").click()
        card = pg.get_by_test_id("proposal-card").last
        await card.wait_for(timeout=10000)
        self.expect(await card.get_attribute("data-status") == "pending", "a proposal was applied before the person said so")
        await card.get_by_test_id("proposal-apply").click()
        await pg.wait_for_function("()=>[...document.querySelectorAll('[data-testid=proposal-card]')].pop().dataset.status==='applied'", timeout=10000)
        await card.get_by_test_id("assistant-undo").click()
        await pg.wait_for_function("()=>[...document.querySelectorAll('[data-testid=proposal-card]')].pop().dataset.status==='undone'", timeout=10000)
        await pg.get_by_test_id("assistant-toggle").click()
        self.expect(not await self.visible("[data-testid=assistant-panel]"), "the Assistant button did not close the panel")
        await self.close_overlays()

    # ------------------------------------------------------------------------------------------------ combine several versions
    async def combine_flows(self):
        """Combine several versions: the home page entry, the screen (also on a phone and in dark mode), the result on the Conditions step."""
        self.doing = "combine several versions"
        pg = self.pg
        names = ["promotion", "variable-pay", "no-increase", "bonus-only"]
        files = [str(FIX / "versions" / f"{n}.docx") for n in names]
        await self.load_letter("letterA.docx")
        await self.tab("doc")
        async with pg.expect_file_chooser() as fc:
            await pg.get_by_role("button", name="Combine versions…").click()
        await (await fc.value).set_files(files)
        await self.settle(1200)
        self.expect(await self.visible("[data-testid=combine-screen]"), "choosing the versions didn't open the Combine screen")
        self.expect(await pg.get_by_test_id("combine-go").is_enabled(), "Combine needs setup before it works (nothing should be required)")
        # no "who gets which version" section any more: every version gets the automatic condition, changed later in Conditions
        self.expect(await pg.get_by_role("button", name="Set who gets which version (optional)").count() == 0, "the old who-gets-which section is still on the Combine screen")
        self.expect(await pg.get_by_role("combobox", name="Field that decides the version").count() == 0, "the field picker is still on the Combine screen")
        self.expect(await pg.get_by_test_id("combine-value-0").count() == 0, "a per-version value box is still on the Combine screen")
        self.expect(await pg.get_by_test_id("combine-problems").count() == 0, "the Combine screen shows an error with nothing wrong")
        # the yes / no fields can be renamed
        box = pg.get_by_test_id("combine-flag-name-0")
        self.expect(await box.count() == 1, "the Combine screen lists no yes / no fields")
        await box.fill("sweep_field")
        await box.press("Enter")
        await self.settle(200)
        self.expect(await pg.get_by_test_id("combine-flag-name-0").input_value() == "sweep_field", "renaming a yes / no field didn't stick")
        # the reorder arrows, the Show buttons, the checkbox
        await pg.get_by_role("button", name="Move no-increase up").click()
        await pg.get_by_role("button", name="Move no-increase down").click()
        for _ in range(8):   # each click turns that Show into Hide, so the next one is always the first left
            show = pg.get_by_test_id("combine-screen").get_by_role("button", name="Show", exact=True)
            if not await show.count():
                break
            await show.first.click()
        await pg.get_by_label("Ignore small differences in numbers and spacing").click()
        await pg.get_by_label("Ignore small differences in numbers and spacing").click()
        await self.settle(200)
        self.expect(await pg.get_by_test_id("combine-go").is_enabled(), "Combine turned off after valid edits")
        await self.no_sideways_scroll("combine screen")
        # a phone, and dark mode
        await pg.set_viewport_size({"width": 390, "height": 844})
        await self.settle(300)
        await self.no_sideways_scroll("combine screen on a phone")
        await pg.evaluate("()=>document.documentElement.setAttribute('data-theme','dark')")
        await self.settle(200)
        await self.no_sideways_scroll("combine screen in dark mode")
        await pg.evaluate("()=>document.documentElement.removeAttribute('data-theme')")
        await pg.set_viewport_size({"width": 1400, "height": 950})
        await self.settle(200)
        # combine: the Conditions step lists the new blocks, undo puts the letter back
        await pg.get_by_test_id("combine-go").click()
        await self.confirm_replace()
        await self.settle(1500)
        self.expect(not await self.visible("[data-testid=combine-screen]"), "the Combine screen stayed after Combine")
        self.expect(await self.ev("()=>window.__lt.state.tab") == "logic", "after combining the page isn't on the Conditions step")
        n = await self.ev("()=>window.__lt.state.logic.filter(l=>l.mg).length")
        self.expect(n >= 6, f"combining added only {n} if / else lines")
        self.expect(await self.ev("()=>{const f=window.__lt.state.combineFlags; const c=window.__lt.state.logic.filter(l=>/^\\{%-? *(if|elif)/.test(l.text)); return f.length>=2 && c.length>=3 && c.every(l=>f.some(x=>l.text.includes(x)))}"), "the combined if / elif lines are not on the yes / no fields of the Combine screen")
        await self.ev("()=>window.__lt.undo()")
        await self.settle(500)
        self.expect(await self.ev("()=>window.__lt.state.logic.length") == 0, "undo after combining left logic lines behind")
        await self.ev("()=>window.__lt.redo()")
        await self.settle(500)
        await self.click_all(PANEL, limit=12)
        # Cancel returns to the letter (or the home page)
        await self.tab("doc")
        async with pg.expect_file_chooser() as fc:
            await pg.get_by_role("button", name="Combine versions…").click()
        await (await fc.value).set_files(files[:1])
        await self.settle(800)
        self.expect(await self.visible("[data-testid=combine-hint]"), "one version gave no hint")
        await pg.get_by_test_id("combine-cancel").click()
        await self.settle(300)
        self.expect(not await self.visible("[data-testid=combine-screen]"), "Back to the letter didn't close the Combine screen")
        await self.close_overlays()

    # ------------------------------------------------------------------------------------------------ downloads
    async def downloads(self):
        pg = self.pg
        self.doing = "downloads"
        tmp = Path(tempfile.mkdtemp())

        async def grab(click, suffix, gate=False):
            async with pg.expect_download(timeout=60000) as dl:
                await click()
                if gate:   # open items: Download tagged .docx asks "Download anyway?" first
                    await self.settle(300)
                    if await self.visible("[data-testid=confirm-ok]"):
                        self.expect("Download anyway?" in await pg.get_by_role("dialog").inner_text(), "the gate before the .docx download isn't 'Download anyway?'")
                        await pg.get_by_test_id("confirm-ok").click()
            d = await dl.value
            path = tmp / d.suggested_filename
            await d.save_as(path)
            self.expect(d.suggested_filename.endswith(suffix), f"download named {d.suggested_filename}, expected …{suffix}")
            return path

        await self.view("tagged")
        docx = await grab(pg.get_by_role("button", name="Download tagged .docx").click, "-compup-template.docx", gate=True)
        try:
            with zipfile.ZipFile(docx) as z:
                self.expect("word/document.xml" in z.namelist(), "the tagged .docx has no word/document.xml")
                self.expect("{{" in z.read("word/document.xml").decode("utf-8", "ignore"), "the tagged .docx has no tags in it")
        except zipfile.BadZipFile:
            self.fail("the tagged .docx isn't a zip file")
        await self.settle(2300)
        csv = await grab(pg.get_by_role("button", name="Export mapping CSV").click, "-tag-mapping.csv")
        self.expect(csv.stat().st_size > 20, "the mapping CSV is empty")
        await self.tab("doc")
        tpl = await grab(pg.locator(PANEL).get_by_role("button", name="Get CSV template").click, ".csv")
        self.expect(tpl.stat().st_size > 5, "the CSV template is empty")
        setup = await grab(pg.locator(PANEL).get_by_role("button", name="Download setup file").click, ".json")
        try:
            json.loads(setup.read_text())
        except Exception:  # noqa: BLE001
            self.fail("the setup file isn't JSON")
        await self.tab("export")
        await grab(pg.locator(PANEL).get_by_role("button", name="Download tagged .docx").click, "-compup-template.docx", gate=True)
        # the setup file loads back
        await self.tab("doc")
        await self.choose(pg.get_by_role("button", name="Load setup file…").click, setup)
        await self.settle(800)
        self.expect(await pg.get_by_text("Restored your work on this letter").count() >= 1, "loading the setup file we just saved didn't say it restored the work")

    # ------------------------------------------------------------------------------------------------ checks
    async def check_tagged(self, name):
        self.doing = f"checking tagged template {name}"
        pg = self.pg
        await self.tab("check")
        await self.choose(pg.get_by_role("button", name="Check another tagged template…").click, name)
        await self.confirm_replace()
        await self.settle(2500)
        errs = await pg.locator("[data-issue-key][data-level=error]").count()
        if name.startswith("broken") and not errs:
            self.fail(f"{name}: the check found no problems in a template that has some")
        if name.startswith("broken"):
            await self.broken_template_checks(name)
        places = pg.locator(f"{PANEL} [role=group][aria-label='Where in the letter'] button")
        for k in range(min(3, await places.count())):
            if await places.nth(k).is_visible():
                await places.nth(k).click()
                await self.settle(200)
        await self.click_all(PANEL, limit=25)
        # employees per block and "Change condition" need the data file
        await self.load_data("emps.csv")
        await self.tab("logic")
        change = pg.get_by_role("button", name="Change condition")
        if await change.count() and await change.first.is_visible():
            self.doing = f"changing a condition in {name}"
            await change.first.click()
            await self.settle(300)
            await self.close_overlays(keep_inspector=True)
            chip = pg.locator(f"{INSPECTOR} [role=group][aria-label='Values in your data'] button").first
            if await chip.count():
                await chip.click()
                await self.settle(300)
            if await pg.get_by_role("button", name="Save condition").count():
                await pg.get_by_role("button", name="Save condition").click()
                await self.settle(800)
        await self.tab("check")
        for k in range(3):
            fixes = pg.locator(f"{PANEL} [data-issue-key]").get_by_role("button", name=re.compile(r"^(Use |Change |Add |Remove |Close |Fix )"))
            if await fixes.count() and await fixes.first.is_visible():
                self.doing = f"one-click fix in {name}"
                await fixes.first.click()
                await self.settle(800)
                await self.close_overlays()

    async def broken_template_checks(self, name):
        """Margin flags open their finding, its one-click fix removes it from the list, and the export checklist shows the errors."""
        pg = self.pg
        self.doing = f"margin flags and export checklist in {name}"
        await self.tab("export")
        rows = await self.ev("""()=>[...document.querySelectorAll('ul[aria-label=Readiness] li')].map(li=>li.textContent)""")
        validate = [r for r in rows if "Validate" in r]
        self.expect(bool(validate) and validate[0].startswith("Problem: Validate"), f"{name}: Preview & export doesn't show Validate as a problem ({validate[:1]})")
        self.expect(not any(r.startswith("Done: Validate") for r in rows), f"{name}: Preview & export says Validate is fine for a template with errors")
        # the export gate: errors block Download tagged .docx and point at Validate
        self.expect(not any(r.startswith("Done: Full check") for r in rows), f"{name}: the Full check line is green next to errors")
        await pg.get_by_role("button", name="Download tagged .docx").first.click()
        await self.settle(400)
        dlg = pg.get_by_role("dialog")
        self.expect(await dlg.count() == 1 and "Fix the errors first" in await dlg.inner_text(), f"{name}: Download tagged .docx with errors didn't stop with 'Fix the errors first'")
        self.expect(await pg.get_by_test_id("confirm-ok").inner_text() == "Go to Validate", f"{name}: the error gate has no 'Go to Validate' button")
        await pg.get_by_test_id("confirm-ok").click()
        await self.settle(400)
        self.expect(await self.ev("()=>window.__lt.state.tab") == "check", f"{name}: 'Go to Validate' didn't open Validate")
        await self.tab("check")
        await self.view("source")
        flags = pg.locator("#paper .mflag")
        n = await flags.count()
        if not n:
            self.fail(f"{name}: no margin flags on the letter, though the check found problems")
            return
        fixed = False
        for k in range(min(n, 8)):
            await pg.locator("#paper .mflag").nth(k).click()
            await self.settle(400)
            if not await self.visible("#inspector[data-kind=issue]"):
                self.fail(f"{name}: clicking margin flag {k + 1} didn't open the issue panel")
                return
            key = await self.ev("()=>document.querySelector('#paper .mflag.on')?.dataset.fk || ''")
            fix = pg.locator("#inspector button.ml-auto").filter(has_text=re.compile(r"^(Use |Change |Add |Remove |Close |Fix )"))
            if not await fix.count():
                continue
            await fix.first.click()
            await self.settle(1500)
            if key:
                still = await self.ev("(k)=>[...document.querySelectorAll('[data-issue-key]')].some(li=>k.startsWith(li.dataset.issueKey))", key)
                if still:
                    self.fail(f"{name}: the one-click fix in the issue panel left its finding in the Validate list")
            fixed = True
            break
        if not fixed:
            self.fail(f"{name}: none of the first margin flags offered a one-click fix")
        await self.close_overlays()

    async def employees(self):
        self.doing = "moving between employees"
        pg = self.pg
        for name in ["Next employee", "Next employee", "Previous employee"]:
            loc = pg.get_by_role("button", name=name)
            if await loc.count() and await loc.first.is_visible() and await loc.first.is_enabled():
                await loc.first.click()
                await self.settle(500)
        sel = pg.get_by_label("Employee", exact=True)
        if await sel.count() and await sel.first.is_enabled():
            await sel.first.select_option(index=1)
            await self.settle(500)
        search = pg.get_by_label("Search employees")
        if await search.count():
            await search.first.fill("zzzz-no-such-employee")
            await self.settle(400)
            await search.first.fill("")
            await self.settle(300)

    async def undo_redo(self):
        self.doing = "undo / redo"
        for key in ["Control+z", "Control+z", "Control+Shift+z", "Control+y"]:
            await self.pg.keyboard.press(key)
            await self.settle(150)
        await self.pg.get_by_role("button", name="Undo", exact=True).click() if await self.pg.get_by_role("button", name="Undo", exact=True).is_enabled() else None
        await self.pg.get_by_role("button", name="Redo").click() if await self.pg.get_by_role("button", name="Redo").is_enabled() else None

    async def tags_step(self):
        """The Tags step's own controls: search, the six filters, a manual text, tag settings."""
        pg = self.pg
        self.doing = "Tags step controls"
        await self.tab("tags")
        search = pg.get_by_label("Search placeholders by text or field")
        if await search.count():
            await search.fill("rating")
            await self.settle(300)
            await search.press("Escape")
            await self.settle(200)
            self.expect(await search.input_value() == "", "Esc in the search box didn't clear it")
        for name in ["Needs a tag", "To check", "Tagged", "In a condition", "Not in letter", "All"]:
            chip = pg.locator(PANEL).get_by_role("button", name=re.compile(rf"^{name}"))
            if await chip.count():
                await chip.first.click()
                await self.settle(120)
        box = await self.add_box()
        if await box.count():
            await box.fill("Annexure 1")
            await box.press("Enter")
            await self.settle(500)
        await self.close_overlays()

    async def letter_round(self, letter, data):
        await self.load_letter(letter, keep_edit=True)
        self.expect(await self.ev("()=>[window.__lt.state.tab, window.__lt.state.view]") == ["tags", "source"], f"{letter} did not open on Tags & fields with the client letter")
        for v in VIEWS:
            await self.view(v)
            if v == "source":
                await self.select_text()
        for d in data:
            await self.load_data(d)
        if len(data) > 1:
            await self.load_data(data[0], extra=True)
        await self.para_condition()
        if Path(letter).name == "letterA.docx":
            await self.tag_inspector(letter)
            await self.tags_step()
        for t in TABS:
            await self.tab(t)
            await self.click_all(PANEL, limit=25 if self.quick else 60)
            await self.no_sideways_scroll(f"{letter} {t}")
            for v in VIEWS:
                await self.view(v)
        await self.view("filled")
        await self.employees()
        await self.click_all("section[aria-label='Employee preview']", limit=10)
        await self.undo_redo()
        for v in VIEWS:
            await self.view(v)
        await self.click_all("header", limit=15)
        await self.click_all("nav[aria-label=Workflow]", limit=15)
        await self.close_overlays()

    async def editor_flows(self):
        """The Edit letter view: types, the save status, the engine's letter, undo of the editor change, Tag this text."""
        pg = self.pg
        await self.load_letter("northwind.docx", keep_edit=True)
        await self.tab("doc")
        await self.view("edit")
        await pg.wait_for_function("()=>!!window.__sd", timeout=20000)
        await self.settle(1200)
        run = pg.locator(".superdoc-text-run", has_text="Please find the revised").first
        await run.click()
        await pg.keyboard.press("End")
        await pg.keyboard.type(" EDITED")
        await pg.wait_for_function("()=>window.__lt.ed.status==='saved'", timeout=15000)
        self.expect(await self.ev("()=>window.__lt.state.an.paras.some(p=>p.model.text.includes('EDITED'))"), "the editor's text did not reach the letter")
        undo = pg.get_by_test_id("editor-undo")
        self.expect(await undo.count() == 1, "no 'Undo editor change' after a save")
        await undo.click()
        await self.settle(800)
        self.expect(not await self.ev("()=>window.__lt.state.an.paras.some(p=>p.model.text.includes('EDITED'))"), "'Undo editor change' did not restore the letter")
        await self.view("tagged")
        await self.view("edit")
        await self.settle(800)
        await self.tab("tags")      # another step leaves the editor
        self.expect(await self.ev("()=>window.__lt.state.view") == "source", "the Tags step stayed in the editor view")
        await self.view("source")

    async def mail_merge(self):
        """A Word mail-merge letter with an employee export: the group filter, merge-field checks, and Claude."""
        letter, data = MAILMERGE
        pg = self.pg
        await self.load_letter(letter)
        await self.load_data(data)
        self.doing = "mail-merge letter"
        n = await self.ev("()=>window.__lt.csvRows().length")
        self.expect(n == 4, f"expected the 4 employees whose Letter Template matches the file name, got {n}")
        await self.tab("check")
        self.expect(await pg.get_by_text("that merge field is really").count() > 0, "the merge field shown as «HRA» but coded BASIC wasn't flagged")
        await self.tab("tags")
        ai = pg.get_by_role("button", name="Suggest tags with Claude")
        if await ai.count():
            self.doing = "Claude: suggest tags"
            await ai.click()
            await self.settle(800)
            await self.click_all(PANEL, limit=8)
        await self.tab("check")
        ask = pg.get_by_role("button", name="Ask Claude")
        if await ask.count():
            await ask.first.click()
            await self.settle(300)
        review = pg.get_by_role("button", name="Review this template")
        if await review.count():
            self.doing = "Claude: review"
            await review.click()
            await self.settle(600)
            self.expect(await pg.get_by_text("fake review").count() > 0, "Claude's review didn't show")
        q = pg.get_by_label("Question for Claude")
        if await q.count():
            self.doing = "Claude: ask"
            await q.fill("which amounts are old?")
            await q.press("Enter")
            await self.settle(600)
            self.expect(await pg.get_by_text("fake answer").count() > 0, "Claude's answer didn't show")
        await self.view("source")
        await self.tab("logic")
        await self.para(4, clamp=True)
        ask_in = pg.get_by_label("Describe the condition")
        if await ask_in.count():
            self.doing = "Claude: condition from words"
            await ask_in.fill("promoted employees")
            await pg.get_by_role("button", name="Ask Claude").last.click()
            await self.settle(700)
            self.expect("promo" in await self.ev("()=>JSON.stringify(window.__lt.state.cb)"), "Claude's condition didn't fill the builder")
            await self.add_condition_btn()
        await self.close_overlays()
        for t in TABS:
            await self.tab(t)
            await self.click_all(PANEL, limit=20)

    async def export_flows(self):
        """The Preview & export step and the employee preview, through the UI (the old export smoke test)."""
        pg = self.pg
        self.doing = "Preview & export"
        await self.tab("export")
        await self.expect_readiness_link()
        await pg.get_by_role("button", name="Open employee preview").click()
        await self.settle(800)
        self.expect(await self.visible("[data-testid=pv-count]"), "the employee preview bar has no employee count")
        count = await pg.get_by_test_id("pv-count").inner_text()
        self.expect(count.startswith("Employee 1 of"), f"the preview should start at employee 1, said {count!r}")
        await pg.get_by_role("button", name="Next employee").click()
        await self.settle(500)
        self.expect((await pg.get_by_test_id("pv-count").inner_text()).startswith("Employee 2 of"), "Next employee didn't move to employee 2")
        await pg.get_by_label("Search employees").fill("meera")
        await self.settle(500)
        self.expect("match" in await pg.get_by_test_id("pv-count").inner_text(), "searching employees didn't show a match count")
        await pg.get_by_label("Search employees").fill("")
        # values used in the preview: edit one without losing the cursor, then reset
        await self.tab("export")
        toggle = pg.get_by_role("button", name="Show and change the values used in this preview")
        if await toggle.count():
            await toggle.click()
            box = pg.get_by_label("Value of first_name")
            if await box.count():
                await box.click()
                await box.press_sequentially("Zed")
                await box.press("Enter")
                await self.settle(500)
                self.expect("Zed" in await box.input_value(), "typing in a preview value lost the text")
                self.expect(await box.evaluate("e=>document.activeElement===e"), "typing in a preview value lost the cursor")
                await pg.get_by_role("button", name="Reset changed values").click()
                await self.settle(300)
        for sel_name, value in [("Your CSV columns are available in the template as", None), ("Numbers in the CSV", None)]:
            c = pg.get_by_label(sel_name)
            if await c.count():
                await c.first.click()
                await self.settle(150)
                await self.close_overlays()
        await self.view("tagged")

    async def expect_readiness_link(self):
        pg = self.pg
        link = pg.get_by_role("button", name="Go to Tags & fields")
        if await link.count():
            await link.first.click()
            await self.settle(300)
            self.expect(await self.ev("()=>window.__lt.state.tab") == "tags", "a readiness line didn't go to its step")
            await self.tab("export")

    async def run_batch(self, timeout):
        """Test every employee (the section is folded at first). Returns whether a test ran and finished."""
        pg = self.pg
        run = pg.get_by_role("button", name=re.compile(r"^Test \d+ employees?$"))
        if not await run.count():
            head = pg.get_by_role("button", name=re.compile(r"^Test every employee"))
            if await head.count():
                await head.first.click()
                await self.settle(300)
        if not await run.count():
            return False
        await run.first.click()
        await pg.get_by_text("employees tested in", exact=False).first.wait_for(timeout=timeout)
        return True

    async def validate_flows(self):
        """Validate: real Jinja status, counts, the employee test with its table, results download."""
        pg = self.pg
        self.doing = "Validate"
        await self.tab("check")
        await self.settle(1500)
        self.expect(await pg.get_by_role("list", name="Totals").count() == 1, "the Validate step shows no counts")
        if await self.run_batch(60000):
            only = pg.get_by_role("checkbox", name="Only employees with problems")
            if await only.count():
                await only.click()
                await self.settle(300)
            dl = pg.get_by_role("button", name="Download results (.csv)")
            if await dl.count():
                async with pg.expect_download() as d:
                    await dl.click()
                self.expect((await d.value).suggested_filename.endswith(".csv"), "the employee-test results didn't download as .csv")

    async def bad_files(self, letters):
        for bad in BAD_LETTERS:
            await self.load_letter(bad)
            self.expect(await self.pg.get_by_role("alert").count() > 0 or await self.pg.locator("[data-sonner-toast]").count() > 0, f"{bad}: no message was shown")
            await self.close_overlays()
        await self.load_letter(letters[0])
        for bad in BAD_DATA:
            await self.load_data(bad)
            self.expect(await self.pg.get_by_role("alert").count() > 0 or await self.pg.locator("[data-sonner-toast]").count() > 0, f"{bad}: no message was shown")
            await self.close_overlays()
        await self.load_letter("empty.docx")
        for v in VIEWS:
            await self.view(v)
        for t in TABS:
            await self.tab(t)
            await self.click_all(PANEL, limit=20)

    async def quick_wins(self):
        """Export gate with warnings, step ticks, where a new letter opens, the selection clearing on a step change, the leave-the-page guard."""
        pg = self.pg
        self.doing = "quick wins"
        await self.load_letter("letterA.docx", keep_edit=True)
        self.expect(await self.ev("()=>[window.__lt.state.tab, window.__lt.state.view]") == ["tags", "source"], "a letter that was just opened should start on Tags & fields with the client letter view")
        self.expect(await self.visible("[data-testid=seg-edit]"), "Edit letter is not one click away after opening a letter")
        # step ticks are green only for steps that were looked at (and have nothing open)
        for t in ("logic", "check", "export"):
            self.expect(await pg.locator(f"[data-testid=step-{t}]").get_attribute("data-done") is None, f"the {t} step shows a green tick before it was ever opened")
        # a selection does not follow you to the next step
        await self.drag_words(0, 0.4)
        self.expect(await self.visible("#inspector[data-kind=selection]") or await self.visible("#inspector"), "selecting words opened no inspector")
        await pg.locator("[data-testid=step-check]").click()
        await self.settle(400)
        self.expect(not await self.visible("#inspector[data-kind=selection]"), "the Selected text panel stayed open after changing step")
        self.expect(not await self.ev("()=>window.__lt.state.sel.text"), "the selected words stayed selected after changing step")
        # open items: Download tagged .docx asks first, listing them; Go back downloads nothing
        await self.tab("export")
        await pg.get_by_role("button", name="Download tagged .docx").first.click()
        await self.settle(400)
        dlg = pg.get_by_role("dialog")
        self.expect(await dlg.count() == 1 and "Download anyway?" in await dlg.inner_text(), "Download tagged .docx with open items didn't ask 'Download anyway?'")
        self.expect("Placeholders" in await dlg.inner_text(), "the 'Download anyway?' window doesn't list what is left")
        await pg.get_by_test_id("confirm-cancel").click()
        await self.settle(300)
        self.expect(await pg.get_by_role("dialog").count() == 0, "Go back left the window open")
        # the palette: a step name + Enter goes to that step
        await self.tab("tags")
        await pg.keyboard.press("Control+k")
        await self.settle(250)
        await pg.keyboard.type("valid")
        await self.settle(250)
        await pg.keyboard.press("Enter")
        await self.settle(400)
        self.expect(await self.ev("()=>window.__lt.state.tab") == "check", "typing 'valid' in the palette and pressing Enter didn't open Validate")
        # the leave-the-page guard: changes only in this browser ask before leaving; a setup file download clears it
        await self.tab("tags")
        await self.ev("()=>{const r=window.__lt.state.rows.find(r=>r.count); window.__lt.edit(r.id,{key:'custom_schema.qw_probe'}); window.__lt.recordUndo(); window.__lt.notify()}")
        guard = "()=>{const e=new Event('beforeunload',{cancelable:true}); window.dispatchEvent(e); return e.defaultPrevented}"
        self.expect(await self.ev(guard) is True, "closing the page with unsaved changes didn't ask first")
        await self.tab("doc")
        self.expect("only in this browser" in (await pg.locator(PANEL).inner_text()).lower() or "lives only in this browser" in (await pg.locator(PANEL).inner_text()).lower(), "no note that the autosave is only in this browser")
        async with pg.expect_download() as d:
            await pg.locator(PANEL).get_by_role("button", name="Download setup file").click()
        await d.value
        await self.settle(300)
        self.expect(await self.ev(guard) is False, "the page still asks before closing after the setup file was downloaded")
        await self.ev("()=>window.__lt.undo()")

    async def narrow(self):
        """A phone: the steps are a drawer, the inspector floats over the letter, nothing scrolls sideways."""
        self.doing = "phone width"
        pg = self.pg
        await pg.set_viewport_size({"width": 390, "height": 844})
        await self.settle(400)
        for v in VIEWS:
            await self.view(v)
            await self.no_sideways_scroll(f"phone {v}")
        for t in TABS:
            await self.tab(t)
            await self.settle(300)
            await self.no_sideways_scroll(f"phone {t}")
            await self.click_all("[role=dialog]", limit=12)
            await self.close_overlays()
        await self.view("source")
        await self.click_word(0)
        await self.no_sideways_scroll("phone selection")
        await self.close_overlays()
        await pg.set_viewport_size({"width": 1400, "height": 950})


async def team_library(browser, url, sw):
    """The team library on claude.ai: a fake window.claude with a shared database, and no /api calls at all."""
    sw.doing = "team library (fake claude.ai)"
    ctx = await browser.new_context(viewport={"width": 1400, "height": 950}, accept_downloads=True)
    page = await ctx.new_page()
    await page.add_init_script(INIT_CLAUDE)
    sw.wire(page)
    await page.goto(url)
    await page.wait_for_function("window.__lt && window.__lt.state", timeout=30000)
    await sw.settle(500)
    await page.get_by_role("button", name="Open the sample letter").click()
    await page.wait_for_function("window.__lt.state.built", timeout=30000)
    await sw.settle(500)
    await sw.tab("doc")
    panel = page.locator(PANEL)
    sw.expect(await panel.get_by_text("No clients yet").count() == 1, "the team library didn't start empty")
    await panel.get_by_role("button", name="New client").click()
    await page.get_by_label("New client name").fill("Acme Ltd")
    await page.get_by_label("New client name").press("Enter")
    await sw.settle(500)
    sw.expect(bool(await sw.ev("()=>Object.keys(window.__store.clients)")), "New client didn't save a client")
    sw.expect(await panel.get_by_text("Use the choices saved for Acme Ltd").count() == 1, "the new client wasn't picked")
    await panel.get_by_role("button", name=re.compile(r"^Save this letter's choices")).click()
    await sw.settle(500)
    sw.expect(await sw.ev("()=>Object.keys(window.__store.clients['acme-ltd'].labels).length") > 0, "the client's choices weren't saved")
    # the next letter for this client starts with those choices as suggestions, unless the box is unticked
    await sw.ev("()=>window.__lt.loadSample()")
    await sw.settle(1200)
    n = await sw.ev("()=>window.__lt.state.rows.filter(r=>/team library/i.test(r.how||'')).length")
    sw.expect(n > 0, "a letter opened for a client with saved choices shows no suggestion from the team library")
    await sw.tab("doc")
    cb = panel.get_by_role("checkbox", name=re.compile("Use the choices saved"))
    await cb.click()
    await sw.settle(400)
    sw.expect(await sw.ev("()=>window.__lt.state.rows.filter(r=>/team library/i.test(r.how||'')).length") == 0, "unticking 'Use the choices saved' still suggests the team's tags")
    await cb.click()
    await sw.settle(300)
    await page.get_by_label("Setup name").fill("Appraisal 2026")
    await page.get_by_role("button", name=re.compile(r"^Save setup")).click()
    await sw.settle(500)
    sw.expect(bool(await sw.ev("()=>Object.keys(window.__store.setups)")), "Save setup didn't save a setup")
    sw.expect(await panel.get_by_text("Appraisal 2026").count() >= 1, "the saved setup isn't listed")
    cb = panel.get_by_role("checkbox", name=re.compile("Use the choices saved"))
    await cb.click()
    await sw.settle(300)
    await cb.click()
    await sw.settle(300)
    await panel.get_by_role("button", name="Load Appraisal 2026").click()
    await sw.settle(600)
    sw.expect(await page.get_by_text("Restored your work on this letter").count() >= 1, "loading a saved team setup didn't report")
    await sw.click_all(PANEL, limit=25)
    await sw.close_overlays()
    await panel.get_by_role("button", name="Delete Appraisal 2026").click()
    await sw.settle(300)
    await page.locator("[data-testid=confirm-ok]").click()
    await sw.settle(500)
    sw.expect(not await sw.ev("()=>Object.keys(window.__store.setups).length"), "Delete setup didn't remove the setup")
    # downloads go through window.claude, not the browser
    await page.get_by_role("button", name="Export mapping CSV").click()
    await sw.settle(600)
    sw.expect(await sw.ev("()=>window.__saved.length") >= 1, "on claude.ai the mapping CSV should be saved through window.claude")
    sw.expect(await sw.ev("()=>window.__apiCalls.length") == 0, "on claude.ai the page must not call the Letter Studio back end")
    await ctx.close()


async def no_backend(browser, url, sw):
    """Letter Studio's own server missing (the page opened as a plain file): page checks only, and it says so."""
    sw.doing = "no back end"
    ctx = await browser.new_context(viewport={"width": 1400, "height": 950}, accept_downloads=True)
    page = await ctx.new_page()
    await page.route("**/api/**", lambda r: r.fulfill(status=404, body="no"))
    sw.wire(page)
    sw.api_404_ok = True   # a 404 on /api/health is the expected answer here
    await page.goto(url)
    await page.wait_for_function("window.__lt && window.__lt.state", timeout=30000)
    await page.get_by_role("button", name="Open the sample letter").click()
    await page.wait_for_function("window.__lt.state.built", timeout=30000)
    await sw.tab("check")
    await sw.settle(800)
    sw.expect(await page.get_by_text("The full check isn't available here").count() == 1, "without the back end the Validate step doesn't say the real Jinja check is unavailable")
    sw.expect(await page.get_by_role("button", name="Ask Claude").count() == 0, "an Ask Claude section shows without a back end")
    await sw.click_all(PANEL, limit=20)
    await sw.ev("""async()=>{ window.__lt.ingestCsv('first_name,rating\\nAsha,A\\nMeera,B','e.csv'); }""")
    await sw.settle(500)
    if await sw.run_batch(30000):
        sw.expect(await page.get_by_text("The full check (the engine CompUp uses)", exact=False).count() == 0, "a claim about real Jinja without a back end")
    sw.api_404_ok = False
    await ctx.close()


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", help="a running Letter Studio; default: start one")
    ap.add_argument("--letters", nargs="*", help="letters to use instead of the fixtures")
    ap.add_argument("--data", nargs="*", help="data files to use instead of the fixtures")
    ap.add_argument("--quick", action="store_true", help="fewer clicks per tab and 3 letters")
    ap.add_argument("--headed", action="store_true")
    ap.add_argument("--only", nargs="*", help="run only these stages (while fixing the page): sample selection tags nexttag tables shell conditions export validate downloads letters replace drop oldtags existing roundtrip editor merge combine assistant mailmerge tagged bad quickwins narrow nexttag tagfix team nobackend")
    ap.add_argument("--real-claude", action="store_true", help="don't fake the Claude API (needs ANTHROPIC_API_KEY on the server)")
    args = ap.parse_args()

    proc = None
    url = args.url
    if not url:
        proc, url = start_django()
    letters = [str(Path(x).resolve()) for x in args.letters] if args.letters else LETTERS
    data = [str(Path(x).resolve()) for x in args.data] if args.data else DATA
    if args.quick and not args.letters:
        letters = letters[:3]
    sw = None
    try:
        async with async_playwright() as p:
            browser = await launch(p, headless=not args.headed)
            ctx = await browser.new_context(viewport={"width": 1400, "height": 950}, accept_downloads=True)
            page = await ctx.new_page()
            sw = Sweep(page, quick=args.quick)
            if not args.real_claude:
                await fake_claude(page)
            await page.goto(url)
            await page.wait_for_function("window.__lt && window.__lt.state", timeout=30000)
            await sw.settle(800)
            await sw.first_run()
            sw.doing = "sample letter"
            await page.get_by_role("button", name="Open the sample letter").click()
            await page.wait_for_function("window.__lt.state.built", timeout=30000)
            await sw.settle(800)
            await sw.ev("()=>window.__lt.setView('source')")

            async def sample_stage():
                await sw.palette_all(limit=40)
                for t in TABS:
                    await sw.tab(t)
                    await sw.click_all(PANEL, limit=20)
                    await sw.no_sideways_scroll(f"sample {t}")

            if not args.only or "sample" in args.only:
                await sample_stage()
            await sw.load_data("emps.csv")

            async def letters_stage():
                for letter in letters:
                    await sw.letter_round(letter, data)

            async def tagged_stage():
                for name in TAGGED:
                    await sw.check_tagged(name)

            async def bad_stage():
                await sw.bad_files(letters)
                # load letters back to back while the other views are showing (the header bug)
                for v in VIEWS:
                    await sw.view(v)
                    for letter in letters[:3]:
                        await sw.load_letter(letter, keep_edit=True)

            stages = [("selection", sw.selection_rules), ("tags", sw.tag_editor_flows), ("tables", sw.tables_flows), ("shell", sw.shell_flows), ("conditions", sw.conditions_flows), ("export", sw.export_flows), ("validate", sw.validate_flows),
                      ("downloads", sw.downloads), ("letters", letters_stage), ("replace", sw.replace_dialog), ("drop", sw.drop_and_restore), ("oldtags", sw.old_tags_flow), ("existing", sw.existing_tags_flow), ("roundtrip", sw.condition_roundtrip),
                      ("editor", sw.editor_flows), ("merge", sw.unplaced_and_merge), ("mailmerge", sw.mail_merge), ("combine", sw.combine_flows), ("assistant", sw.assistant_flows), ("tagged", tagged_stage), ("bad", bad_stage), ("quickwins", sw.quick_wins), ("narrow", sw.narrow), ("nexttag", sw.next_to_tag_flows), ("tagfix", sw.tag_fix_flows),
                      ("team", lambda: team_library(browser, url, sw)), ("nobackend", lambda: no_backend(browser, url, sw))]
            for name, run in stages:
                if args.only and name not in args.only:
                    continue
                try:
                    await asyncio.wait_for(run(), timeout=900)
                except Exception as exc:  # noqa: BLE001 - one broken stage must not hide the others
                    shot = Path(tempfile.gettempdir()) / f"sweep-crash-{name}.png"
                    try:
                        await sw.pg.screenshot(path=str(shot))
                    except Exception:  # noqa: BLE001
                        pass
                    where = [f"{Path(f.filename).name}:{f.lineno}" for f in traceback.extract_tb(exc.__traceback__) if f.filename.endswith("sweep.py")][-1:]
                    sw.fail(f"stage {name} stopped at {where}: {str(exc).splitlines()[0][:300]} (screenshot: {shot})")
                    try:
                        await sw.close_overlays()
                    except Exception:  # noqa: BLE001
                        pass
            await browser.close()
    finally:
        if proc:
            proc.terminate()

    print(f"Clicked {sw.clicks} controls and made {sw.checks} checks across {len(letters)} letters.")
    if sw.errors:
        uniq = list(dict.fromkeys(sw.errors))
        print(f"\n{len(uniq)} problem(s):")
        for e in uniq:
            print(" -", e[:600])
        sys.exit(1)
    print("No errors.")


if __name__ == "__main__":
    asyncio.run(main())
