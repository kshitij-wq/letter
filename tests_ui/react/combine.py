"""Combine several versions, end to end, with the real page and real Jinja.

    python tests_ui/react/combine.py        (set CHROMIUM_PATH if Playwright has no browser of its own)

Drops the four made-up versions in tests_ui/fixtures/versions/ on the home page, picks the field and a value per version,
combines, downloads the tagged .docx, checks it with renderer.engine.validate_docx, fills it with docxtpl once per version
value and compares each result with that version's own text, paragraph for paragraph. Also: the preview in the page for each
value, undo back to the base, a file that is not a .docx, and one version only.
"""
import http.server
import io
import os
import socketserver
import sys
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "letterstudio.settings")
import django  # noqa: E402

django.setup()

from docx import Document  # noqa: E402
from playwright.sync_api import expect, sync_playwright  # noqa: E402

from renderer.engine import render_docx, validate_docx  # noqa: E402

FIX = ROOT / "tests_ui" / "fixtures"
VERS = FIX / "versions"
PAGE = ROOT / "renderer" / "frontend" / "index.html"
NAMES = ["promotion", "variable-pay", "no-increase", "bonus-only"]
VALUES = {"promotion": "promotion", "variable-pay": "variable", "no-increase": "none", "bonus-only": "bonus"}
FIELD = "employee_schema.case"
errors = []


class H(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_GET(self):
        if self.path.split("?")[0] in ("/", "/index.html"):
            b = PAGE.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(b)))
            self.end_headers()
            self.wfile.write(b)
        else:
            self.send_response(404)
            self.end_headers()


class S(socketserver.ThreadingMixIn, socketserver.TCPServer):
    daemon_threads = True
    allow_reuse_address = True


def doc_lines(source):
    """The text of a .docx in order: every non-empty paragraph, and a table as one line per row."""
    d = Document(source)
    out = []
    for el in d.element.body.iterchildren():
        tag = el.tag.split("}")[1]
        if tag == "p":
            t = "".join(x.text or "" for x in el.iter() if x.tag.endswith("}t")).strip()
            if t:
                out.append(t)
        elif tag == "tbl":
            for tr in el.iter():
                if tr.tag.endswith("}tr"):
                    cells = []
                    for tc in tr:
                        if tc.tag.endswith("}tc"):
                            cells.append(" ".join("".join(x.text or "" for x in p.iter() if x.tag.endswith("}t")) for p in tc if p.tag.endswith("}p")).strip())
                    out.append("| " + " | ".join(cells))
    return out


def main():
    srv = S(("127.0.0.1", 0), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    with sync_playwright() as p:
        exe = os.environ.get("CHROMIUM_PATH")
        b = p.chromium.launch(**({"executable_path": exe} if exe else {}))
        pg = b.new_context(viewport={"width": 1440, "height": 900}, accept_downloads=True).new_page()
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.on("console", lambda m: errors.append(m.text) if m.type == "error" and "404" not in m.text else None)
        url = f"http://127.0.0.1:{srv.server_address[1]}/"
        pg.goto(url)

        # --- a file that is not a .docx: plain error on the home page, no combine screen
        with pg.expect_file_chooser() as fc:
            pg.get_by_test_id("combine-entry").click()
        fc.value.set_files(str(FIX / "emps.csv"))
        expect(pg.get_by_role("alert")).to_contain_text("emps.csv is not a .docx file.")
        expect(pg.get_by_test_id("combine-screen")).to_have_count(0)

        # --- one version only: the screen opens with a hint and Combine stays off
        with pg.expect_file_chooser() as fc:
            pg.get_by_test_id("combine-entry").click()
        fc.value.set_files(str(VERS / "promotion.docx"))
        expect(pg.get_by_test_id("combine-screen")).to_be_visible()
        expect(pg.get_by_test_id("combine-hint")).to_contain_text("Add at least one more version")
        expect(pg.get_by_test_id("combine-go")).to_be_disabled()

        # a bad file next to good ones is named on the screen, the good ones are kept
        with pg.expect_file_chooser() as fc:
            pg.get_by_test_id("combine-add").click()
        fc.value.set_files([str(VERS / f"{n}.docx") for n in NAMES[1:]] + [str(FIX / "emps.csv")])
        expect(pg.get_by_test_id("combine-errors")).to_contain_text("emps.csv is not a .docx file.")
        for i, n in enumerate(NAMES):
            expect(pg.get_by_test_id(f"combine-label-{i}")).to_have_value(n)
        expect(pg.get_by_test_id("combine-go")).to_be_disabled()   # no conditions yet

        # --- the summary and the differences
        expect(pg.get_by_test_id("combine-summary")).to_contain_text("7 parts are the same in every version")
        expect(pg.get_by_test_id("combine-summary")).to_contain_text("3 places differ")
        region0 = pg.get_by_test_id("combine-region-0")
        expect(region0).to_contain_text("variable-pay")
        expect(region0).to_contain_text("We are pleased to confirm your promotion")

        # --- field and values
        pg.get_by_role("combobox", name="Field that decides the version").click()
        pg.get_by_placeholder("Search fields").fill(FIELD)
        pg.get_by_text(f"Use “{FIELD}” as the field").click()
        for i, n in enumerate(NAMES):
            pg.get_by_test_id(f"combine-value-{i}").fill(VALUES[n])
        expect(pg.get_by_test_id("combine-go")).to_be_enabled()
        expect(region0).to_contain_text("When")
        # two versions with the same value are refused in words
        pg.get_by_test_id("combine-value-3").fill("variable")
        expect(pg.get_by_test_id("combine-go")).to_be_disabled()
        expect(pg.get_by_test_id("combine-version-3")).to_contain_text("use the same value")
        pg.get_by_test_id("combine-value-3").fill("bonus")
        expect(pg.get_by_test_id("combine-go")).to_be_enabled()
        # reorder with the keyboard-reachable arrows: the base follows its version
        pg.get_by_role("button", name="Move bonus-only up").click()
        expect(pg.get_by_test_id("combine-label-2")).to_have_value("bonus-only")
        pg.get_by_role("button", name="Move bonus-only down").click()
        expect(pg.get_by_test_id("combine-label-3")).to_have_value("bonus-only")
        expect(pg.get_by_test_id("combine-base-0")).to_be_checked()

        # --- combine
        pg.get_by_test_id("combine-go").click()
        expect(pg.get_by_test_id("combine-screen")).to_have_count(0)
        expect(pg.get_by_test_id("step-logic")).to_have_attribute("aria-selected", "true")
        expect(pg.get_by_text("Combined 4 versions: 3 places differ").first).to_be_visible()
        assert pg.evaluate("window.__lt.HISTORY.undo.length") == 1, "combining must be one undo step"

        # --- download the tagged template
        pg.get_by_test_id("step-export").click()
        with pg.expect_download() as dl:
            pg.click('button:has-text("Download tagged .docx")')
        tagged = Path(dl.value.path()).read_bytes()

        # --- real Jinja: valid, and once per version value the same text as that version
        res = validate_docx(tagged)
        assert res["ok"], res["syntax"]
        for n in NAMES:
            out = render_docx(tagged, {"employee_schema": {"case": VALUES[n]}})
            got = doc_lines(io.BytesIO(out))
            want = doc_lines(VERS / f"{n}.docx")
            assert got == want, f"{n}: filled letter differs from the version\n got : {got}\n want: {want}"
        # a value nobody has: only the text that is the same everywhere
        other = doc_lines(io.BytesIO(render_docx(tagged, {"employee_schema": {"case": "zzz"}})))
        assert "Dear Asha Rao," in other and not any("variable pay" in x for x in other), other

        # --- undo restores the base letter in one step; redo brings the combined template back
        pg.get_by_role("button", name="Undo").first.click()
        pg.wait_for_timeout(300)
        n_logic = pg.evaluate("window.__lt.state.logic.length")
        assert n_logic == 0, f"undo left {n_logic} logic lines"
        pg.evaluate("window.__lt.build()")
        xml = pg.evaluate("window.__lt.state.built.xml['word/document.xml']")
        assert "After this year" not in xml and "We are pleased to confirm your promotion" in xml
        pg.get_by_role("button", name="Redo").first.click()
        pg.wait_for_timeout(300)
        assert pg.evaluate("window.__lt.state.logic.length") == 11

        # --- the preview in the page, once per value
        pg.click('button:has-text("Open employee preview")')
        pg.get_by_role("button", name="Show and change the values used in this preview").click()
        box = pg.get_by_label(f"Value of {FIELD}")
        for n in NAMES:
            box.fill(VALUES[n])
            box.press("Enter")
            pg.wait_for_timeout(500)
            text = pg.locator("#paper").inner_text()
            want = {
                "promotion": ("We are pleased to confirm your promotion", "Your new title is Senior Analyst.", "Please sign and return"),
                "variable-pay": ("Your variable pay for the year", "12 percent", "Please sign and return"),
                "no-increase": ("After this year's review", "stays at its current level", "Regards"),
                "bonus-only": ("Your variable pay for the year", "One-time bonus", "Please sign and return"),
            }[n]
            for w in want:
                assert w in text, f"preview for {n} lacks {w!r}"
            if n == "no-increase":
                assert "Please sign and return" not in text and "promotion to the next grade" not in text, "preview for no-increase shows other versions' text"
            if n == "promotion":
                assert "After this year's review" not in text
        pg.get_by_role("button", name="Back to tagged template").click()

        b.close()
    if errors:
        print("PAGE ERRORS:", *errors, sep="\n  ")
        sys.exit(1)
    print("combine test passed")


if __name__ == "__main__":
    main()
