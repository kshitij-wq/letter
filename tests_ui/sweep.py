"""Click through the whole Letter Studio page and fail on any JavaScript error.

    python tests_ui/sweep.py                       # starts its own server on a free port
    python tests_ui/sweep.py --url http://127.0.0.1:8000/
    python tests_ui/sweep.py --letters my.docx --data my.xlsx --quick

Needs:  pip install playwright  and  python -m playwright install chromium
It loads each letter in each view, opens every tab, clicks every visible button,
selects text in the letter, loads the data files, moves between employees, uses undo/redo,
downloads, and asks the server for a PDF. Any page error, console error or failed
/api request is printed with what was being done at the time.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import socket
import subprocess
import sys
import time
from pathlib import Path
from urllib.request import urlopen

from playwright.async_api import async_playwright

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
FIX = HERE / "fixtures"
LETTERS = ["letterA.docx", "with_header.docx", "northwind.docx", "acme_tagged.docx", "oldtemplate.docx", "letterB.docx"]
TAGGED = ["broken_tagged.docx", "tagged_missing_field.docx", "conditions_tagged.docx"]   # loaded through "Check a tagged template"
DATA = ["emps.csv", "emps.xlsx"]
BAD_LETTERS = ["bad_not_a_docx.docx", "bad_no_body.docx"]
BAD_DATA = ["bad_empty.csv", "bad_header_only.csv", "bad.xlsx"]
VIEWS = ["source", "tagged", "filled"]
TABS = ["doc", "tags", "logic", "check", "export"]
# Buttons whose job is to leave the page or that only wait for a file picker
SKIP = {"inDoc", "inCsv", "inCsv2", "inMerge", "inSetup", "btnBatchStop", "btnSide"}   # btnSide hides the panels the sweep clicks in
IGNORE = ["favicon.ico", "fonts.googleapis", "fonts.gstatic", "ERR_ABORTED"]
MAILMERGE = ("ACME Letter - MHPromotion.docx", "employees_export.csv")   # Word merge fields + an export with a Letter Template column


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
        else:
            out = {"answer": "fake answer", "tags": ["{{ first_name }}"]}
        await route.fulfill(json=out)
    await page.route("**/api/health", health)
    await page.route("**/api/assist", assist)


def free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def start_server():
    port = free_port()
    env = {**os.environ, "LS_NO_BROWSER": "1", "DJANGO_DEBUG": "1"}
    proc = subprocess.Popen([sys.executable, "manage.py", "runserver", f"127.0.0.1:{port}", "--noreload"],
                            cwd=ROOT, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT)
    url = f"http://127.0.0.1:{port}/"
    for _ in range(60):
        try:
            urlopen(url + "api/health", timeout=1)
            return proc, url
        except Exception:  # noqa: BLE001 - still starting
            time.sleep(0.5)
    proc.kill()
    raise SystemExit("The server didn't start.")


class Sweep:
    def __init__(self, page, quick=False):
        self.pg = page
        self.quick = quick
        self.doing = "opening the page"
        self.errors = []
        self.clicks = 0
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

    def on_console(self, m):
        # expected problems (a damaged file) are logged as warnings; a programming error is still a bug
        if m.type == "error" or (m.type == "warning" and any(x in m.text for x in ("TypeError", "ReferenceError", "SyntaxError", "RangeError"))):
            self.fail(f"console {m.type}: {m.text}")

    def on_response(self, r):
        # 422 is the normal "this letter can't be filled" answer; anything else 4xx/5xx is a bug
        if "/api/" in r.url and r.status >= 400 and r.status != 422:
            self.fail(f"{r.request.method} {r.url} → {r.status}")

    async def settle(self, ms=250):
        await self.pg.wait_for_timeout(ms)

    async def close_overlays(self, keep_inspector=False):
        # a PDF opens a second or two after its button is clicked
        if await self.pg.evaluate("()=>!!window.__ltBusy"):
            await self.settle(500)
        # Esc also closes the inspector (and the side drawer on a narrow screen); between clicks inside the
        # inspector only close a field list, by leaving the field
        if keep_inspector and await self.pg.locator("#inspector").is_visible():
            await self.pg.evaluate("()=>document.activeElement && document.activeElement.blur && document.activeElement.blur()")
        else:
            await self.pg.keyboard.press("Escape")
        for sel in ["#pdfClose", "#closeCancel", "#placeCancel", "#swCancel", "#ceCancel"]:
            loc = self.pg.locator(sel)
            if await loc.count() and await loc.first.is_visible():
                try:
                    await loc.first.click(timeout=2000)
                except Exception:  # noqa: BLE001
                    pass

    async def load_letter(self, name):
        self.doing = f"loading {name}"
        await self.pg.set_input_files("#inDoc", str(name if Path(name).is_absolute() else FIX / name))
        await self.confirm_replace()
        await self.settle(1500)
        rb = self.pg.locator("#rbDismiss")
        if await rb.count() and await rb.is_visible():
            await rb.click()

    async def confirm_replace(self):
        """Opening a letter while one with changes is open asks first: say yes."""
        await self.settle(300)
        if await self.pg.locator("#dlg[open]").count():
            await self.pg.locator("#dlgOk").click()

    async def replace_dialog(self):
        """With changes in the open letter, loading another asks first; Cancel and Esc must keep the open one."""
        self.doing = "replace-letter window"
        await self.pg.evaluate("()=>recordUndo()")
        before = await self.pg.evaluate("()=>window.__lt.state.fileName")
        for how in ("cancel", "esc"):
            await self.pg.set_input_files("#inDoc", str(FIX / "letterB.docx"))
            await self.settle(400)
            if not await self.pg.locator("#dlg[open]").count():
                self.fail("replacing a letter that has changes didn't ask first")
                return
            if how == "cancel":
                await self.pg.locator("#dlgCancel").click()
            else:
                await self.pg.keyboard.press("Escape")
            await self.settle(400)
            if await self.pg.evaluate("()=>window.__lt.state.fileName") != before:
                self.fail(f"the replace-letter window ({how}) still replaced the open letter")

    async def load_data(self, name, extra=False):
        self.doing = f"loading data {name}"
        await self.pg.set_input_files("#inCsv2" if extra else "#inCsv", str(name if Path(name).is_absolute() else FIX / name))
        await self.settle(1500)

    async def view(self, v):
        await self.close_overlays()
        self.doing = f"view {v}"
        await self.pg.click(f'[data-view="{v}"]')
        await self.settle(600 if v == "filled" else 250)

    async def tab(self, t):
        await self.close_overlays()
        self.doing = f"tab {t}"
        loc = self.pg.locator(f"#tab-{t}")
        if await loc.count() and await loc.is_visible():
            await loc.click()
            await self.settle()

    async def click_all(self, scope, limit=60):
        """Click every visible, enabled button inside scope, re-reading the list after each click."""
        seen = set()
        for _ in range(limit):
            items = await self.pg.evaluate(
                """(scope)=>{
                  const root=document.querySelector(scope); if(!root) return [];
                  const els=[...root.querySelectorAll('button, summary, [role=button], .coll-btn')];
                  return els.map((el,i)=>{ const r=el.getBoundingClientRect(); const vis=r.width>0&&r.height>0&&getComputedStyle(el).visibility!=='hidden';
                    return {i, key:(el.id||'')+'|'+(el.textContent||'').trim().slice(0,40)+'|'+(el.dataset? JSON.stringify(el.dataset):''), id:el.id, vis, dis:!!el.disabled}; })
                  .filter(x=>x.vis && !x.dis);
                }""", scope)
            nxt = next((x for x in items if x["key"] not in seen and x["id"] not in SKIP), None)
            if not nxt:
                return
            seen.add(nxt["key"])
            self.doing = f"clicking “{nxt['key'].split('|')[1] or nxt['id']}” in {scope}"
            try:
                await self.pg.locator(f"{scope} :is(button, summary, [role=button], .coll-btn)").nth(nxt["i"]).click(timeout=3000)
            except Exception as exc:  # noqa: BLE001 - hidden, moved or covered since we listed it
                text = str(exc)
                if "intercepts pointer events" in text:
                    self.fail("a window stayed open over the page: " + text.split("from <")[-1][:120])
                    await self.close_overlays()
                elif "Timeout" not in text and "not visible" not in text:
                    self.fail(f"click failed: {text[:300]}")
            self.clicks += 1
            label = nxt["key"].lower()
            if "pdf" in label or "docx" in label or "word" in label:
                try:
                    await self.pg.wait_for_load_state("networkidle", timeout=60000)
                except Exception:  # noqa: BLE001
                    pass
                await self.settle(1200)
            else:
                await self.settle(200)
            await self.close_overlays(keep_inspector=True)

    async def check_tagged(self, name):
        self.doing = f"checking tagged template {name}"
        await self.pg.set_input_files("#inCheck", str(FIX / name))
        await self.confirm_replace()
        await self.settle(2500)
        if name.startswith("broken") and not await self.pg.locator("#checks li.ck.error").count():
            self.fail(f"{name}: the check found no problems in a template that has some")
        locs = self.pg.locator("#checks .loc")
        for k in range(min(3, await locs.count())):
            if await locs.nth(k).is_visible():
                await locs.nth(k).click()
                await self.settle(200)
        await self.click_all("#panel-check", limit=25)
        # employees per block and "Change condition" need the data file
        await self.load_data("emps.csv")
        await self.settle(1500)
        await self.tab("logic")
        await self.pg.evaluate("()=>document.querySelectorAll('.block.collapsed').forEach(b=>setBlockCollapsed(b,false))")
        edit = self.pg.locator("#logicList .lg-edit")
        if await edit.count() and await edit.first.is_visible():
            self.doing = f"changing a condition in {name}"
            await edit.first.click()
            await self.settle(300)
            await self.close_overlays(keep_inspector=True)
            pick = self.pg.locator("#selTools .cb-pick")
            if await pick.count():
                await pick.first.click()
                await self.settle(300)
            if await self.pg.locator("#ceSave").count():
                await self.pg.locator("#ceSave").click()
                await self.settle(800)
        await self.tab("check")
        await self.pg.evaluate("()=>document.querySelectorAll('.block.collapsed').forEach(b=>setBlockCollapsed(b,false))")
        fixes = self.pg.locator("#checks .ck-fix")
        for k in range(min(3, await fixes.count())):
            if await fixes.nth(0).is_visible():
                self.doing = f"one-click fix in {name}"
                await fixes.nth(0).click()
                await self.settle(800)
                await self.close_overlays()

    async def para_condition(self):
        """Click a paragraph, build a condition with the first value from the data, apply it."""
        self.doing = "adding a condition to a paragraph"
        await self.view("source")
        paras = self.pg.locator("#paper p.lp.body")
        if await paras.count() < 4:
            return
        await paras.nth(3).click(position={"x": 4, "y": 4})
        await self.settle(300)
        if not await self.pg.locator("#cbf-0").count():
            return
        await self.pg.locator("#cbf-0").fill("dept")
        await self.pg.locator("#cbf-0").dispatch_event("change")
        await self.settle(300)
        pick = self.pg.locator("#selTools .cb-pick")
        if await pick.count():
            await pick.first.click()
        else:
            await self.pg.locator("#cbv-0").fill("Finance")
        await self.settle(400)
        await self.click_all("#selTools .cb-foot", limit=3)
        await self.close_overlays(keep_inspector=True)
        if await self.pg.locator("#cbApply").count():
            await self.pg.locator("#cbApply").click()
            await self.settle(500)

    async def mail_merge(self):
        """A Word mail-merge letter with an employee export: the group filter, merge-field checks, and Claude."""
        letter, data = MAILMERGE
        await self.load_letter(letter)
        await self.load_data(data)
        self.doing = "mail-merge letter"
        n = await self.pg.evaluate("()=>csvRows().length")
        if n != 4:
            self.fail(f"expected the 4 employees whose Letter Template matches the file name, got {n}")
        await self.tab("check")
        if not await self.pg.locator("#checks li", has_text="that merge field is really").count():
            self.fail("the merge field shown as «HRA» but coded BASIC wasn't flagged")
        await self.tab("tags")
        if await self.pg.locator("#aiTags").count():
            self.doing = "Claude: suggest tags"
            await self.pg.locator("#aiTags").click()
            await self.settle(800)
        await self.tab("check")
        for sel in ["#aiReview", "#aiAsk"]:
            if await self.pg.locator(sel).count():
                self.doing = f"Claude: {sel}"
                if sel == "#aiAsk":
                    await self.pg.fill("#aiQ", "which amounts are old?")
                await self.pg.locator(sel).click()
                await self.settle(600)
        await self.view("source")
        paras = self.pg.locator("#paper p.lp.body")
        if await paras.count() > 4:
            await paras.nth(4).click(position={"x": 4, "y": 4})
            await self.settle(300)
            await self.close_overlays(keep_inspector=True)
            if await self.pg.locator("#selTools .cb-ai-go").count():
                self.doing = "Claude: condition from words"
                await self.pg.fill("#selTools .cb-ai-in", "promoted employees")
                await self.pg.locator("#selTools .cb-ai-go").click()
                await self.settle(600)
                if await self.pg.locator("#cbApply").count():
                    await self.pg.locator("#cbApply").click()
                    await self.settle(500)
        for t in TABS:
            await self.tab(t)
            await self.click_all(f"#panel-{t}", limit=20)

    async def select_text(self):
        self.doing = "selecting text in the letter"
        await self.pg.evaluate("""()=>{
          const paper=document.querySelector('#paper'); if(!paper) return;
          const walker=document.createTreeWalker(paper, NodeFilter.SHOW_TEXT); let n, picked=0;
          while((n=walker.nextNode())){ if(n.textContent.trim().length>12){ picked++; if(picked===3){
            const r=document.createRange(); r.setStart(n,0); r.setEnd(n,Math.min(10,n.textContent.length));
            const s=getSelection(); s.removeAllRanges(); s.addRange(r);
            paper.dispatchEvent(new MouseEvent('mouseup',{bubbles:true})); break; } } }
        }""")
        await self.settle(300)
        await self.click_all("#selTools", limit=12)
        await self.close_overlays()

    async def employees(self):
        self.doing = "moving between employees"
        for sel in ["#pvNext", "#pvNext", "#pvPrev"]:
            loc = self.pg.locator(sel)
            if await loc.count() and await loc.is_visible() and await loc.is_enabled():
                await loc.click()
                await self.settle(500)

    async def undo_redo(self):
        self.doing = "undo / redo"
        for key in ["Control+z", "Control+z", "Control+Shift+z", "Control+y"]:
            await self.pg.keyboard.press(key)
            await self.settle(150)

    async def letter_round(self, letter, data):
        await self.load_letter(letter)
        for v in VIEWS:
            await self.view(v)
            if v == "source":
                await self.select_text()
        for d in data:
            await self.load_data(d)
        if len(data) > 1:
            await self.load_data(data[0], extra=True)
        await self.para_condition()
        for t in TABS:
            await self.tab(t)
            await self.click_all(f"#panel-{t}", limit=25 if self.quick else 60)
            for v in VIEWS:
                await self.view(v)
        await self.view("filled")
        await self.employees()
        await self.click_all("#pvBar", limit=10)
        await self.undo_redo()
        for v in VIEWS:
            await self.view(v)
        await self.click_all("header, .topbar, #tabs", limit=15)
        await self.close_overlays()


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", help="a running Letter Studio; default: start one")
    ap.add_argument("--letters", nargs="*", help="letters to use instead of the fixtures")
    ap.add_argument("--data", nargs="*", help="data files to use instead of the fixtures")
    ap.add_argument("--quick", action="store_true", help="fewer clicks per tab")
    ap.add_argument("--headed", action="store_true")
    ap.add_argument("--real-claude", action="store_true", help="don't fake the Claude API (needs ANTHROPIC_API_KEY on the server)")
    args = ap.parse_args()

    proc = None
    url = args.url
    if not url:
        proc, url = start_server()
    letters = [str(Path(x).resolve()) for x in args.letters] if args.letters else LETTERS
    data = [str(Path(x).resolve()) for x in args.data] if args.data else DATA
    if args.quick and not args.letters:
        letters = letters[:3]
    try:
        async with async_playwright() as p:
            exe = os.environ.get("CHROMIUM_PATH")
            browser = await p.chromium.launch(headless=not args.headed, **({"executable_path": exe} if exe else {}))
            ctx = await browser.new_context(viewport={"width": 1400, "height": 950}, accept_downloads=True)
            page = await ctx.new_page()
            sw = Sweep(page, quick=args.quick)
            if not args.real_claude:
                await fake_claude(page)
            await page.goto(url)
            await page.wait_for_function("window.__lt && window.__lt.state && window.__lt.state.built", timeout=30000)
            await sw.settle(800)
            sw.doing = "sample letter"
            for t in TABS:
                await sw.tab(t)
                await sw.click_all(f"#panel-{t}", limit=20)
            for letter in letters:
                await sw.letter_round(letter, data)
            await sw.replace_dialog()
            await sw.mail_merge()
            for name in TAGGED:
                await sw.check_tagged(name)
            # broken files: each must give a message, not a crash
            for bad in BAD_LETTERS:
                await sw.load_letter(bad)
                await sw.close_overlays()
            await sw.load_letter(letters[0])
            for bad in BAD_DATA:
                await sw.load_data(bad)
            await sw.load_letter("empty.docx")
            for v in VIEWS:
                await sw.view(v)
            for t in TABS:
                await sw.tab(t)
                await sw.click_all(f"#panel-{t}", limit=20)
            # load letters back to back while the other views are showing (the header bug)
            for v in VIEWS:
                await sw.view(v)
                for letter in letters[:3]:
                    await sw.load_letter(letter)
            # narrow screen
            sw.doing = "phone width"
            await page.set_viewport_size({"width": 390, "height": 844})
            for v in VIEWS:
                await sw.view(v)
            for t in TABS:
                await sw.tab(t)
            await browser.close()
    finally:
        if proc:
            proc.terminate()

    print(f"Clicked {sw.clicks} buttons across {len(letters)} letters.")
    if sw.errors:
        uniq = list(dict.fromkeys(sw.errors))
        print(f"\n{len(uniq)} problem(s):")
        for e in uniq:
            print(" -", e[:600])
        sys.exit(1)
    print("No errors.")


if __name__ == "__main__":
    asyncio.run(main())
