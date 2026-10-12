"""Smoke test of the export area of the React page: Document step, employee preview bar, Preview & export step.

    python tests_ui/react/export.py        (set CHROMIUM_PATH if Playwright has no browser of its own)

Drives the real UI (clicks, typing, file choosers) and fails on any page error or failed expectation.
"""
import http.server
import os
import socketserver
import sys
import threading
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[2]
FIX = ROOT / "tests_ui" / "fixtures"
PAGE = ROOT / "renderer" / "frontend" / "index.html"
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


def main():
    srv = S(("127.0.0.1", 0), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    with sync_playwright() as p:
        exe = os.environ.get("CHROMIUM_PATH")
        b = p.chromium.launch(**({"executable_path": exe} if exe else {}))
        pg = b.new_context(viewport={"width": 1440, "height": 900}, accept_downloads=True).new_page()
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.on("console", lambda m: errors.append(m.text) if m.type == "error" and "404" not in m.text else None)
        pg.goto(f"http://127.0.0.1:{srv.server_address[1]}/")

        pg.click("text=Open the sample letter")
        expect(pg.get_by_test_id("doc-name")).to_contain_text("sample-appraisal-letter.docx")
        expect(pg.get_by_text("None loaded")).to_be_visible()

        # employee data: add, filter picked from the file name, add a second file, remove it again
        with pg.expect_file_chooser() as fc:
            pg.click('button:has-text("Add data file")')
        fc.value.set_files(str(FIX / "emps.csv"))
        expect(pg.get_by_test_id("data-name")).to_have_text("emps.csv")
        expect(pg.get_by_text("4 employees · 19 columns")).to_be_visible()
        with pg.expect_file_chooser() as fc:
            pg.click('button:has-text("Add another data file")')
        fc.value.set_files(str(FIX / "employees_export.csv"))
        expect(pg.get_by_role("button", name="Remove employees_export.csv")).to_be_visible()
        pg.get_by_role("button", name="Remove employees_export.csv").click()
        expect(pg.get_by_role("button", name="Remove employees_export.csv")).to_have_count(0)

        # a data file where the letter goes: the page says so instead of failing
        with pg.expect_file_chooser() as fc:
            pg.click('button:has-text("Check a tagged template")')
        fc.value.set_files(str(FIX / "emps.csv"))
        expect(pg.get_by_role("alert")).to_contain_text("Upload the tagged template as a Word .docx file")
        pg.get_by_role("button", name="Dismiss").click()

        # setup file round trip
        with pg.expect_download() as dl:
            pg.click('button:has-text("Download setup file")')
        setup = Path(dl.value.path())
        with pg.expect_file_chooser() as fc:
            pg.get_by_role("button", name="Load setup file…").click()
        fc.value.set_files(str(setup))
        expect(pg.get_by_text("Restored your work on this letter")).to_be_visible()
        expect(pg.get_by_text("The team library works when this tool is open on claude.ai")).to_be_visible()

        # Preview & export: readiness lines go to their step
        pg.get_by_role("tab", name="Preview & export").click()
        expect(pg.get_by_role("list", name="Readiness")).to_be_visible()
        pg.get_by_role("button", name="Go to Tags & fields").click()
        expect(pg.get_by_role("tab", name="Tags & fields", selected=True)).to_be_visible()
        pg.get_by_role("tab", name="Preview & export").click()

        # downloads
        with pg.expect_download() as dl:
            pg.click('button:has-text("Download tagged .docx")')
        assert dl.value.suggested_filename.endswith("-compup-template.docx")
        with pg.expect_download() as dl:
            pg.click('button:has-text("Export mapping CSV")')

        # preview settings and the employee preview
        pg.click('button:has-text("Open employee preview")')
        expect(pg.get_by_label("Employee preview", exact=True).first).to_be_visible()
        expect(pg.get_by_test_id("pv-count")).to_have_text("Employee 1 of 4")
        pg.get_by_role("button", name="Next employee").click()
        expect(pg.get_by_test_id("pv-count")).to_have_text("Employee 2 of 4")
        pg.get_by_label("Search employees").fill("meera")
        expect(pg.get_by_test_id("pv-count")).to_contain_text("1 of 4 match")
        pg.get_by_label("Search employees").fill("")

        # values: edit one without losing the cursor, then reset
        pg.get_by_role("button", name="Show and change the values used in this preview").click()
        box = pg.get_by_label("Value of first_name")
        expect(box).to_be_visible()
        box.click()
        box.press_sequentially("Zed")
        box.press("Enter")
        expect(box).to_be_focused()
        pg.wait_for_timeout(400)
        assert "Zed" in box.input_value(), box.input_value()
        pg.get_by_role("button", name="Reset changed values").click()
        expect(pg.get_by_role("button", name="Reset changed values")).to_have_count(0)

        # back to the tagged template; remove the data (confirm)
        pg.get_by_role("button", name="Back to tagged template").click()
        pg.get_by_role("tab", name="Document").click()
        pg.click('button:has-text("Remove")')
        pg.get_by_role("dialog").get_by_role("button", name="Remove").click()
        expect(pg.get_by_text("None loaded")).to_be_visible()
        b.close()
    if errors:
        print("PAGE ERRORS:", *errors, sep="\n  ")
        sys.exit(1)
    print("export smoke test passed")


if __name__ == "__main__":
    main()
