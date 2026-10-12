"""Parity test: the React page's engine must behave exactly like the old single-file page.

    python tests_ui/parity.py                 # every fixture letter, with and without data
    python tests_ui/parity.py --quick         # 3 letters
    python tests_ui/parity.py --only letterA  # scenarios whose name contains this

Both pages are served from a tiny local server and driven through the same scripted actions over `window.__lt`
(the old page is tests_ui/legacy/index.html, the new one renderer/frontend/index.html): load a letter, load data,
edit rows, tag table cells, add a manual row, add conditions, text by value, combine two versions, setup
export/import (same letter and another letter), undo/redo, preview and the employee test. After each step the two
pages are compared: the built .docx parts (document, headers, footers, settings), the Validate findings, the rows,
the mapping CSV, the setup JSON (minus timestamps and random ids), the table cells, the condition list, the filled
letter for the first employee and the employee-test counts. Any difference fails with a readable diff.

Needs:  pip install playwright  and a Chromium (set CHROMIUM_PATH if Playwright has none of its own).
"""
from __future__ import annotations

import argparse
import asyncio
import base64
import http.server
import json
import os
import socketserver
import sys
import threading
from pathlib import Path

from playwright.async_api import async_playwright

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
FIX = HERE / "fixtures"
LEGACY = HERE / "legacy" / "index.html"
NEW = ROOT / "renderer" / "frontend" / "index.html"
VENDOR = ROOT / "renderer" / "static" / "renderer" / "vendor"

LETTERS = ["letterA.docx", "with_header.docx", "northwind.docx", "acme_tagged.docx", "oldtemplate.docx", "letterB.docx",
           "conditions_tagged.docx", "broken_tagged.docx", "tagged_missing_field.docx"]
QUICK = ["letterA.docx", "northwind.docx", "conditions_tagged.docx"]
MAILMERGE = ("ACME Letter - MHPromotion.docx", "employees_export.csv")


# ---------------------------------------------------------------------------------------------- local server
class Handler(http.server.BaseHTTPRequestHandler):
    api = False   # True while the "server mode" run needs a stand-in for the Letter Studio back end
    log = []      # the /api/assist requests the page sent

    def log_message(self, *a):
        pass

    def _send(self, code, body=b"", ctype="text/plain"):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        p = self.path.split("?")[0]
        if p == "/legacy":
            html = LEGACY.read_text(encoding="utf-8").replace("__STATIC__/", "/")
            return self._send(200, html.encode("utf-8"), "text/html; charset=utf-8")
        if p == "/new":
            return self._send(200, NEW.read_bytes(), "text/html; charset=utf-8")
        if p.startswith("/vendor/") and (VENDOR / p[len("/vendor/"):]).is_file():
            return self._send(200, (VENDOR / p[len("/vendor/"):]).read_bytes(), "application/javascript")
        if p == "/api/health" and Handler.api:
            return self._send(200, json.dumps({"status": "ok", "app": "Letter Studio", "validate": True, "render": True, "assistant": {"ready": True, "model": "fake"},
                                               "versions": {"python": "3", "django": "5", "docxtpl": "0.20", "jinja2": "3.1"}}).encode(), "application/json")
        return self._send(404)   # without Handler.api neither page has its back end, so both stay in "claude.ai mode"

    def do_POST(self):
        body = self.rfile.read(int(self.headers.get("Content-Length") or 0))
        p = self.path.split("?")[0]
        if not Handler.api:
            return self._send(404)
        if p == "/api/validate":   # a canned answer: one typing mistake in the template and, with employees, one employee the letter can't be filled for
            out = {"syntax": [{"friendly": "A tag has a typing mistake: it isn't closed.", "tag": "{{ first_name", "part": "word/document.xml", "part_label": "Body", "line_text": "Dear {{ first_name"}],
                   "variables": ["first_name", "ctc"], "engine": {}}
            if b'name="employees"' in body:
                raw = body.split(b'name="employees"', 1)[1].split(b"\r\n\r\n", 1)[1].split(b"\r\n--", 1)[0]
                emps = json.loads(raw.decode("utf-8"))
                n = len(emps)
                Handler.log.append({"validate_employees": emps})
                out["employees"] = {"tested": n, "failed": [{"index": 1, "friendly": "'basic' is undefined", "tag": "{{ basic | float }}", "name": "basic"}] if n > 1 else []}
            return self._send(200, json.dumps(out).encode(), "application/json")
        if p == "/api/assist":
            req = json.loads(body.decode("utf-8") or "{}")
            task, pl = req.get("task"), req.get("payload") or {}
            if task == "suggest_tags":
                out = {"suggestions": [{"id": x["id"], "field": "custom_schema.basic1", "tag": "{{ custom_schema.basic1 | indian_comma }}", "confidence": ["high", "medium", "low"][k % 3], "reason": "stand-in"}
                                       for k, x in enumerate(pl.get("placeholders", [])[:5])], "notes": ["a note"], "_usage": {"input_tokens": 1}}
            elif task == "review":
                out = {"summary": "a review", "items": [{"severity": "fix", "title": "t", "detail": "d", "quote": "Dear", "suggestion": "{{ first_name }}"}]}
            elif task == "condition":
                out = {"condition": 'employee_schema.promotion_needed | lower | trim == "yes"', "explanation": "promoted employees", "assumptions": ["a"]}
            else:
                out = {"answer": "an answer", "tags": ["{{ ctc }}"]}
            Handler.log.append({"task": task, "payload": pl})   # what the page sent to Claude: compared between the pages
            return self._send(200, json.dumps(out).encode(), "application/json")
        return self._send(404)


def start_server():
    class S(socketserver.ThreadingMixIn, socketserver.TCPServer):
        daemon_threads = True
        allow_reuse_address = True
    srv = S(("127.0.0.1", 0), Handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, srv.server_address[1]


# ---------------------------------------------------------------------------------------------- the scripted run (runs in the page)
INIT = """
(() => { let seed = 987654321; Math.random = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; }; })();
"""

DRIVE = r"""
async (arg) => {
  const L = window.__lt;
  const legacy = !('paperHtml' in L);
  const F = n => (n in L) ? L[n] : (0, eval)(n);
  const st = L.state;
  const JS = L.JSZip || window.JSZip;
  const b64 = s => { const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; };
  const out = { snaps: {}, notes: {} };
  const clean = o => JSON.parse(JSON.stringify(o, (k, v) => (k === 'savedAt') ? undefined : v));
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const normSetup = s => {
    for (const l of (s.logic || [])) { delete l.id; if (l.sw) l.sw = 'SW'; }
    for (const l of (s.unplaced || [])) { delete l.id; if (l.sw) l.sw = 'SW'; }
    for (const o of (s.switchOps || [])) o.id = 'SW';
    for (const o of (s.tagOps || [])) delete o.id;
    return s;
  };
  const text = x => String(x).replace(/<[^>]+>/g, '');

  const snap = async (name) => {
    const s = {};
    try {
      F('build')();
      const b = st.built;
      s.xml = {}; for (const p of st.parts) s.xml[p.path] = b.xml[p.path];
      s.checks = b.checks.map(c => ({ level: c.level, html: c.html, tags: (c.tags || []).map(t => typeof t === 'string' ? t : JSON.stringify(t)), locs: c.locs, fix: c.fix ? c.fix.label : null }));
      s.rows = st.rows.map(r => ({ id: r.id, find: r.find, key: r.key, status: F('rowStatus')(r), tag: F('finalTag')(r), count: r.count, kind: r.kind, enabled: r.enabled, format: r.format, conf: r.conf, override: r.override, scope: r.scope, how: r.how }));
      s.mapping = F('mappingCsv')();
      s.setup = normSetup(clean(F('exportSetup')()));
      s.tables = st.tables.map(t => ({ id: t.id, enabled: t.enabled, hide: t.hide, cols: t.cols.map(c => ({ ci: c.ci, header: c.header, fmt: c.fmt, div12: c.div12 })),
        rows: t.rows.map(r => ({ ri: r.ri, label: r.label, hide: r.hide, cells: Object.fromEntries(Object.entries(r.cells).map(([k, v]) => [k, { key: v.key, override: v.override, src: v.src }])), tags: t.cols.map(c => F('tCellTag')(t, r, c)) })) }));
      F('computeLogic')();
      s.lg = st.lg.map(e => ({ kw: e.kw, text: e.text, status: e.status, depth: e.depth, src: e.src, place: e.place, page: e.p.page }));
      s.logic = st.logic.map(l => ({ pid: l.pid, place: l.place, text: l.text, offset: l.offset }));
      s.unplaced = (st.unplaced || []).map(u => ({ text: u.text, place: u.place, reason: u.reason }));
      s.meta = { fileName: st.fileName, pages: st.an.pages, paras: st.an.paras.length, existingTags: st.an.existingTags,
        csv: st.csv ? { mode: st.csv.mode, name: st.csv.name, headers: st.csv.headers || st.csv.keys, nrows: st.csv.rows && st.csv.rows.length } : null,
        extraKeys: [...st.extraKeys].sort(), csvHeaders: st.csvHeaders, typed: [...st.typed].sort(), tagOps: st.tagOps.length, switchOps: st.switchOps.length,
        matches: [...st.srcMatches.entries()].map(([pid, m]) => [pid, m.map(x => [x.s, x.e, x.row.id])]),
        dataFilter: st.dataFilter, csvUse: st.csvUse };
      // the downloadable .docx, unzipped
      const blob = await F('buildBlob')();
      const z = await JS.loadAsync(await blob.arrayBuffer());
      s.docx = {}; for (const n of Object.keys(z.files).sort()) if (/^word\/(document|header\d*|footer\d*|footnotes|endnotes|settings)\.xml$/.test(n)) s.docx[n] = await z.file(n).async('string');
      // what the engine tells the interface (the old page drew these into its panels; the new engine returns them as data)
      st.filter = 'all'; st.q = '';
      s.lists = {}; for (const f of ['all', 'need', 'check', 'tagged', 'cond', 'unused']) { st.filter = f; s.lists[f] = F('listRows')().map(r => r.id); }
      st.filter = 'all';
      s.rowText = st.rows.map(r => ({ id: r.id, conf: F('confText')(r), insp: F('inspNote')(r), infer: F('inferNote')(r), problem: F('tagProblem')(F('finalTag')(r)), field: F('rowField')(r), ctx: F('rowContext')(r) }));
      s.combo = F('comboOptions')(); s.condRows = [...F('condRowIds')()].sort();
      s.issues = st.issues.map(x => ({ cat: x.cat, letter: x.letter, idx: x.idx, key: x.key, level: x.level, locs: x.locs })); s.flags = F('ckFlagSpecs')().map(f => f.fk);
      s.claude = { columns: F('columnsForClaude')(), placeholders: F('placeholdersForClaude')(), letter: F('letterForClaude')(), findings: F('findingsForClaude')(), blocks: F('blocksForClaude')() };
      if (legacy) F('updateTabBadges')();
      const stepsNew = legacy ? null : L.stepInfo();
      s.steps = Object.fromEntries(['doc', 'tags', 'logic', 'check'].map(k => {
        const id = 'n' + k[0].toUpperCase() + k.slice(1);
        return legacy ? [k, { n: document.getElementById(id).textContent, done: document.getElementById('tab-' + k).classList.contains('done'), label: document.getElementById('tab-' + k).getAttribute('aria-label') }]
                      : [k, { n: String(stepsNew.info[k].n), done: !!stepsNew.done[k], label: stepsNew.info[k].label }];
      }));
      s.facts = F('exportFacts')();
      if (legacy) F('renderExportSummary')();
      s.checklist = legacy ? { items: [...document.querySelectorAll('#exportSummary .rd')].map(li => ({ kind: li.className.replace('rd rd-', ''), text: li.querySelector('.rd-text').textContent.replace(/^(Done: |Needs a look: |Problem: |Not done: )/, ''), step: (li.querySelector('.rd-go') || { dataset: {} }).dataset.step || '' })), warn: document.getElementById('exportWarn').hidden ? '' : document.getElementById('exportWarn').textContent }
        : (() => { const c = L.exportChecklist(); return { items: c.items.map(i => ({ kind: i.kind, text: `${i.label} — ${i.text}${i.sub}`, step: i.step })), warn: c.warn }; })();
      s.checkSummary = legacy ? (F('renderChecks')(), document.getElementById('checkSum').textContent) : L.checkSummaryText();
      // the letter as HTML in each view
      const paperOf = async (view) => {
        F('setView')(view);
        if (view === 'filled') await F('refreshPreview')();
        const html = legacy ? document.getElementById('paper').innerHTML.replace(/<div class="flag-layer">[\s\S]*$/, '') : L.paperHtml(view);
        const t = document.createElement('template'); t.innerHTML = html; return t.innerHTML.replace(/data-key="l[a-z0-9]{6,}/g, 'data-key="L');   // same markup whichever way the quotes were written; condition ids are random
      };
      s.paper = { source: await paperOf('source'), tagged: await paperOf('tagged'), filled: await paperOf('filled') };
      F('setView')('source');
      // existing tags in the letter (clean-up list)
      if (legacy) { F('renderOldTags')(); }
      const oldNew = legacy ? null : L.oldTagNames();
      const stTxt = { csv: 'In your data', compup: 'CompUp tag', nocsv: 'not checked (no CSV)' };
      const hasOld = F('existingTagInfo')().total > 0 || st.tagOps.length > 0;   // the old page leaves its list as it was when there is nothing to show
      s.oldTags = !hasOld ? [] : legacy ? [...document.querySelectorAll('#oldNames .nm')].map(li => ({ id: li.dataset.id, count: li.querySelector('.count').textContent, st: li.querySelector('.nm-st').textContent.replace(/\s+/g, ' ').trim() }))
        : oldNew.names.map(n => ({ id: n.id, count: `${n.count} time${n.count === 1 ? '' : 's'}`, st: n.status === 'unknown' ? `not in your data file${n.suggestion ? ` · did you mean ${n.suggestion}?` : ''}` : stTxt[n.status] }));
      // the values behind the preview, and what each tag prints
      if (legacy) F('renderPvPanel')();
      const SRC = { changed: 'Changed', data: 'Data', sample: 'Sample', notset: 'Not set', set: 'Set' };
      s.pvValues = legacy ? [...document.querySelectorAll('#pvGrid tbody tr')].map(tr => ({ id: tr.querySelector('.pv-in').dataset.id, value: tr.querySelector('.pv-in').value, source: tr.querySelector('.c-src').textContent }))
        : L.previewValues().rows.map(r => ({ id: r.id, value: r.value, source: SRC[r.source] }));
      s.tagPreview = [];
      for (const r of st.rows.filter(r => r.count).slice(0, 4)) {
        if (legacy) {
          F('openTagInspector')(r.id);
          for (let i = 0; i < 40 && /Checking…/.test(document.querySelector('#tagInspector .ins-pv').textContent); i++) await new Promise(res => setTimeout(res, 50));
          const box = document.querySelector('#tagInspector .ins-pv');
          s.tagPreview.push({ id: r.id, heading: document.querySelector('#tagInspector .ins-pv-h').textContent, text: box.textContent.trim(), note: document.querySelector('#tagInspector .ins-pv-src').textContent });
          F('closeTagInspector')();
        } else {
          const p = await L.previewTag(r);
          s.tagPreview.push({ id: r.id, heading: p.heading, text: String(p.text).trim(), note: p.note || '' });
        }
      }
      // conditions: the plain-English reading, the count and the employee check
      const demo = 'employee_schema.promotion_needed | lower | trim == "yes"';
      s.cbDemo = { english: F('condEnglish')(demo), count: await F('cbCount')(demo), emp: await F('cbEmployee')(demo) };
      // the filled letter for the first employee
      const comp = await F('getCompiled')();
      s.compileError = comp.error ? { msg: comp.error.msg, tag: comp.error.tag, part: comp.error.part } : null;
      if (!comp.error) {
        const nrows = F('csvRows')().length;
        const info = F('buildCtx')(nrows ? 0 : null);
        const r = F('renderEmployee')(comp, info.ctx);
        s.filled = { error: r.error, xml: r.xml, text: Object.values(r.xml).map(text).join('\n===\n'), issues: r.issues.map(i => i.msg) };
        s.employeeIssues = F('employeeIssues')(r, comp, info, F('csvKeyUniverse')(), nrows ? 0 : null).map(i => ({ level: i.level, key: i.key, msg: i.msg }));
        const sampled = [...info.sampled].sort(), fromCsv = [...info.fromCsv].sort(); s.ctxKeys = { sampled, fromCsv };
      }
    } catch (e) { s.error = String(e && e.stack || e).slice(0, 500); }
    out.snaps[name] = s;
  };
  const step = async (name, fn) => { try { await fn(); } catch (e) { out.notes[name] = 'threw: ' + String(e && e.message || e).slice(0, 200); } };
  const bodyParas = () => st.an.paras.filter(p => p.kind === 'body' && !p.fallback && !p.textbox && p.model.text.trim().length > 30);
  const applyCond = (other) => {
    if (legacy) {   // the old page reads the "Otherwise" box from the page
      const ta = document.createElement('textarea'); ta.id = 'cbOther'; ta.value = other || ''; document.body.appendChild(ta);
      try { F('applyParaCondition')(); } finally { ta.remove(); }
    } else F('applyParaCondition')(other || '');
  };

  await F('loadDocx')(b64(arg.letter), arg.name, false);
  await snap('load');
  if (arg.data) {
    await step('data', async () => { if (arg.dataKind === 'csv') F('ingestCsv')(arg.dataText, arg.dataName); else await F('ingestWorkbook')(b64(arg.data), arg.dataName); });
    await snap('data');
    // a second data file (matched on employee code) is merged into each employee's values
    await step('extra', async () => {
      const set = v => { if (legacy) (0, eval)('addingExtra=' + v); else L.flags.addingExtra = v; };
      set(true); try { F('ingestCsv')('emp_code,bonus_pct,grade\nE1,12,A\nE2,15,B\n', 'extra.csv'); } finally { set(false); }
    });
    await snap('extra');
  }
  await step('edits', async () => {
    const live = st.rows.filter(r => r.count);
    const set = (i, patch) => { if (live[i]) st.edits[live[i].id] = { ...(st.edits[live[i].id] || {}), ...patch }; };
    set(0, { key: 'ctc' }); set(1, { key: 'custom_schema.alpha' }); set(2, { key: 'employee_schema.level' }); set(3, { enabled: false });
    set(4, { override: '{{ first_name | upper }}' }); set(5, { key: 'old_ctc', format: 'indian_round' }); set(6, { reviewed: true });
    F('analyze')(); F('build')();
  });
  await snap('edits');
  await step('tables', async () => {
    for (const t of st.tables) {
      const row = t.rows[0]; if (row) F('tEditCell')(t, row, row.empties[0], { key: 'ctc' });
      if (t.rows[1]) F('tEditRowHide')(t, t.rows[1], true);
      F('tEditCol')(t, t.cols[0].ci, { div12: true, fmt: 'house' });
      F('tableAction')(t, 'comp'); if (st.csvHeaders.length) F('tableAction')(t, 'csv');
    }
    F('build')();
  });
  await snap('tables');
  await step('manual', async () => {
    const p = st.an.paras.find(p => !p.fallback && p.model.text.length > 40); if (!p) return;
    const m = p.model.text.match(/[A-Za-z]{6,}/); if (m) F('addManual')(m[0]);
  });
  await snap('manual');
  await step('tagops', async () => {
    const info = F('existingTagInfo')(); const first = [...info.names.keys()][0];
    if (first) F('addTagOps')([{ type: 'rename', from: first, to: 'custom_schema.' + first.split('.').pop() }], 'x');
  });
  await snap('tagops');
  await step('cond', async () => {
    const ps = bodyParas(); if (ps.length < 4) return;
    st.sel = { pids: [ps[0].pid], anchor: ps[0].pid, text: '' };
    st.cb = F('cbNew')('employee_schema.promotion_needed | lower | trim == "yes"'); applyCond('');
    F('addLogicAt')(ps[2].pid, 5, '{% if x == "y" %}'); F('addLogicAt')(ps[2].pid, 12, '{% endif %}'); F('afterLogicChange')();
    F('addLogic')(ps[3].pid, 'before', 'if ctc > 5'); F('addLogic')(ps[3].pid, 'after', 'endif'); F('afterLogicChange')();
    st.sel = { pids: [ps[1].pid], anchor: ps[1].pid, text: '' };
    st.cb = { rules: [{ field: 'employee_schema.rating', op: 'in', value: 'A, A+' }, { field: 'ctc', op: 'gt', value: '100000' }], join: 'and', raw: null }; applyCond('Otherwise this text\nand this line');
  });
  await snap('cond');
  await step('switch', async () => {
    const ps = bodyParas(); if (ps.length < 5) return;
    st.switchUi = { mode: 'para', pids: [ps[4].pid], field: 'employee_schema.rating', match: 'text', cases: [{ v: 'A', t: 'Text for A' }, { v: 'B, C', t: 'Text for B' }], other: 'Other text', where: 'replace' };
    F('applySwitch')();
  });
  await snap('switch');
  if (arg.mergeB) {
    await step('merge', async () => {
      await F('loadMergeB')(new File([b64(arg.mergeB)], arg.mergeName));
      st.mergeB.cond = 'employee_schema.promotion_needed | lower | trim == "yes"';
      out.notes.mergeHunks = st.mergeB.hunks.length;
      F('applyMerge')();
    });
    await snap('merge');
  }
  await step('blocks', async () => {
    await F('computeBlockCounts')();
    const b = st.blockCounts; out.blocks = b ? { total: b.total, failed: b.failed, byKey: [...b.byKey.entries()].map(([k, n]) => [/^l[a-z0-9]{8,}/.test(k) ? 'L' + k.replace(/^l[a-z0-9]+/, '') : k, n]) } : null;
  });
  await step('setup', async () => {
    const s = clean(F('exportSetup')()); out.notes.importReport = JSON.stringify(F('importSetup')(s));
  });
  await snap('afterSetup');
  await step('undo', async () => { F('undo')(); F('undo')(); F('redo')(); });
  await snap('undo');
  if (arg.data) {
    await step('batch', async () => {
      await F('runBatch')();
      const B = st.batch; out.batch = B ? { done: B.done, total: B.total, error: B.error || null, perEmp: B.perEmp, groups: [...(B.groups || [])].map(([k, g]) => [k, { level: g.level, msg: g.msg, count: g.count, emps: g.emps }]) } : null;
      out.batchCsv = B && B.groups ? F('batchCsv')() : null;
    });
    await step('pv', async () => {
      st.pvQuery = 'e'; out.pvMatches = F('pvMatches')(F('csvRows')());
      F('pvStep')(1); await sleep(200); out.pvIdxAfterStep = st.pvIdx; st.pvQuery = '';
      out.labels = F('csvRows')().map((_, i) => F('empLabel')(i));
      out.filterCols = clean(F('filterColumns')());
      F('setDataFilter')('promotion', 'yes'); out.filteredRows = F('csvRows')().length;
    });
    await snap('filtered');
    await step('unfilter', async () => { F('setDataFilter')(null); st.pvIdx = 1; });
    await snap('employee1');
  }
  // work saved in this browser comes back when the same letter is opened again
  await step('autosave', async () => {
    F('doAutosave')(); out.notes.saveStatus = F('saveStatusText')();
    out.notes.storageKeys = Object.keys(localStorage).filter(k => /^lt\.auto/.test(k)).length;
    await F('loadDocx')(b64(arg.letter), arg.name, false);
    const pr = st.pendingRestore;
    out.notes.pending = pr ? JSON.stringify({ edits: Object.keys(pr.edits).length, logic: pr.logic.length, tables: pr.tables.length, hasSource: !!pr.source }) : null;
    if (pr) out.notes.restoreReport = JSON.stringify(F('importSetup')(pr));
  });
  await snap('restored');
  // the preview filters (the page's copy of the CompUp / Python filters) on a spread of expressions
  await step('filters', async () => {
    const nj = await F('loadEngine')(); F('installPyString')(); const env = F('makeEnv')(nj);
    const ctx = { n: 1234567.891, s: '  Hello World  ', t: '12,00,000', z: '0', e: '', d: '05-04-2026', arr: [3, 1, 2], who: 'Female' };
    const exprs = ["n | indian_comma", "n | int | indian_comma", "n | round(0) | int | int_comma", "t | indian_comma", "t | float", "z | float | round(1)", "e | default('x', true)", "s | trim | upper", "s | title",
      "'{:,.2f}'.format(n)", "'{:.0f}'.format(n | float)", "'{:>10}|{:<6}|{:^7}'.format('a','b','c')", "'{:05d}'.format(42)", "'{:+.1f}'.format(3.14159)", "'{:.1%}'.format(0.256)", "'{0}-{1}'.format('x','y')",
      "d | format_date('%d-%m-%Y', '%d %B %Y')", "d | format_date('%d-%m-%Y', '%A, %b %-d, %Y')", "'05/13/2026' | format_date('%m/%d/%Y', '%B %d, %Y')", "arr | min", "arr | max", "arr | map('string') | length",
      "who | lower == 'female'", "'his' if who | lower == 'male' else 'her'", "'abc'.upper() ~ 'x'.zfill(3)", "'a,b'.startswith('a')", "n | float | round(2, 'floor')", "(n / 12) | round(0) | int", "None is none", "[1,2,3] | tojson",
      "'%s has %d items' | format('list', 3)", "n | abs", "missing | float"];
    out.filters = exprs.map(e => { try { return env.renderString('{{ ' + e + ' }}', ctx); } catch (err) { return 'ERR ' + String(err.message).split('\n').pop().slice(0, 80); } });
    out.notes.filtersN = exprs.length;
  });
  // the saved setup replayed on another letter (the anchored path of importSetup)
  await step('replay', async () => {
    const saved = clean(F('exportSetup')());
    await F('loadDocx')(b64(arg.other), arg.otherName, false);
    out.notes.replayReport = JSON.stringify(F('importSetup')(saved));
  });
  await snap('replay');
  return out;
}
"""


# "server mode": the pages talk to a stand-in for the Letter Studio back end (/api/health, /api/validate, /api/assist)
DRIVE_SERVER = r"""
async (arg) => {
  const L = window.__lt;
  const legacy = !('paperHtml' in L);
  const F = n => (n in L) ? L[n] : (0, eval)(n);
  const st = L.state;
  const server = F('server');
  const b64 = s => { const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const waitFor = async (fn, ms = 6000) => { const t = Date.now(); while (!fn()) { if (Date.now() - t > ms) return false; await sleep(25); } return true; };
  const clean = o => o === undefined ? null : JSON.parse(JSON.stringify(o, (k, v) => (k === 'savedAt') ? undefined : v));
  const out = { notes: {} };
  await waitFor(() => server.probed);
  out.probe = { ok: server.ok, app: server.info && server.info.app, aiReady: F('aiReady')(), seq0: server.seq };
  await F('loadDocx')(b64(arg.letter), arg.name, false);
  out.checked = await waitFor(() => server.check || server.err);
  out.check = clean(server.check); out.err = server.err;
  out.issues = st.issues.map(x => ({ cat: x.cat, level: x.level, real: !!x.real, html: x.html, letter: x.letter, locs: x.locs, fix: x.fix ? x.fix.label : null }));
  out.counts = clean(st.checkCounts);
  // a change makes the next real check look at the template as it would be downloaded
  F('recordUndo')();
  const live = st.rows.filter(r => r.count); if (live[0]) st.edits[live[0].id] = { key: 'ctc' };
  F('analyze')(); F('build')();
  await sleep(50); await waitFor(() => !server.checking && server.check && server.check.target === 'built');
  out.target = server.check && server.check.target;
  F('ingestCsv')(arg.dataText, arg.dataName);
  await F('runBatch')();
  await waitFor(() => st.batch && !st.batch.realRunning);
  const B = st.batch;
  out.batch = { done: B.done, total: B.total, real: clean(B.real), realErr: B.realErr || null, perEmp: B.perEmp, groups: [...B.groups.entries()].map(([k, g]) => [k, { level: g.level, msg: g.msg, count: g.count, emps: g.emps, real: !!g.real, tag: g.tag, name: g.name }]) };
  out.checklist = F('exportFacts')();
  // Claude
  await F('aiSuggestTags')();
  out.sugs = clean(st.claudeSugs); out.aiAfterTags = clean(st.ai);
  out.rowsAfterSugs = st.rows.map(r => ({ id: r.id, key: r.key, how: r.how, conf: r.conf, override: r.override, status: F('rowStatus')(r) }));
  await F('aiReview')();
  if (legacy) { F('renderAi')(); document.querySelector('#aiQ').value = 'Which amounts come from the old salary?'; await F('aiAsk')(); }
  else await F('aiAsk')('Which amounts come from the old salary?');
  out.aiFinal = clean(st.ai);
  st.cb = F('cbNew')('');
  if (legacy) { document.querySelector('#selTools').insertAdjacentHTML('beforeend', '<input class="cb-ai-in" value="promoted people whose PLI changed">'); await F('aiCondition')(document.createElement('button')); }
  else await F('aiCondition')('promoted people whose PLI changed');
  out.cb = clean(st.cb); out.cbNote = st.cbNote; out.cbAsk = st.cbAsk;
  return out;
}
"""

# "claude.ai mode": window.claude exists (team library in its database, downloads); the Letter Studio back end does not
INIT_CLAUDE = """
(() => {
  const store = { clients: {}, setups: {} }, subs = [], saved = [];
  const snap = (coll, filter) => ({ docs: Object.entries(store[coll]).filter(([id, d]) => !filter || d[filter[0]] === filter[1]).map(([id, d]) => ({ id, exists: true, data: () => JSON.parse(JSON.stringify(d)) })) });
  const fire = coll => { for (const s of [...subs]) if (s.coll === coll) setTimeout(() => s.cb(snap(coll, s.filter)), 0); };
  const q = (coll, filter) => ({ where: (f, op, v) => q(coll, [f, v]), onSnapshot: (cb) => { const s = { coll, filter, cb }; subs.push(s); setTimeout(() => cb(snap(coll, filter)), 0); return () => { const i = subs.indexOf(s); if (i >= 0) subs.splice(i, 1); }; } });
  const db = { collection: coll => q(coll, null), doc: path => { const [coll, ...rest] = path.split('/'); const id = rest.join('/');
    return { set: async body => { store[coll][id] = JSON.parse(JSON.stringify(body)); fire(coll); }, delete: async () => { delete store[coll][id]; fire(coll); } }; } };
  window.__store = store; window.__saved = saved;
  window.claude = { use: async cap => cap === 'db' ? db : cap === 'downloads' ? { save: async ({ filename, data }) => { saved.push({ filename, size: data && data.size !== undefined ? data.size : String(data).length }); } } : cap === 'user' ? { can: async () => true } : null };
})();
"""
DRIVE_CLAUDE = r"""
async (arg) => {
  const L = window.__lt;
  const legacy = !('paperHtml' in L);
  const F = n => (n in L) ? L[n] : (0, eval)(n);
  const st = L.state;
  const b64 = s => { const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const clean = o => JSON.parse(JSON.stringify(o === undefined ? null : o, (k, v) => (k === 'savedAt' || k === 'updatedAt') ? undefined : v));
  const norm = s => { if (s && s.logic) for (const l of s.logic) { delete l.id; if (l.sw) l.sw = 'SW'; } for (const k of Object.keys(s || {})) if (s[k] && typeof s[k] === 'object' && s[k].setup) norm(s[k].setup); return s; };
  const out = {};
  await sleep(100);
  out.status = st.teamStatus;
  await F('loadDocx')(b64(arg.letter), arg.name, false);
  F('ingestCsv')(arg.dataText, arg.dataName);
  await F('teamCreateClient')('Acme Ltd'); await sleep(60);
  out.clients = st.teamClients.map(c => c.id + ':' + c.name);
  out.team = st.team && { id: st.team.id, name: st.team.name, use: st.team.use };
  const live = st.rows.filter(r => r.count);
  if (live[0]) { st.edits[live[0].id] = { key: 'custom_schema.team_pick' }; }
  if (live[1]) { st.edits[live[1].id] = { key: 'ctc' }; }
  F('analyze')(); F('build')();
  await F('teamSaveChoices')(); await F('teamSaveSetup')('Appraisal 2026'); await sleep(80);
  out.store = norm(clean(window.__store));
  out.setups = st.teamSetups.map(s => ({ id: s.id, name: s.name, fileName: s.fileName, noSource: s.noSource || false }));
  out.collected = clean(F('collectTeamChoices')());
  // a second letter load: the team's choices come back as suggestions
  await F('loadDocx')(b64(arg.letter), arg.name, false); await sleep(30);
  out.rowsWithTeam = st.rows.map(r => ({ find: r.find, key: r.key, how: r.how, conf: r.conf }));
  st.team.use = false; F('analyze')();
  out.rowsWithoutTeam = st.rows.map(r => ({ find: r.find, key: r.key, how: r.how }));
  st.team.use = true; F('analyze')();
  out.keys = [...st.extraKeys].sort(); out.combo = F('comboOptions')().filter(o => /Team/.test(o.g));
  await F('teamDeleteSetup')(out.setups[0] && out.setups[0].id); await sleep(60);
  out.setupsAfterDelete = st.teamSetups.length;
  // downloads go through window.claude, not the browser
  out.offerResult = [await F('offer')('x.csv', 'a,b'), await F('offer')('y.docx', await F('buildBlob')())];
  out.saved = clean(window.__saved);
  out.mapping = F('mappingCsv')();
  out.toastOnBad = null;
  return out;
}
"""


# ---------------------------------------------------------------------------------------------- comparing
MISSING = object()


def diff(a, b, path="", out=None, limit=10):
    out = [] if out is None else out
    if len(out) >= limit or a == b:
        return out
    if isinstance(a, dict) and isinstance(b, dict):
        for k in sorted(set(a) | set(b)):
            diff(a.get(k, MISSING), b.get(k, MISSING), f"{path}.{k}", out, limit)
    elif isinstance(a, list) and isinstance(b, list):
        if len(a) != len(b):
            out.append(f"{path}: length {len(a)} (old) vs {len(b)} (new)")
        for i, (x, y) in enumerate(zip(a, b)):
            diff(x, y, f"{path}[{i}]", out, limit)
    elif isinstance(a, str) and isinstance(b, str):
        i = next((k for k in range(min(len(a), len(b))) if a[k] != b[k]), min(len(a), len(b)))
        out.append(f"{path}: first difference at char {i}\n      old: ...{a[max(0, i - 60):i + 100]!r}\n      new: ...{b[max(0, i - 60):i + 100]!r}")
    else:
        out.append(f"{path}: old={'<missing>' if a is MISSING else repr(a)[:200]} new={'<missing>' if b is MISSING else repr(b)[:200]}")
    return out


def b64(path: Path) -> str:
    return base64.b64encode(path.read_bytes()).decode()


def scenarios(quick: bool, only: str | None):
    out = []
    for letter in (QUICK if quick else LETTERS):
        merge = ("letterB.docx" if letter == "letterA.docx" else None)
        out.append({"letter": letter, "data": None, "merge": merge})
        out.append({"letter": letter, "data": "emps.csv", "merge": merge})
    if not quick:
        out.append({"letter": "letterA.docx", "data": "emps.xlsx", "merge": None})
        out.append({"letter": "northwind.docx", "data": "emps.xlsx", "merge": None})
    out.append({"letter": MAILMERGE[0], "data": MAILMERGE[1], "merge": None})
    for s in out:
        s["name"] = f"{s['letter']} + {s['data'] or 'no data'}" + (f" + merge {s['merge']}" if s["merge"] else "")
    return [s for s in out if not only or only.lower() in s["name"].lower()]


def args_for(s):
    other = "letterB.docx" if s["letter"] != "letterB.docx" else "letterA.docx"
    a = {"letter": b64(FIX / s["letter"]), "name": s["letter"], "other": b64(FIX / other), "otherName": other}
    if s["data"]:
        p = FIX / s["data"]
        a.update(data=b64(p), dataName=s["data"], dataKind="xlsx" if p.suffix == ".xlsx" else "csv")
        if p.suffix == ".csv":
            a["dataText"] = p.read_text(encoding="utf-8")
    if s["merge"]:
        a.update(mergeB=b64(FIX / s["merge"]), mergeName=s["merge"])
    return a


async def run_page(browser, url, arg, drive=DRIVE, init=INIT):
    ctx = await browser.new_context(viewport={"width": 1440, "height": 900})
    page = await ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    page.on("console", lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type == "error" and "404" not in m.text else None)
    await page.add_init_script(INIT)
    if init is not INIT:
        await page.add_init_script(init)
    await page.goto(url)
    await page.wait_for_function("window.__lt && window.__lt.state")
    Handler.log.clear()
    try:
        res = await page.evaluate(drive, arg)
    except Exception as e:   # the letter could not be opened (a bad file): both pages must refuse it the same way
        res = {"threw": str(e).split("\n")[0][:300]}
    if Handler.log:
        res["api_log"] = json.loads(json.dumps(Handler.log))
    await ctx.close()
    return res, errors


MODES = [
    ("server mode (stand-in /api: real Jinja check, employee test, Claude helpers)", DRIVE_SERVER, INIT, True),
    ("claude.ai mode (window.claude: team library, downloads)", DRIVE_CLAUDE, INIT_CLAUDE, False),
]


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--quick", action="store_true")
    ap.add_argument("--only")
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()
    if not NEW.exists():
        sys.exit(f"{NEW} is missing: run  python tools/build_frontend.py  first")
    srv, port = start_server()
    failed = 0
    async with async_playwright() as p:
        exe = os.environ.get("CHROMIUM_PATH")
        browser = await p.chromium.launch(**({"executable_path": exe} if exe else {}))
        try:
            for s in scenarios(args.quick, args.only):
                arg = args_for(s)
                old, old_err = await run_page(browser, f"http://127.0.0.1:{port}/legacy", arg)
                new, new_err = await run_page(browser, f"http://127.0.0.1:{port}/new", arg)
                d = diff(old, new)
                snaps = len(new.get("snaps", {}))
                problems = [f"  {x}" for x in d]
                if new_err:
                    problems.append(f"  new page errors: {new_err[:3]}")
                if old_err:
                    problems.append(f"  (old page errors, for information: {old_err[:2]})")
                bad_snaps = [k for k, v in new.get("snaps", {}).items() if v.get("error")]
                if bad_snaps:
                    problems.append(f"  snapshots with a script error in the new page: {bad_snaps}: {new['snaps'][bad_snaps[0]]['error'][:300]}")
                fatal = d or new_err or bad_snaps
                failed += 1 if fatal else 0
                u = new.get("snaps", {}).get("undo", {})
                cov = (f"rows={len(u.get('rows', []))} checks={len(u.get('checks', []))} tables={len(u.get('tables', []))} "
                       f"logic={len(u.get('lg', []))} xml={sum(len(v) for v in u.get('xml', {}).values()) // 1000}k")
                threw = {k: v for k, v in new.get("notes", {}).items() if str(v).startswith("threw")}
                print(("FAIL " if fatal else "ok   ") + s["name"] + f"  ({snaps} snapshots; {cov})" + (f"  steps that threw (same in both pages): {threw}" if threw else ""))
                if fatal or args.verbose:
                    print("\n".join(problems))
                if args.verbose:
                    print("  filters:", new.get("filters"), "\n  notes:", new.get("notes"))
            # the other two worlds the page can run in
            for name, drive, init, api in MODES:
                if args.only and args.only.lower() not in name.lower():
                    continue
                if args.quick and not args.only:
                    pass
                arg = args_for({"letter": "letterA.docx", "data": "emps.csv", "merge": None})
                Handler.api = api
                try:
                    old, old_err = await run_page(browser, f"http://127.0.0.1:{port}/legacy", arg, drive, init)
                    new, new_err = await run_page(browser, f"http://127.0.0.1:{port}/new", arg, drive, init)
                finally:
                    Handler.api = False
                d = diff(old, new)
                problems = [f"  {x}" for x in d]
                if new_err:
                    problems.append(f"  new page errors: {new_err[:3]}")
                if old_err:
                    problems.append(f"  (old page errors, for information: {old_err[:2]})")
                threw = new.get("threw")
                if threw:
                    problems.append(f"  the new page's script stopped: {threw}")
                fatal = d or new_err or threw
                failed += 1 if fatal else 0
                print(("FAIL " if fatal else "ok   ") + name + f"  ({len(json.dumps(new))} bytes compared)")
                if fatal or args.verbose:
                    print("\n".join(problems))
                if args.verbose:
                    print(json.dumps({k: new.get(k) for k in ("probe", "target", "clients", "team", "saved", "setupsAfterDelete", "cbNote")}, indent=1)[:1500])
        finally:
            await browser.close()
            srv.shutdown()
    print("\nparity: " + ("FAILED" if failed else "all scenarios identical"))
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    asyncio.run(main())
