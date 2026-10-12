"""Smoke test of the Validate step in the React page, driven through the real UI (clicks, typing, file choosers).

    python tests_ui/react/validate.py

Starts its own Django server on a free port (real Jinja for the checks), fakes only /api/health (so Claude looks ready)
and /api/assist (never the real API), and fails on any page error or console error. Set CHROMIUM_PATH when Playwright
has no browser of its own. Build the page first: python tools/build_frontend.py
"""
from __future__ import annotations

import asyncio
import json
import os
import re
import socket
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

from playwright.async_api import async_playwright, expect

ROOT = Path(__file__).resolve().parent.parent.parent
FIX = ROOT / "tests_ui" / "fixtures"
READY = {"status": "ok", "app": "Letter Studio", "validate": True, "render": True, "assistant": {"ready": True, "model": "claude-test"},
         "versions": {"docxtpl": "0.20.2"}}
PROBLEMS: list[str] = []


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def start_server(port: int):
    proc = subprocess.Popen([sys.executable, "manage.py", "runserver", f"127.0.0.1:{port}", "--noreload"], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(60):
        try:
            urllib.request.urlopen(f"http://127.0.0.1:{port}/api/health", timeout=1)
            return proc
        except Exception:
            time.sleep(0.5)
    proc.kill()
    raise SystemExit("the Django server did not start")


def ok(cond: bool, what: str):
    print(("ok   " if cond else "FAIL ") + what)
    if not cond:
        PROBLEMS.append(what)


async def new_page(browser, url: str, *, claude_ready: bool = False, host: bool = False, viewport=(1440, 900)):
    ctx = await browser.new_context(viewport={"width": viewport[0], "height": viewport[1]}, accept_downloads=True)
    page = await ctx.new_page()
    page.on("pageerror", lambda e: PROBLEMS.append(f"page error: {e}"))
    page.on("console", lambda m: PROBLEMS.append(f"console error: {m.text}") if m.type == "error" else None)
    if host:   # claude.ai: no back end, the page must not probe it
        await page.add_init_script("window.claude = { complete: async () => '', storage: { get: async () => null, set: async () => null, list: async () => [], delete: async () => null } };")
    if claude_ready:
        await page.route("**/api/health", lambda r: r.fulfill(status=200, content_type="application/json", body=json.dumps(READY)))

        async def assist(route):
            req = json.loads(route.request.post_data or "{}")
            if req.get("task") == "review":
                out = {"summary": "One thing to look at.", "items": [{"severity": "fix", "title": "Header tag", "detail": "The filter is misspelled.", "quote": "first_name", "suggestion": "{{ first_name | upper }}"}]}
            else:
                out = {"answer": "The CTC comes from the new salary.", "tags": ["{{ ctc }}"]}
            await route.fulfill(status=200, content_type="application/json", body=json.dumps(out))
        await page.route("**/api/assist", assist)
    await page.goto(url)
    await page.wait_for_function("window.__lt && window.__ltUi")
    return ctx, page


async def go_validate(page):
    await page.get_by_role("tab", name=re.compile("Validate")).click()
    await expect(page.get_by_role("heading", name="Validate")).to_be_visible()


async def open_tagged(page, name: str):
    async with page.expect_file_chooser() as fc:
        await page.get_by_role("button", name="Check another tagged template…").click()
    chooser = await fc.value
    await chooser.set_files(str(FIX / name))


async def main():
    port = free_port()
    proc = start_server(port)
    url = f"http://127.0.0.1:{port}/"
    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(executable_path=os.environ.get("CHROMIUM_PATH"), args=["--no-sandbox"])

            # ---- 1. the sample letter, real Jinja, Claude ready -------------------------------------------------
            ctx, page = await new_page(browser, url, claude_ready=True)
            await page.get_by_role("button", name="Open the sample letter").click()
            await expect(page.locator("#paper .lp").first).to_be_visible()
            await go_validate(page)
            await expect(page.get_by_text("Real Jinja check passed")).to_be_visible(timeout=15000)
            ok(True, "real Jinja status line says passed")
            ok(await page.get_by_text("No problems found").count() == 0, "no success panel while warnings remain")
            ok(await page.get_by_role("list", name="Totals").count() == 1, "counts are shown")

            # ---- 2. a tagged template with two typing mistakes -----------------------------------------------------
            await open_tagged(page, "broken_tagged.docx")
            await expect(page.get_by_text("Real Jinja check failed: 2 typing mistakes")).to_be_visible(timeout=15000)
            ok(await page.get_by_text("Jinja syntax").count() > 0, "findings are grouped under their category")
            flagB = page.get_by_role("button", name="Issue B", exact=False)
            await expect(flagB.first).to_be_visible()
            ok(await page.locator("#paper .mflag").count() >= 2, "margin flags are drawn in the letter")

            # a click on a margin flag opens that issue
            await flagB.first.click()
            await expect(page.get_by_role("complementary", name="Issue B")).to_be_visible()
            await expect(page.get_by_text("Why it matters")).to_be_visible()
            ok(await page.locator("#paper .mflag.on").count() == 1, "the open issue's flag is ringed")
            await page.get_by_role("button", name="Locate in the letter").click()   # must not throw

            # the one-click fix removes the finding and the panel closes by itself
            await page.get_by_role("complementary", name="Issue B").get_by_role("button", name="Use | upper").click()
            await expect(page.get_by_role("complementary", name="Issue B")).to_have_count(0, timeout=10000)
            ok(True, "fixing an issue closes its panel")

            # Details on a row, fix from the list
            await page.get_by_role("button", name="Details", exact=False).first.click()
            await expect(page.get_by_role("complementary", name="Issue A")).to_be_visible()
            await page.keyboard.press("Escape")
            await expect(page.get_by_role("complementary", name="Issue A")).to_have_count(0)
            await page.get_by_role("button", name="Change = to ==").click()
            await expect(page.get_by_text("Real Jinja check passed")).to_be_visible(timeout=20000)
            res = page.get_by_role("button", name="Resolved", exact=False)
            if await res.count():
                await res.first.click()
                ok(True, "the Resolved list opens")

            # a category action jumps to the step where it is fixed
            act = page.get_by_role("button", name="Open conditions")
            if await act.count():
                await act.first.click()
                await expect(page.get_by_role("tab", name=re.compile("Conditions"))).to_have_attribute("aria-selected", "true")
                await go_validate(page)

            # ---- 3. test every employee --------------------------------------------------------------------------
            await expect(page.get_by_text("No employee data loaded")).to_be_visible()
            await page.get_by_role("button", name="Load employee data").click()
            await expect(page.get_by_role("tab", name=re.compile("Document"))).to_have_attribute("aria-selected", "true")
            csv = (FIX / "emps.csv").read_text()
            await page.evaluate("t => window.__lt.ingestCsv(t, 'emps.csv')", csv)
            await go_validate(page)
            await page.get_by_role("button", name="Test 4 employees").click()
            await expect(page.get_by_text("employees tested in", exact=False)).to_be_visible(timeout=30000)
            await expect(page.get_by_text("Real Jinja (the engine CompUp uses)", exact=False)).to_be_visible(timeout=30000)
            ok(True, "the employee test finishes and real Jinja reports")
            only = page.get_by_role("checkbox", name="Only employees with problems")
            if await only.count():
                await only.click()
                ok(await page.get_by_role("list", name="Employees").get_by_role("listitem").count() >= 4, "all employees listed after unticking the filter")
                await page.get_by_role("button", name="Preview", exact=False).first.click()
                await expect(page.get_by_role("radio", name="Employee preview")).to_have_attribute("aria-checked", "true") if await page.get_by_role("radio", name="Employee preview").count() else None
                await go_validate(page)
            dl = page.get_by_role("button", name="Download results (.csv)")
            if await dl.count():
                async with page.expect_download() as d:
                    await dl.click()
                ok((await d.value).suggested_filename.endswith(".csv"), "results download as a .csv")

            # ---- 4. Ask Claude (fake answers) ------------------------------------------------------------------------
            await page.get_by_role("button", name="Ask Claude").click()
            await page.get_by_role("button", name="Review this template").click()
            await expect(page.get_by_text("One thing to look at.")).to_be_visible()
            await page.get_by_label("Question for Claude").fill("Where does the CTC come from?")
            await page.get_by_label("Question for Claude").press("Enter")
            await expect(page.get_by_text("The CTC comes from the new salary.")).to_be_visible()
            ok(True, "Claude review and question work (faked)")

            # ---- 5. a long list stays light: 3000 employees ------------------------------------------------------------
            head, *lines = csv.strip().splitlines()
            big = "\n".join([head] + [lines[i % len(lines)].replace("E1", f"E{i}", 1) for i in range(3000)])
            await page.evaluate("t => window.__lt.ingestCsv(t, 'big.csv')", big)
            await page.get_by_role("button", name="Test 3000 employees").click()
            await expect(page.get_by_text("employees tested in", exact=False)).to_be_visible(timeout=120000)
            rows = await page.locator("[role=listitem][data-index]").count()
            ok(rows < 80, f"the employee table draws only the rows in view ({rows} of 3000)")
            await ctx.close()

            # ---- 6. Claude not set up (the real health answer): a setup note --------------------------------------------
            ctx, page = await new_page(browser, url)
            await page.get_by_role("button", name="Open the sample letter").click()
            await go_validate(page)
            await expect(page.get_by_text("Real Jinja check passed")).to_be_visible(timeout=15000)
            await page.get_by_role("button", name="Ask Claude").click()
            await expect(page.get_by_text("Claude can review this letter once it's set up.")).to_be_visible()
            await expect(page.get_by_text("Set up Claude (for whoever runs this tool)")).to_be_visible()
            await ctx.close()

            # ---- 7. claude.ai (no back end): page checks only, and it says so ---------------------------------------------
            ctx, page = await new_page(browser, url, host=True)
            await page.get_by_role("button", name="Open the sample letter").click()
            await go_validate(page)
            await expect(page.get_by_text("Real Jinja check isn't available here")).to_be_visible()
            ok(await page.get_by_role("button", name="Ask Claude").count() == 0, "no Ask Claude section without the back end")
            await page.evaluate("t => window.__lt.ingestCsv(t, 'emps.csv')", csv)
            await page.get_by_role("button", name="Test 4 employees").click()
            await expect(page.get_by_text("employees tested in", exact=False)).to_be_visible(timeout=30000)
            ok(await page.get_by_text("Real Jinja (the engine CompUp uses)", exact=False).count() == 0, "no claim about real Jinja without the back end")
            await ctx.close()

            await browser.close()
    finally:
        proc.kill()
    if PROBLEMS:
        print("\n".join(["", "PROBLEMS:"] + PROBLEMS))
        sys.exit(1)
    print("\nValidate smoke test passed.")


if __name__ == "__main__":
    asyncio.run(main())
