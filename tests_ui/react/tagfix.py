"""Browser test of the tag fixes: the step badge matches what the panel shows, any text can be tagged, the Custom tag switch is always
there, a tag can be changed at one place only, and a detected placeholder can be removed ("Not a placeholder").

    python tests_ui/react/tagfix.py        (set CHROMIUM_PATH if Playwright has no browser of its own)
    SHOTS=/some/dir python tests_ui/react/tagfix.py    also saves screenshots there (tagfix-*.png)

The letter is made up here (an Expleo-style letter: a highlighted "PF/" in the reference, "Name" twice, a salary table with empty
cells, a header and a footer, one tag the letter already had).
"""
import csv
import os
import re
import sys
import tempfile
from pathlib import Path

import docx
from docx.enum.text import WD_COLOR_INDEX
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "letterstudio.settings")
import django  # noqa: E402

django.setup()
from renderer.engine import render_docx  # noqa: E402
sys.path.insert(0, str(ROOT / "tests_ui"))
from common import FIX, launch, start_static  # noqa: E402
SHOTS = Path(os.environ["SHOTS"]) if os.environ.get("SHOTS") else None
errors = []
fails = []


def check(ok, msg):
    if not ok:
        fails.append(msg)
        print("FAIL:", msg)
    return ok


def make_letter(path):
    d = docx.Document()
    d.sections[0].header.paragraphs[0].text = "Expleo Engineering header text"
    d.sections[0].footer.paragraphs[0].text = "Confidential footer text"
    p = d.add_paragraph("Ref: Expleo/HR/")
    r = p.add_run("PF/")
    r.font.highlight_color = WD_COLOR_INDEX.YELLOW
    p.add_run("26-27/001")
    d.add_paragraph("Name")
    d.add_paragraph("Emp ID")
    d.add_paragraph("Dear Name,")
    d.add_paragraph("Hello {{ first_name }}, your pay is revised as below.")
    t = d.add_table(rows=4, cols=3)
    for i, w in enumerate(["Component", "Monthly", "Annual"]):
        t.cell(0, i).text = w
    for i, w in enumerate(["Basic", "HRA", "Special allowance"], start=1):
        t.cell(i, 0).text = w
    d.save(path)


def shot(pg, name):
    if SHOTS:
        SHOTS.mkdir(parents=True, exist_ok=True)
        pg.screenshot(path=str(SHOTS / f"tagfix-{name}.png"))


def main():
    tmp = Path(tempfile.mkdtemp(prefix="tagfix-"))
    letter = tmp / "expleo-letter.docx"
    make_letter(letter)
    srv, _ = start_static()
    with sync_playwright() as p:
        b = launch(p)
        ctx = b.new_context(viewport={"width": 1440, "height": 900}, accept_downloads=True, color_scheme="light")
        pg = ctx.new_page()
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.on("console", lambda m: errors.append(m.text) if m.type == "error" and "404" not in m.text else None)
        pg.goto(f"http://127.0.0.1:{srv.server_address[1]}/")
        ev = pg.evaluate

        with pg.expect_file_chooser() as fc:
            pg.get_by_role("button", name="Choose the client's letter, a Word .docx file").click()
        fc.value.set_files(str(letter))
        pg.wait_for_timeout(1500)
        ev("()=>window.__lt.setView('source')")
        pg.get_by_test_id("step-tags").click()
        pg.wait_for_timeout(500)

        # ---- 1. the badge number is something the person can find ----
        todo = ev("()=>window.__lt.tagsTodo()")
        badge = pg.get_by_test_id("step-tags").get_by_test_id("step-count").inner_text().strip()
        check(badge == str(todo["total"]), f"badge {badge!r} != engine total {todo['total']}")
        check(todo["cells"] == 6, f"expected 6 empty table cells, got {todo['cells']}")
        notice = pg.get_by_test_id("tables-todo")
        check(notice.count() == 1 and notice.is_visible(), "no visible 'Salary tables' row at the top of the Tags list")
        m = re.search(r"(\d+) cells? in (\d+) tables?", notice.inner_text())
        check(bool(m) and int(m.group(1)) == todo["cells"], f"the notice doesn't say the cell count: {notice.inner_text()!r}")
        stats = ev("()=>window.__lt.inventoryStats()")
        check(todo["rows"] == stats["need"] + stats["check"], "the badge's placeholder part doesn't match the list's Needs a tag + To check")
        check(todo["total"] == stats["need"] + stats["check"] + int(m.group(1)), "badge != list items + table cells")
        shot(pg, "1-badge")
        pg.get_by_test_id("tables-todo-open").click()
        pg.wait_for_timeout(700)
        check(pg.locator("[data-table]").first.is_visible(), "Open on the Salary tables row didn't show the tables")
        pg.get_by_test_id("step-tags").click()

        # ---- 5. a detected placeholder can be removed ----
        names = ev("()=>window.__lt.state.rows.map(r=>r.find)")
        check("PF/" in names, f"the highlighted PF/ wasn't detected: {names}")
        pf = ev("()=>window.__lt.state.rows.find(r=>r.find==='PF/').id")
        n0 = ev("()=>window.__lt.tagsTodo().total")
        check(pg.locator("#paper .ph", has_text="PF/").count() >= 1, "PF/ isn't highlighted in the letter")
        pg.locator(f'[data-row-id="{pf}"]').click()
        pg.wait_for_timeout(400)
        insp = pg.locator("#inspector[data-kind=tag]")
        check(insp.is_visible(), "the PF/ row didn't open")
        shot(pg, "5-inspector")
        pg.get_by_test_id("insp-remove").click()
        pg.wait_for_timeout(500)
        check(pg.locator("#paper .ph", has_text="PF/").count() == 0, "PF/ is still highlighted after Not a placeholder")
        check(ev("()=>window.__lt.tagsTodo().total") == n0 - 1, "the badge didn't go down after removing PF/")
        check(ev("()=>!window.__lt.state.rows.some(r=>r.find==='PF/')"), "PF/ is still a row")
        check("PF/" in ev("()=>document.querySelector('#paper').innerText"), "the words PF/ are gone from the letter")
        check(pg.get_by_test_id("step-tags").get_by_test_id("step-count").inner_text().strip() == str(n0 - 1), "the step badge shows the old number")
        # Validate doesn't flag it either
        ev("()=>window.__lt.setTab('check')")
        pg.wait_for_timeout(400)
        check("PF/" not in (pg.locator("#step-panel, [data-testid=step-panel]").first.inner_text()), "Validate still mentions PF/")
        pg.get_by_test_id("step-tags").click()
        # it is in the Removed list, and Put back restores it
        if os.environ.get("DBG"):
            print(pg.get_by_role("group", name="Filter placeholders").inner_text(), ev("()=>window.__lt.inventoryStats()"))
        pg.get_by_role("group", name="Filter placeholders").get_by_role("button", name=re.compile("^Removed")).click()
        pg.wait_for_timeout(300)
        shot(pg, "5-removed-list")
        check(pg.get_by_role("button", name="Put PF/ back in the list").count() == 1, "no Put back button for PF/ in the Removed list")
        # undo restores it as well (one step)
        ev("()=>window.__lt.undo()")
        pg.wait_for_timeout(400)
        check(ev("()=>window.__lt.state.rows.some(r=>r.find==='PF/')"), "undo didn't bring PF/ back")
        check(ev("()=>window.__lt.tagsTodo().total") == n0, "undo didn't restore the badge number")
        # remove from the list row's X, from the Next to tag card, then put back from the Removed list
        pg.get_by_role("group", name="Filter placeholders").get_by_role("button", name=re.compile("^All")).click()
        pg.get_by_test_id(f"remove-{pf}").click()
        pg.wait_for_timeout(400)
        check(ev("()=>!window.__lt.state.rows.some(r=>r.find==='PF/')"), "the X on the list row didn't remove PF/")
        pg.get_by_role("group", name="Filter placeholders").get_by_role("button", name=re.compile("^Removed")).click()
        pg.get_by_role("button", name="Put PF/ back in the list").click()
        pg.wait_for_timeout(400)
        check(ev("()=>window.__lt.state.rows.some(r=>r.find==='PF/')"), "Put back didn't restore PF/")
        ev("()=>window.__lt.setFilter('all')")
        pg.wait_for_timeout(300)
        card = pg.get_by_test_id("next-card")
        if check(card.count() == 1, "no Next to tag card"):
            shown = card.locator("button.font-serif").inner_text().strip()
            card.get_by_test_id("next-remove").click()
            pg.wait_for_timeout(400)
            check(ev("(f)=>!window.__lt.state.rows.some(r=>r.find===f)", shown), f"Not a placeholder on the card didn't remove {shown!r}")
            ev("()=>window.__lt.undo()")
            pg.wait_for_timeout(300)

        # ---- 2. tag any text, anywhere ----
        def select_word(word, inside=None):
            """Select the first whole `word` the way a drag does (a real browser selection), then release the mouse over it."""
            return ev("""([w, inside]) => {
              const root = document.querySelector('#paper');
              const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
              let n;
              while ((n = walker.nextNode())) {
                const host = n.parentElement;
                if (inside && !host.closest(inside)) continue;
                if (!host.closest('p.lp')) continue;
                const i = n.textContent.indexOf(w);
                if (i < 0) continue;
                const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + w.length);
                const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
                host.scrollIntoView({block: 'center'});
                host.dispatchEvent(new MouseEvent('mouseup', {bubbles: true}));
                return true;
              }
              return false; }""", [word, inside])

        def tag_by_dblclick(sel, word, label):
            if not check(select_word(word, sel if sel != "#paper .tx" else None), f"{label}: {word!r} isn't in the letter"):
                return
            pg.wait_for_timeout(300)
            tb = pg.get_by_test_id("sel-toolbar")
            if not check(tb.count() == 1, f"{label}: no selection toolbar after double-clicking"):
                return
            pg.get_by_test_id("sel-tag").click()
            pg.wait_for_timeout(500)
            check(ev("(w)=>window.__lt.state.rows.some(r=>r.find===w)", word), f"{label}: {word!r} didn't become a row")
            check(ev("(w)=>{const r=window.__lt.state.rows.find(r=>r.find===w); return !!r && r.count>0}", word), f"{label}: the new row for {word!r} isn't in the letter")
            pg.keyboard.press("Escape")

        tag_by_dblclick("td", "Basic", "table cell")
        tag_by_dblclick("#paper .tx", "HR", "text in the reference line")
        hdr = pg.locator("#paper .tx").filter(has_text="Engineering")
        if check(hdr.count() > 0, "header text isn't shown in the letter"):
            tag_by_dblclick("#paper .tx", "Engineering", "header")
        tag_by_dblclick("#paper .tx", "Confidential", "footer")
        # words inside a detected placeholder ("PF" inside the highlighted PF/)
        check(select_word("PF", ".ph"), "no PF inside a placeholder to select")
        pg.wait_for_timeout(300)
        sel_text = ev("()=>window.getSelection().toString()")
        check(sel_text.strip() == "PF", f"the selection inside PF/ is {sel_text!r}")
        pg.get_by_test_id("sel-tag").click()
        pg.wait_for_timeout(500)
        check(ev("()=>window.__lt.state.rows.some(r=>r.find==='PF')"), "words inside the PF/ placeholder didn't become a row")
        check(ev("()=>window.__lt.state.rows.some(r=>r.find==='PF/')"), "tagging inside PF/ removed the PF/ row")
        pg.keyboard.press("Escape")
        # the same words again, at another place of the letter: Name has two places
        ev("()=>window.__lt.addManual('Name')")
        pg.wait_for_timeout(500)
        pg.keyboard.press("Escape")
        many = ev("()=>window.__lt.rowPlaces('g:Name').length")
        check(many == 2, f"expected two places for Name, got {many}")

        # ---- 3. the Custom tag switch is always there ----
        row = ev("()=>window.__lt.state.rows.find(r=>r.id==='g:Name')")
        check(row["key"] == "fx:full_name", f"Name should default to the full name, got {row['key']!r}")
        pg.locator('[data-row-id="g:Name"]').click()
        pg.wait_for_timeout(400)
        tog = pg.locator("#inspector").get_by_role("switch", name=re.compile("^Custom tag"))
        check(tog.count() == 1 and tog.is_visible(), "no Custom tag switch for the full name")
        tog.click()
        pg.wait_for_timeout(300)
        check(ev("()=>window.__lt.state.rows.find(r=>r.id==='g:Name').key") == "custom_schema.first_name + custom_schema.last_name", "the switch didn't write custom_schema. on both name fields")
        tog.click()
        pg.wait_for_timeout(300)
        check(ev("()=>window.__lt.state.rows.find(r=>r.id==='g:Name').key") == "first_name + last_name", "turning the switch off didn't remove custom_schema.")
        # first_name picked: still there
        pg.locator("#tag-key-0").click()
        pg.keyboard.type("first_name")
        pg.wait_for_timeout(250)
        pg.keyboard.press("Enter")
        pg.wait_for_timeout(300)
        check(tog.count() == 1 and tog.is_visible(), "the Custom tag switch hid on first_name")
        # a tag typed by hand: the switch stays, disabled, with the reason
        ev("()=>window.__lt.setRowKey('g:Name','')")
        ev("()=>window.__lt.setRowTag('g:Name','{{ first_name | upper }}')")
        pg.wait_for_timeout(300)
        check(pg.get_by_test_id("custom-reason").count() == 1, "a hand-written tag shows no reason next to the Custom tag switch")
        check(tog.is_disabled(), "the Custom tag switch isn't disabled for a hand-written tag")
        ev("()=>window.__lt.resetRowTag('g:Name')")
        ev("()=>window.__lt.setRowKey('g:Name','fx:full_name')")
        # a tag the letter already had
        pg.get_by_test_id("step-tags").click()
        old = pg.get_by_test_id("old-tag-first_name")
        if check(old.count() == 1, "the letter's own {{ first_name }} isn't listed"):
            check(old.get_by_test_id("custom-toggle").is_visible(), "no Custom tag switch on the existing first_name tag")

        # ---- 4. change one place only ----
        ev("()=>window.__lt.setFilter('all')")
        pg.locator('[data-row-id="g:Name"]').click()
        pg.wait_for_timeout(400)
        choice = pg.get_by_test_id("place-choice")
        check(choice.is_visible(), "no 'Change' choice for a text with two places")
        check("All 2 places" in choice.inner_text() and "Only this place" in choice.inner_text(), f"the choice is worded {choice.inner_text()!r}")
        check(pg.get_by_test_id("seg-all").get_attribute("data-state") == "on", "from the list the choice isn't 'All places'")
        # click the place in 'Dear Name,'
        dear = pg.locator("#paper .ph").filter(has_text="Name").nth(1)
        dear.scroll_into_view_if_needed()
        dear.click()
        pg.wait_for_timeout(500)
        check(pg.get_by_test_id("seg-one").get_attribute("data-state") == "on", "clicking a place in the letter doesn't default to 'Only this place'")
        lab = pg.get_by_test_id("place-label").inner_text()
        check("2 of 2" in lab and "Dear Name," in lab, f"the place line says {lab!r}")
        shot(pg, "4-only-this-place")
        depth = ev("()=>window.__lt.HISTORY.undo.length")
        pg.locator("#tag-key-0").click()
        pg.keyboard.type("first_name")
        pg.wait_for_timeout(250)
        pg.keyboard.press("Enter")
        pg.wait_for_timeout(600)
        check(ev("()=>window.__lt.HISTORY.undo.length") == depth + 1, "changing one place took more than one undo step")
        own = ev("()=>window.__lt.state.rows.filter(r=>r.scope==='one' && r.find==='Name').map(r=>({id:r.id,key:r.key}))")
        check(len(own) == 1 and own[0]["key"] == "first_name", f"no row of its own for Dear Name: {own}")
        check(ev("()=>window.__lt.state.rows.find(r=>r.id==='g:Name').key") == "fx:full_name", "the other place lost its tag")
        item = pg.locator("[data-row-id^='o:']").filter(has_text="Dear Name,")
        check(item.count() == 1 and "only here" in item.inner_text(), f"the list has no 'Name — Dear Name, · only here' row: {item.all_inner_texts()}")
        check(pg.get_by_test_id("place-merge").count() == 1, "no 'Use the same tag as the other places' on the place's own row")
        shot(pg, "4-own-row")
        # the built file and the preview
        data = tmp / "emps.csv"
        data.write_text((FIX / "emps.csv").read_text())
        ev("()=>window.__lt.setTab('doc')")
        with pg.expect_file_chooser() as fc:
            pg.get_by_role("button", name=re.compile("Add data file")).first.click()
        fc.value.set_files(str(data))
        pg.wait_for_timeout(1200)
        ev("()=>window.__lt.setTab('export')")
        pg.wait_for_timeout(300)
        with pg.expect_download() as dl:
            pg.click('button:has-text("Download tagged .docx")')
            pg.get_by_test_id("confirm-ok").click()   # other placeholders are still untagged: the gate asks first
        out = tmp / "tagged.docx"
        dl.value.save_as(str(out))
        paras = [x.text for x in docx.Document(str(out)).paragraphs]
        top = next(x for x in paras if x.strip().startswith("{{") and "last_name" in x)
        dear_p = next(x for x in paras if x.startswith("Dear"))
        check("first_name" in top and "last_name" in top, f"the top Name isn't the full name: {top!r}")
        check("first_name" in dear_p and "last_name" not in dear_p, f"Dear Name isn't first name only: {dear_p!r}")
        with open(data, newline="") as f:
            emp = next(csv.DictReader(f))
        (tmp / "filled.docx").write_bytes(render_docx(out.read_bytes(), emp))
        filled = [x.text for x in docx.Document(str(tmp / "filled.docx")).paragraphs]
        check("Asha Menon" in filled, f"the top Name didn't render as the full name: {filled}")
        check("Dear Asha," in filled, f"Dear Name didn't render as Dear Asha,: {filled}")
        ev("()=>window.__lt.setView('filled')")
        pg.wait_for_timeout(1500)
        text = ev("()=>document.querySelector('#paper').innerText")
        check("Dear Asha," in text and "Asha Menon" in text, f"the employee preview doesn't show both: {text[:300]!r}")
        ev("()=>window.__lt.setView('source')")
        # back to the same tag, and undo
        ev("()=>window.__lt.setTab('tags')")
        pg.wait_for_timeout(300)
        own_id = own[0]["id"]
        pg.locator(f'[data-row-id="{own_id}"]').click()
        pg.wait_for_timeout(300)
        pg.get_by_test_id("place-merge").click()
        pg.wait_for_timeout(400)
        check(ev("()=>window.__lt.state.rows.filter(r=>r.find==='Name').length") == 1, "'Use the same tag as the other places' didn't merge the row back")
        ev("()=>window.__lt.undo()")
        pg.wait_for_timeout(300)
        check(ev("()=>window.__lt.state.rows.filter(r=>r.scope==='one' && r.find==='Name').length") == 1, "undo of the merge didn't bring the place's row back")

        # a dark screenshot of the list and inspector
        ctx2 = b.new_context(viewport={"width": 1440, "height": 900}, color_scheme="dark")
        pg2 = ctx2.new_page()
        pg2.goto(f"http://127.0.0.1:{srv.server_address[1]}/")
        with pg2.expect_file_chooser() as fc:
            pg2.get_by_role("button", name="Choose the client's letter, a Word .docx file").click()
        fc.value.set_files(str(letter))
        pg2.wait_for_timeout(1500)
        pg2.evaluate("()=>{window.__lt.setView('source'); window.__lt.setTab('tags'); window.__lt.addManual('Name')}")
        pg2.wait_for_timeout(800)
        shot(pg2, "dark")
        ctx2.close()
        shot(pg, "light-end")
        b.close()
    if errors:
        print("PAGE ERRORS:", *errors, sep="\n  ")
        sys.exit(1)
    if fails:
        print(f"{len(fails)} check(s) failed")
        sys.exit(1)
    print("tag fixes test passed")


if __name__ == "__main__":
    main()
