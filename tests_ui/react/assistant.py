"""The Letter Assistant, driven through the real page. /api/assist is faked at the network layer (the real API is never called).

    python tests_ui/react/assistant.py        (set CHROMIUM_PATH when Playwright has no browser of its own)

The fake plays what Claude would answer (tool calls, then words); everything else is real: the page's tools, the proposal cards,
Apply / Reject / Undo, the engine's undo, the editor (flush before a tool reads, reload after a change) and real Jinja
(Django + docxtpl) on the result. Build the page first: python tools/build_frontend.py
"""
from __future__ import annotations

import asyncio
import io
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import editor as E  # noqa: E402  (open_letter, type_at_end, download, tags_in)
import validate as V  # noqa: E402
from playwright.async_api import async_playwright, expect  # noqa: E402

ok = V.ok
validate_docx, pydocx = E.validate_docx, E.pydocx
_n = 0


def tool(name: str, args: dict) -> dict:
    global _n
    _n += 1
    return {"type": "tool_use", "id": f"toolu_{_n}", "name": name, "input": args}


def say(text: str) -> dict:
    return {"type": "text", "text": text}


class Fake:
    """Answers /api/assist for the agent task from a queue of turns (lists of blocks, or (status, message) for an API failure)."""

    def __init__(self):
        self.queue: list = []
        self.requests: list[dict] = []

    def play(self, *turns):
        self.queue = list(turns)
        self.requests = []

    async def handle(self, route):
        body = json.loads(route.request.post_data or "{}")
        if body.get("task") != "agent":
            return await route.fulfill(status=200, content_type="application/json", body="{}")
        self.requests.append(body["payload"])
        item = self.queue.pop(0) if self.queue else [say("(the fake has nothing more to say)")]
        if isinstance(item, tuple):
            return await route.fulfill(status=item[0], content_type="application/json", body=json.dumps({"error": item[1], "kind": "assistant"}))
        stop = "tool_use" if any(b["type"] == "tool_use" for b in item) else "end_turn"
        await route.fulfill(status=200, content_type="application/json", body=json.dumps({"content": item, "stop_reason": stop}))


async def ask(page, text: str):
    await page.get_by_test_id("assistant-input").fill(text)
    await page.get_by_test_id("assistant-send").click()


async def idle(page):
    await expect(page.get_by_test_id("assistant-send")).to_be_visible(timeout=20000)


async def apply_card(page, n: int = 0):
    card = page.get_by_test_id("proposal-card").nth(n)
    await expect(card).to_have_attribute("data-status", "pending")
    await card.get_by_test_id("proposal-apply").click()
    await expect(card).to_have_attribute("data-status", "applied")
    return card


async def ev(page, js: str, arg=None):
    return await page.evaluate(js, arg)


async def main():
    proc, url = V.start_django()
    fake = Fake()
    try:
        async with async_playwright() as p:
            browser = await V.launch(p, args=["--no-sandbox"])

            # ---- 1. the sample letter, Claude ready: the panel, starters, read tools ----------------------------------
            ctx, page = await V.new_page(browser, url, claude_ready=True)
            await page.route("**/api/assist", fake.handle)
            page.set_default_timeout(20000)
            await page.get_by_role("button", name="Open the sample letter").click()
            await page.wait_for_function("window.__lt.state.an")
            await ev(page, "window.__lt.setView('source')")
            await ev(page, "t => window.__lt.ingestCsv(t, 'emps.csv')", (E.FIX / "emps.csv").read_text())
            await page.get_by_test_id("assistant-toggle").click()
            await expect(page.get_by_test_id("assistant-panel")).to_be_visible()
            ok(await page.get_by_role("button", name="Validate the whole letter").count() == 1, "the starter prompts are shown")

            fake.play([tool("get_validation", {})], [say("The letter has some warnings; nothing blocks it.")])
            await page.get_by_role("button", name="Validate the whole letter").click()
            await expect(page.get_by_test_id("msg-assistant")).to_contain_text("warnings")
            ok(await page.get_by_test_id("msg-work").filter(has_text="Ran the checks").count() == 1, "a read tool ran and is noted")
            ok(len(fake.requests) == 2 and "tool_result" in json.dumps(fake.requests[1]["messages"]), "the result went back to Claude")
            sent = json.dumps(fake.requests)
            ok(all(s not in sent for s in ("Asha", "Menon", "Ravi", "1140000")), "no employee names or amounts were sent")
            ok("first_name" in sent, "column names are sent")
            await idle(page)

            # ---- 2. insert a tag, then Undo it ---------------------------------------------------------------------------
            rid = await ev(page, "() => { const r = window.__lt.state.rows.find(r => r.find === '[Employee Code]'); window.__lt.setRowKey(r.id, ''); return r.id }")
            fake.play([tool("tag_text", {"row_id": rid, "field": "emp_code"})], [say("Tagged the employee code.")])
            await ask(page, "Tag the employee code")
            card = page.get_by_test_id("proposal-card").first
            await expect(card).to_have_attribute("data-status", "pending")
            ok(await ev(page, "id => window.__lt.state.rows.find(r => r.id === id).key", rid) == "", "nothing changes before Apply")
            await expect(card).to_contain_text("{{ emp_code }}")
            await card.get_by_test_id("proposal-apply").click()
            await expect(card).to_have_attribute("data-status", "applied")
            ok(await ev(page, "id => window.__lt.finalTag(window.__lt.state.rows.find(r => r.id === id))", rid) == "{{ emp_code }}", "Apply wrote the tag")
            await idle(page)
            await card.get_by_test_id("assistant-undo").click()
            await expect(card).to_have_attribute("data-status", "undone")
            ok(await ev(page, "id => window.__lt.state.rows.find(r => r.id === id).key", rid) == "", "Undo put the tag back as it was")

            # ---- 3. correct a tag -------------------------------------------------------------------------------------------
            rid = await ev(page, "() => window.__lt.state.rows.find(r => r.find === '[Department]').id")
            fake.play([tool("update_tag", {"row_id": rid, "field": "employee_schema.level"})], [say("Changed.")])
            await ask(page, "Fix the selected tag")
            await apply_card(page, 1)
            ok(await ev(page, "id => window.__lt.state.rows.find(r => r.id === id).key", rid) == "employee_schema.level", "a tag was corrected")
            await idle(page)

            # ---- 4. an if condition on a paragraph; real Jinja still passes; remove it ------------------------------------
            pid = await ev(page, "() => window.__lt.state.an.paras.find(p => !p.fallback && p.model.text.includes('Dear')).pid")
            fake.play([tool("wrap_paragraphs_in_condition", {"pids": [pid], "rules": [{"field": "employee_schema.level", "op": "is", "value": "L4"}]})], [say("Added.")])
            await ask(page, "Add a promotion condition")
            card = await apply_card(page, 2)
            ok(await ev(page, "() => window.__lt.state.logic.some(l => /if /.test(l.text))"), "a condition was added")
            await idle(page)
            blob = await ev(page, "async () => { const b = await window.__lt.buildBlob(); return Array.from(new Uint8Array(await b.arrayBuffer())) }")
            ok(validate_docx(bytes(blob))["syntax"] == [], "the built template passes real Jinja after the condition")
            key = await ev(page, "() => { window.__lt.computeLogic(); return window.__lt.state.lg.find(e => e.kw === 'if').key }")
            fake.play([tool("remove_condition", {"key": key})], [say("Removed.")])
            await ask(page, "Remove that condition")
            await apply_card(page, 3)
            ok(await ev(page, "() => window.__lt.state.logic.length") == 0, "the condition was removed")
            await idle(page)

            # ---- 5. if / else text ----------------------------------------------------------------------------------------------
            fake.play([tool("if_else_text", {"pids": [pid], "field": "employee_schema.level", "cases": [{"value": "L4", "text": "Version for L4"}], "otherwise_text": "Everyone else"})], [say("Done.")])
            await ask(page, "Give this paragraph a version for L4")
            await apply_card(page, 4)
            ok("Version for L4" in await ev(page, "() => window.__lt.state.built.xml['word/document.xml']"), "if / else text was built")
            await idle(page)

            # ---- 6. a table row: no tags yet (tool error), then tagged cells ---------------------------------------------------
            await ev(page, "() => window.__lt.runTableAction(window.__lt.state.tables[0], 'clear')")
            fake.play([tool("wrap_table_row_in_condition", {"table_id": "t0", "row": "Gratuity"})], [say("Those cells have no tags yet.")])
            await ask(page, "Show the Gratuity row only when it has a value")
            await expect(page.get_by_test_id("msg-work").filter(has_text="no tags yet")).to_be_visible()
            ok(await page.get_by_test_id("proposal-card").count() == 5, "a refused change makes no proposal")
            await idle(page)
            await ev(page, "() => window.__lt.runTableAction(window.__lt.state.tables[0], 'comp')")
            fake.play([tool("wrap_table_row_in_condition", {"table_id": "t0", "row": "Gratuity"})], [say("Done.")])
            await ask(page, "Show the Gratuity row only when it has a value")
            await apply_card(page, 5)
            ok(await ev(page, "() => window.__lt.state.tables[0].rows.find(r => r.label === 'Gratuity').hide"), "the table row is hidden when empty")
            await idle(page)

            # ---- 7. reject; an ambiguous request; a missing target; an API failure -----------------------------------------------
            rid = await ev(page, "() => window.__lt.state.rows.find(r => r.find === '[Employee Code]').id")
            snap = await ev(page, "() => JSON.stringify(window.__lt.snapState().rest)")
            fake.play([tool("tag_text", {"row_id": rid, "field": "emp_code"})], [say("Left alone.")])
            await ask(page, "Tag it")
            await expect(page.get_by_test_id("proposal-card").nth(6)).to_have_attribute("data-status", "pending")
            await page.get_by_test_id("proposal-reject").click()
            await expect(page.get_by_test_id("proposal-card").nth(6)).to_have_attribute("data-status", "rejected")
            ok(await ev(page, "() => JSON.stringify(window.__lt.snapState().rest)") == snap, "Reject changed nothing")
            await idle(page)
            fake.play([say("Which field should the amount use: CTC or the old CTC?")])
            await ask(page, "Tag the amount")
            await expect(page.get_by_test_id("msg-assistant").last).to_contain_text("Which field")
            ok(await page.get_by_test_id("proposal-card").count() == 7, "an ambiguous request makes no change, the model asks")
            await idle(page)
            fake.play([tool("tag_text", {"row_id": "g:nope", "field": "emp_code"})], [say("That text is not in the letter.")])
            await ask(page, "Tag the nonexistent thing")
            await expect(page.get_by_test_id("msg-work").filter(has_text="no placeholder").or_(page.get_by_test_id("msg-work").filter(has_text="There is no")).first).to_be_visible()
            await idle(page)
            fake.play((502, "Claude had a problem on its side. Try again in a minute."))
            await ask(page, "hello")
            await expect(page.get_by_role("alert").filter(has_text="problem on its side")).to_be_visible()
            V.PROBLEMS[:] = [x for x in V.PROBLEMS if "502" not in x]   # the browser logs the failed request we asked for
            await ctx.close()

            # ---- 8. the editor: unsaved typing is flushed before a tool reads; the editor reloads after a change ---------------
            ctx, page = await V.new_page(browser, url, claude_ready=True)
            await page.route("**/api/assist", fake.handle)
            page.set_default_timeout(20000)
            await E.open_letter(page, "acme_tagged.docx")
            await page.get_by_test_id("assistant-toggle").click()
            await E.type_at_end(page, "Dear", " zzqq")
            fake.play([tool("find_text", {"query": "zzqq"})], [say("Found it.")])
            await ask(page, "Where is zzqq?")
            await expect(page.get_by_test_id("msg-assistant")).to_contain_text("Found it")
            ok("zzqq" in json.dumps(fake.requests[1]["messages"]) and '"total\\":1' in json.dumps(fake.requests[1]["messages"]).replace(" ", ""), "words typed in the editor were saved before the tool read the letter")
            await idle(page)

            tagged = await ev(page, "() => { const p = window.__lt.state.an.paras.find(p => !p.fallback && /\\{\\{[^}]+\\}\\}/.test(p.model.text) && p.model.text.replace(/\\{\\{[^}]+\\}\\}/g, '').trim().length > 10); return { pid: p.pid, text: p.model.text } }")
            tags_before = await E.tags_in(page)
            bad = tagged["text"].replace("{{", "{{ x_").replace("x_ ", "x_", 1)
            fake.play([tool("replace_paragraph_text", {"pid": tagged["pid"], "new_text": bad})], [say("I could not keep the tags.")])
            await ask(page, "Reword it")
            await expect(page.get_by_test_id("msg-work").filter(has_text="stay exactly")).to_be_visible()
            ok(await page.get_by_test_id("proposal-card").count() == 0, "a reword that changes a tag is refused, with no proposal")
            await idle(page)
            new_text = "Greetings qqww " + tagged["text"][tagged["text"].index("{{"):]
            fake.play([tool("replace_paragraph_text", {"pid": tagged["pid"], "new_text": new_text})], [say("Reworded.")])
            await ask(page, "Reword it")
            await apply_card(page, 0)
            await expect(page.locator(".superdoc-text-run", has_text="Greetings qqww").first).to_be_visible(timeout=20000)
            ok(True, "the editor shows the reworded paragraph after Apply")
            ok(await E.tags_in(page) == tags_before, "every tag is still in the letter")
            blob = await E.download(page)
            ok(validate_docx(blob)["syntax"] == [], "the downloaded template passes real Jinja")
            ok(any("Greetings qqww" in q.text for q in pydocx.Document(io.BytesIO(blob)).paragraphs), "the downloaded .docx has the reworded text")
            await idle(page)
            await page.get_by_test_id("assistant-undo").click()
            await expect(page.locator(".superdoc-text-run", has_text="Greetings qqww")).to_have_count(0, timeout=20000)
            ok(True, "Undo puts the old words back in the editor")
            await ctx.close()

            await browser.close()
    finally:
        proc.kill()
    if V.PROBLEMS:
        print("\n".join(["", "PROBLEMS:"] + V.PROBLEMS))
        sys.exit(1)
    print("\nAssistant test passed.")


if __name__ == "__main__":
    asyncio.run(main())
