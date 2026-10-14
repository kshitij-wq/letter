// The Letter Assistant's tools: thin wrappers over the engine functions the interface itself uses. No DOM, no network.
// READ tools look at the letter and return plain data. WRITE tools are transactions: check the target, run the engine's own
// action inside ONE undo step, re-run the checks, and report what really changed (never what was hoped for). Any failure
// restores the snapshot taken before. The agent loop (agent.js) decides what runs at once and what waits for the person.
import { build } from './build.js'
import { CAT, FX } from './catalog.js'
import { ckPlain, csvKeyUniverse, didYouMean, engineStatus, identifiersIn, keyStatus, runIssueFix, tagSyntaxProblem } from './checks.js'
import { CB_NOVAL, CB_NUM, applyParaCondition, cbBlank, cbEnglish, cbExpr, cbNew, cbNum, cbParse, condEnglish, saveCondEdit } from './conditions.js'
import { buildCtx } from './data.js'
import { RX_TAG, analyze, countInDoc } from './detect.js'
import { buildModel, insertAt, paraModel, replaceRange } from './docx.js'
import { applySwitch, sourceEdit } from './edits.js'
import { flushEditor, syncEditorSource } from './editor.js'
import { on, notify } from './events.js'
import { cleanCondExpr, straighten } from './helpers.js'
import { columnsForClaude, tableSpot } from './claude.js'
import { fullRefresh } from './load.js'
import { afterLogicChange, blockCountInfo, computeLogic, logicRows, pageLabel } from './logic.js'
import { getCompiled, parseRendered, renderEmployee } from './pipeline.js'
import { comboOptions, fieldLabel, finalTag, isMultiKey, keyParts, rowStatus, setCustomKey, tagProblem } from './rows.js'
import { realCheck, server } from './server.js'
import { scheduleAutosave } from './setup.js'
import { state } from './state.js'
import { rowCondKey } from './tables.js'
import { HISTORY, restoreSnap, snapState, undo } from './undo.js'
import { confirmRow, setRowEnabled, setRowFormat, setRowKey, setRowTag, setTableHideOn, setTableRowHide } from './actions.js'

/** A problem with what the model asked for, in words the model can act on. Nothing was changed. */
export class ToolError extends Error {}

const clip = (s, n) => { s = String(s ?? ''); return s.length > n ? s.slice(0, n - 1) + '…' : s }
const oneLine = (s) => String(s ?? '').replace(/\s+/g, ' ').trim()
const tagsIn = (text) => [...String(text || '').matchAll(RX_TAG)].map((m) => m[0])

function paraByPid(pid) {
  const p = state.an && state.an.byPid.get(String(pid))
  if (!p || p.fallback) throw new ToolError(`There is no paragraph “${pid}” in the letter. Call get_document_outline for the current paragraph ids.`)
  return p
}
function whereOf(p) {
  if (p.kind !== 'body') return p.kind
  return tableSpot(p) ? 'table' : 'body'
}
function rowById(id) {
  const r = state.rows.find((x) => x.id === id)
  if (!r) throw new ToolError(`There is no placeholder “${id}”. Call get_tags for the current row ids.`)
  return r
}

/** Is this a field that really exists? Returns '' when it does, otherwise what is wrong. lenient: only reject what the data file clearly doesn't have. */
export function fieldProblem(field, lenient = false) {
  const f = String(field || '').trim()
  if (!f) return 'No field was given.'
  const U = csvKeyUniverse()
  for (const k of (isMultiKey(f) ? keyParts(f) : [f])) {
    if (FX[k]) continue
    if (!/^[A-Za-z_][\w.]*$/.test(k)) return `“${k}” isn't a field name. Use letters, digits, underscores and dots, e.g. employee_schema.level.`
    const st = keyStatus(k, U)
    if (st === 'csv') continue
    if (st === 'compup') {
      if (lenient) continue
      if (/^custom_schema\./.test(k)) return `No data file is loaded, so I can't check “${k}” (a custom_schema field). Ask the person to add the data file, or use a CompUp standard tag.`
      // a performance-sheet column the loaded data file doesn't have is probably invented; anything else CompUp-shaped is real
      if (!(U.size && /^(employee_schema|emp_variable_plan_formula)\.\w+$/.test(k) && !CAT[k])) continue
    } else if (st === 'nocsv' && lenient) continue
    const dym = didYouMean(k, U)
    return `“${k}” isn't a column in the data file or a CompUp standard tag.${dym ? ` Did you mean ${dym}?` : ''} Call get_fields to see the real ones.`
  }
  return ''
}

/* ============================== read tools ============================== */
export const READ = {
  async get_document_outline(a) {
    const limit = a.limit || 120; const out = []; let total = 0
    for (const p of state.an.paras) {
      if (p.fallback) continue
      const text = oneLine(p.model.text); if (!text) continue
      const tags = tagsIn(p.model.text)
      if (a.only_with_tags && !tags.length && !state.logic.some((l) => l.pid === p.pid)) continue
      total++; if (out.length >= limit) continue
      const rail = state.lgRails && state.lgRails.get(p.pid)
      const added = state.logic.filter((l) => l.pid === p.pid).map((l) => clip(l.text, 80))
      out.push({ pid: p.pid, page: pageLabel(p) || undefined, where: whereOf(p), text: clip(text, 140), ...(tags.length ? { tags: tags.slice(0, 6).map((t) => clip(t, 80)) } : {}), ...(added.length ? { tags_added_here: added.slice(0, 4) } : {}), ...(rail ? { inside_condition: clip(rail.top.text, 80) } : {}) })
    }
    return { paragraphs: out, total, ...(total > out.length ? { truncated: true } : {}) }
  },
  async find_text(a) {
    const q = a.query.toLowerCase(); const out = []; let total = 0
    for (const p of state.an.paras) {
      if (p.fallback) continue
      const t = oneLine(p.model.text); const i = t.toLowerCase().indexOf(q); if (i < 0) continue
      total++; if (out.length >= (a.limit || 20)) continue
      out.push({ pid: p.pid, page: pageLabel(p) || undefined, snippet: (i > 40 ? '…' : '') + t.slice(Math.max(0, i - 40), i + q.length + 60) })
    }
    return { matches: out, total }
  },
  async get_selection() {
    const s = state.sel
    if (s.pids && s.pids.length) {
      const ps = s.pids.map((id) => state.an.byPid.get(id)).filter(Boolean).sort((x, y) => x.order - y.order)
      return { selected: 'paragraphs', paragraphs: ps.map((p) => ({ pid: p.pid, page: pageLabel(p) || undefined, text: clip(oneLine(p.model.text), 300) })) }
    }
    if (s.text) return { selected: 'words', text: s.text, ...(s.range ? { pid: s.range.pid, in_paragraph: clip(oneLine((state.an.byPid.get(s.range.pid) || { model: { text: '' } }).model.text), 300) } : {}) }
    return { selected: 'nothing', note: 'The person has not selected anything in the letter.' }
  },
  async get_fields(a) {
    const q = (a.search || '').toLowerCase()
    const columns = columnsForClaude().filter((c) => !q || (c.name + ' ' + c.tag).toLowerCase().includes(q)).slice(0, 80)
    const compup = comboOptions().filter((o) => /^CompUp/.test(o.g) && (!q || (o.v + ' ' + o.l).toLowerCase().includes(q))).map((o) => ({ key: o.v, label: o.l || o.v })).slice(0, 80)
    return { data_columns: columns, compup_tags: compup, note: columns.length ? undefined : 'No data file with column names is loaded, so only the CompUp standard tags are certain.' }
  },
  async get_tags(a) {
    const want = a.status || 'all'; const out = []; let total = 0
    for (const r of state.rows) {
      if (!r.count) continue
      const st = rowStatus(r); if (want !== 'all' && st !== want) continue
      total++; if (out.length >= (a.limit || 80)) continue
      out.push({ row_id: r.id, text: clip(r.find, 80), field: r.key || null, tag: finalTag(r) || null, status: st, occurrences: r.count })
    }
    return { tags: out, total }
  },
  async get_conditions() {
    computeLogic()
    const conditions = logicRows().filter((e) => ['if', 'elif', 'else', 'endif', 'for', 'endfor'].includes(e.kw)).slice(0, 80).map((e) => {
      const en = (e.kw === 'if' || e.kw === 'elif') ? condEnglish(e.expr) : ''
      const bc = blockCountInfo(e)
      return { key: e.key, kind: e.kw, tag: clip(e.text, 200), pid: e.pid, page: pageLabel(e.p) || undefined, ...(en ? { reads: en } : {}), status: e.status, added_in_this_tool: e.src === 'you', ...(bc ? { employees: bc.text } : {}) }
    })
    const tables = state.tables.map((t) => ({ table_id: t.id, enabled: t.enabled, hides_empty_rows: !!t.hide.on, rows: t.rows.map((r) => ({ row: r.ri, label: r.label, hidden_when_empty: !!r.hide, cells_tagged: !!rowCondKey(t, r) })) }))
    return { conditions, salary_tables: tables, unplaced_tags: (state.unplaced || []).length }
  },
  async get_validation(a) {
    const iss = (state.issues || []).filter((x) => x.level === 'error' || x.level === 'warn' || (a.include_notes && x.level === 'info'))
    const eng = engineStatus()
    return {
      problems: iss.slice(0, 40).map((x) => ({ key: x.key, level: x.level, category: x.cat, text: clip(ckPlain(x.html), 300), pids: (x.locs || []).slice(0, 5), ...(x.fix ? { one_click_fix: x.fix.label, can_apply_fix: AUTO_FIX_RX.test(x.fix.label) } : {}) })),
      counts: { errors: iss.filter((x) => x.level === 'error').length, warnings: iss.filter((x) => x.level === 'warn').length },
      real_jinja: eng.kind === 'none' || eng.kind === 'unavailable' ? 'not available here' : eng.title,
    }
  },
  async preview_for_employee(a) {
    if (!state.built) build()
    const comp = await getCompiled()
    if (comp.error) throw new ToolError(`The letter can't be filled yet: ${comp.error.msg}`)
    // made-up values only: buildCtx(null) never reads an employee row
    const info = buildCtx(null); const r = renderEmployee(comp, info.ctx)
    if (r.error) throw new ToolError(`Filling the letter with the sample values failed: ${r.error.msg}`)
    const pr = parseRendered(r.xml); if (pr.broken) throw new ToolError('The filled letter is damaged (an if and its end if are probably in different places).')
    const an = buildModel(pr.docs); const q = (a.contains || '').toLowerCase(); const out = []
    for (const p of an.paras) {
      if (p.fallback || p.kind !== 'body') continue
      const t = oneLine(p.model.text); if (!t || (q && !t.toLowerCase().includes(q))) continue
      out.push({ page: pageLabel(p) || undefined, text: clip(t, 240) }); if (out.length >= (a.limit || 40)) break
    }
    return { sample_values: true, note: 'Filled with made-up sample values (not a real employee). Fields without a sample value stay empty.', paragraphs: out, made_up_fields: [...info.sampled].slice(0, 30) }
  },
}

/* ============================== write tools ============================== */
const AUTO_FIX_RX = /^(Use |Add \| default|Add trim marks|Change = to ==)/

// the condition the model asked for, as the builder's own object, checked
function buildCondition(a) {
  const raw = a.raw_expr != null && String(a.raw_expr).trim() ? cleanCondExpr(a.raw_expr) : ''
  if (raw && a.rules && a.rules.length) throw new ToolError('Give rules or raw_expr, not both.')
  if (raw) {
    const why = tagSyntaxProblem(`{% if ${raw} %}`); if (why) throw new ToolError(`The condition has a typing mistake: ${why}`)
    for (const id of identifiersIn(raw)) { const p = fieldProblem(id, true); if (p) throw new ToolError(p) }
    return { cb: cbNew(raw), expr: raw }
  }
  if (!a.rules || !a.rules.length) throw new ToolError('Give the condition as rules (field, op, value) or as raw_expr.')
  const rules = a.rules.map((r, i) => {
    const field = String(r.field).trim(); const fp = fieldProblem(field); if (fp) throw new ToolError(`Rule ${i + 1}: ${fp}`)
    const value = String(r.value ?? '').trim()
    if (!CB_NOVAL.has(r.op) && !value) throw new ToolError(`Rule ${i + 1} (${field} ${r.op}) needs a value.`)
    if (CB_NUM[r.op] && cbNum(value) == null) throw new ToolError(`Rule ${i + 1}: “${value}” isn't a number, and “${r.op}” compares numbers.`)
    return { ...cbBlank(field), field, op: r.op, value }
  })
  const cb = { rules, join: a.join || 'and', raw: null }
  const expr = cbExpr(cb)
  if (!expr) throw new ToolError('The rules are incomplete: every rule needs a field, a test and a value.')
  const why = tagSyntaxProblem(`{% if ${expr} %}`); if (why) throw new ToolError(`The condition has a typing mistake: ${why}`)
  if (!cbParse(expr)) throw new ToolError("That condition can't be shown in the condition builder. Use simpler rules.")
  return { cb, expr }
}
const sayCondition = (c) => cbEnglish(c.cb) || condEnglish(c.expr) || c.expr
const pagesOf = (ps) => { const pg = [...new Set(ps.map((p) => pageLabel(p)).filter(Boolean))]; return pg.length ? ` (${pg.join(', ')})` : '' }
const sortedParas = (pids) => [...new Set(pids)].map(paraByPid).sort((x, y) => x.order - y.order)


export const WRITE = {
  tag_text: {
    check(a) {
      const fp = fieldProblem(a.field); if (fp) throw new ToolError(fp)
      if (!a.row_id && !a.text) throw new ToolError('Give row_id (from get_tags) or the exact text to tag.')
      if (a.row_id) { const r = rowById(a.row_id); if (!r.count) throw new ToolError(`“${r.find}” is not in the letter any more.`) }
      else if (!state.rows.some((r) => r.find === a.text && r.count) && !countInDoc(a.text)) throw new ToolError(`The text “${clip(a.text, 60)}” isn't in the letter exactly as written. Use find_text to see how it is written.`)
    },
    run(a) {
      let r = a.row_id ? rowById(a.row_id) : state.rows.find((x) => x.find === a.text && x.count)
      if (!r) {   // the same as "Tag this text": the text becomes a placeholder
        const id = 'g:' + a.text
        state.edits[id] = { manual: true, find: a.text }; analyze(); fullRefresh()
        r = state.rows.find((x) => x.id === id)
        if (!r || !r.count) throw new ToolError(`The text “${clip(a.text, 60)}” can't be tagged: it does not appear in the letter exactly as typed.`)
      }
      let key = String(a.field).trim(); if (a.custom != null) key = setCustomKey(key, a.custom)
      setRowKey(r.id, key)
      if (a.format) setRowFormat(r.id, a.format)
      build()
      const now = state.rows.find((x) => x.id === r.id)
      if (!now || !finalTag(now)) throw new ToolError('The tag could not be written.')
      return { row_id: now.id, text: now.find, tag: finalTag(now), places: now.count }
    },
    narrow: (a, info) => (info.places || 0) <= 1,
    summary: (a, info) => `Tag “${clip(info.text, 50)}” with ${fieldLabel(String(a.field).trim())}${info.places > 1 ? ` (${info.places} places)` : ''}: ${clip(info.tag, 100)}`,
  },
  update_tag: {
    check(a) {
      const r = rowById(a.row_id)
      if (!['field', 'format', 'custom', 'tag', 'confirm', 'skip'].some((k) => a[k] != null)) throw new ToolError('Say what to change: field, format, custom, tag, confirm or skip.')
      if (a.field) { const fp = fieldProblem(a.field); if (fp) throw new ToolError(fp) }
      if (a.tag != null) { if (!/\{\{|\{%/.test(a.tag)) throw new ToolError('A hand-written tag needs {{ }} around the value.'); const why = tagProblem(a.tag); if (why) throw new ToolError(why) }
      if (a.custom != null && !a.field && !r.key) throw new ToolError('This text has no field yet, so “custom” has nothing to change. Give a field too.')
    },
    run(a) {
      const id = a.row_id
      if (a.skip) setRowEnabled(id, false)
      if (a.tag != null) setRowTag(id, straighten(a.tag))
      else if (a.field || a.custom != null) { let key = a.field ? String(a.field).trim() : rowById(id).key; if (a.custom != null) key = setCustomKey(key, a.custom); setRowKey(id, key) }
      if (a.format && a.tag == null) setRowFormat(id, a.format)
      if (a.confirm) confirmRow(id)
      build()
      const r = rowById(id)
      return { row_id: id, text: r.find, tag: finalTag(r) || null, status: rowStatus(r) }
    },
    narrow: () => true,
    summary: (a, info) => a.skip ? `Leave “${clip(info.text, 50)}” as typed (no tag)` : a.confirm && !a.field && !a.tag && !a.format ? `Confirm the tag for “${clip(info.text, 50)}”: ${clip(info.tag, 100)}` : `Change the tag for “${clip(info.text, 50)}” to ${clip(info.tag, 100)}`,
  },
  wrap_paragraphs_in_condition: {
    check(a) { sortedParas(a.pids); buildCondition(a) },
    run(a) {
      const ps = sortedParas(a.pids); const c = buildCondition(a)
      const other = String(a.otherwise_text || '')
      state.sel = { pids: ps.map((p) => p.pid), anchor: ps[0].pid, text: '' }; state.cb = c.cb
      try { applyParaCondition(other) } finally { state.cb = null }
      return { paragraphs: ps.length, pages: pagesOf(ps), reads: sayCondition(c), expr: c.expr, otherwise: !!other.trim() }
    },
    narrow: () => false,
    summary: (a, info) => `Show ${info.paragraphs === 1 ? 'one paragraph' : `${info.paragraphs} paragraphs`}${info.pages} only when ${info.reads}${info.otherwise ? ', and other text otherwise' : ''}`,
  },
  if_else_text: {
    check(a) {
      sortedParas(a.pids)
      const fp = fieldProblem(a.field); if (fp) throw new ToolError(fp)
      for (const c of a.cases) if ((a.match === 'number') && cbNum(c.value) == null) throw new ToolError(`“${c.value}” isn't a number. Use match "text", or fix the value.`)
    },
    run(a) {
      const ps = sortedParas(a.pids); const before = state.switchOps.length
      state.switchUi = { mode: 'para', pids: ps.map((p) => p.pid), field: String(a.field).trim(), match: a.match || 'text', cases: a.cases.map((c) => ({ v: c.value, t: c.text })), other: a.otherwise_text || '', where: a.where === 'after' ? 'after' : 'replace' }
      try { applySwitch() } finally { state.switchUi = null }
      if (state.switchOps.length === before) return { versions: 0 }
      return { versions: a.cases.length + (String(a.otherwise_text || '').trim() ? 1 : 0), pages: pagesOf(ps), field: fieldLabel(String(a.field).trim()), replaced: a.where !== 'after' }
    },
    narrow: () => false,
    summary: (a, info) => `Give ${a.pids.length === 1 ? 'the paragraph' : 'the paragraphs'}${info.pages} ${info.versions} versions depending on ${info.field}${info.replaced ? '' : ' (the original stays for everyone)'}`,
  },
  wrap_table_row_in_condition: {
    check(a) { findTableRow(a) },
    run(a) {
      const { t, row } = findTableRow(a); const hide = a.hide_when_empty !== false
      if (hide && !rowCondKey(t, row)) throw new ToolError('The cells of that row have no tags yet, so there is no value to test. Tag the cells first.')
      if (hide && !t.hide.on) setTableHideOn(t, true)
      const fresh = findTableRow(a); setTableRowHide(fresh.t, fresh.row, hide)
      return { table: a.table_id, label: row.label, hide }
    },
    narrow: () => true,
    summary: (a, info) => info.hide ? `Hide the table row “${clip(info.label, 40)}” when its value is empty or 0` : `Always show the table row “${clip(info.label, 40)}”`,
  },
  update_condition: {
    check(a) { condEntry(a.key); buildCondition(a) },
    run(a) {
      const e = condEntry(a.key); const c = buildCondition(a)
      state.condEdit = { key: e.key, kw: e.kw, tag: e.text, src: e.src, id: e.id, pid: e.pid }; state.cb = c.cb
      try { saveCondEdit() } finally { state.condEdit = null; state.cb = null }
      return { reads: sayCondition(c), expr: c.expr, was: condEnglish(e.expr) }
    },
    narrow: () => false,
    summary: (a, info) => `Change a condition to: shown when ${info.reads}${info.was ? ` (was: ${info.was})` : ''}`,
  },
  remove_condition: {
    check(a) { blockOf(a.key) },
    run(a) {
      const { ids, n } = blockOf(a.key)
      state.logic = state.logic.filter((l) => !ids.has(l.id))
      afterLogicChange('')
      return { removed: n }
    },
    narrow: () => false,
    summary: (a, info) => `Remove a condition block (${info.removed} tag${info.removed === 1 ? '' : 's'}); the text inside stays`,
  },
  replace_paragraph_text: {
    check(a) { rewritePlan(a) },
    run(a) {
      const plan = rewritePlan(a)
      sourceEdit((docs, H) => {
        const el = H.pEl(plan.p.pid); if (!el) return { cancel: true }
        const model = paraModel(el); if (model.text !== plan.old) return { cancel: true }
        for (let i = plan.oldSegs.length - 1; i >= 0; i--) {
          const o = plan.oldSegs[i], nw = plan.newSegs[i]
          if (o.text === nw) continue
          if (o.text) replaceRange(model, o.s, o.e, nw, null); else insertAt(model, o.s, nw)
        }
        return {}
      })
      const after = state.an.byPid.get(plan.p.pid)
      if (!after || after.model.text !== a.new_text) throw new ToolError('The paragraph could not be reworded cleanly. Nothing was changed.')
      return { pid: plan.p.pid, was: clip(oneLine(plan.old), 160), now: clip(oneLine(a.new_text), 160), tags_kept: plan.tags.length }
    },
    narrow: () => false,
    summary: (a, info) => `Reword the paragraph${info.tags_kept ? ` (its ${info.tags_kept} tag${info.tags_kept === 1 ? '' : 's'} stay exactly as they are)` : ''}`,
  },
  apply_fix: {
    check(a) { fixOf(a.issue_key) },
    run(a) {
      const x = fixOf(a.issue_key)
      if (!runIssueFix(x.fix.idx)) throw new ToolError('That fix is not available any more. Call get_validation again.')
      return { fix: x.fix.label, problem: clip(ckPlain(x.html), 160) }
    },
    narrow: () => false,
    summary: (a, info) => `${info.fix}: ${info.problem}`,
  },
}

function findTableRow(a) {
  const t = state.tables.find((x) => x.id === a.table_id)
  if (!t) throw new ToolError(`There is no salary table “${a.table_id}”. Call get_conditions for the table ids.`)
  if (!t.enabled) throw new ToolError('That salary table is switched off.')
  const want = String(a.row).trim().toLowerCase()
  const row = t.rows.find((r) => String(r.ri) === want) || t.rows.find((r) => r.label.toLowerCase() === want)
  if (!row) throw new ToolError(`The table has no row “${a.row}”. Its rows: ${t.rows.map((r) => `${r.ri} “${clip(r.label, 30)}”`).join(', ')}.`)
  return { t, row }
}
function condEntry(key) {
  computeLogic()
  const e = (state.lg || []).find((x) => x.key === key)
  if (!e) throw new ToolError(`There is no condition “${key}”. Call get_conditions for the current keys.`)
  if (e.kw !== 'if' && e.kw !== 'elif') throw new ToolError('Only if and else if tags have a condition to change.')
  return e
}
function blockOf(key) {
  computeLogic()
  const e = (state.lg || []).find((x) => x.key === key)
  if (!e) throw new ToolError(`There is no condition “${key}”. Call get_conditions for the current keys.`)
  if (e.kw !== 'if') throw new ToolError('Give the key of the if tag that starts the block.')
  const members = [e, ...state.lg.filter((x) => x.opener === e)]
  if (members.some((m) => m.src !== 'you')) throw new ToolError('Part of this condition was already in the uploaded letter, so it can only be changed in Word. (Conditions added in this tool can be removed.)')
  const keys = new Set(members.map((m) => m.key)); const ids = new Set()
  for (const m of members) {
    const l = state.logic.find((x) => x.id === m.id); if (!l) continue
    if (l.sw || l.mg) throw new ToolError('This block was made by “text by value” or a merge, so removing it here would leave its paragraphs behind. Use Undo instead.')
    if (state.lg.filter((x) => x.id === m.id).some((x) => !keys.has(x.key))) throw new ToolError('This tag also holds other tags, so it cannot be removed on its own.')
    ids.add(l.id)
  }
  if (!ids.size) throw new ToolError('Nothing to remove.')
  return { ids, n: members.length }
}
function fixOf(key) {
  const x = (state.issues || []).find((i) => i.key === key)
  if (!x) throw new ToolError(`There is no problem “${key}” any more. Call get_validation for the current ones.`)
  if (!x.fix) throw new ToolError('That problem has no one-click fix. Say what is wrong and what you would change instead.')
  if (!AUTO_FIX_RX.test(x.fix.label)) throw new ToolError(`The fix “${x.fix.label}” needs the person to choose something in the letter, so it can't be applied from here.`)
  return x
}
// reword: the tags must stay, in order, exactly; only the words between them change
function rewritePlan(a) {
  const p = paraByPid(a.pid); const old = p.model.text
  if (p.textbox) throw new ToolError("That paragraph is inside a text box and can't be reworded here.")
  if (a.expected_text != null && oneLine(a.expected_text) !== oneLine(old)) throw new ToolError(`That paragraph says something else now: “${clip(oneLine(old), 200)}”. Call get_document_outline again.`)
  if (/[\r\n]/.test(a.new_text)) throw new ToolError('new_text has to be one paragraph (no line breaks).')
  if (Object.keys(state.edits).some((id) => id.startsWith(`o:${p.pid}:`)) || state.logic.some((l) => l.pid === p.pid && l.place === 'at')) throw new ToolError('This paragraph has tags placed at exact positions inside it, which rewording would move. Reword it in Word, or undo those tags first.')
  const split = (text) => {
    const segs = []; const tags = []; let at = 0
    for (const m of text.matchAll(RX_TAG)) { segs.push({ s: at, e: m.index, text: text.slice(at, m.index) }); tags.push(m[0]); at = m.index + m[0].length }
    segs.push({ s: at, e: text.length, text: text.slice(at) })
    return { segs, tags }
  }
  const o = split(old), n = split(a.new_text)
  const same = o.tags.length === n.tags.length && o.tags.every((t, i) => straighten(t) === straighten(n.tags[i]))
  if (!same) throw new ToolError(`The tags in the paragraph must stay exactly as they are, in the same order. They are: ${o.tags.length ? o.tags.map((t) => clip(t, 60)).join('  ') : '(none)'}. Put them back in new_text, unchanged.`)
  if (n.segs.some((s) => /\{\{|\{%|\{#|%\}|\}\}|#\}/.test(s.text))) throw new ToolError('new_text has a stray { or } of a tag. Tags must be whole and unchanged.')
  if (old === a.new_text) throw new ToolError('The new text is the same as the old text.')
  return { p, old, oldSegs: o.segs, newSegs: n.segs.map((s) => s.text), tags: o.tags }
}

/* ============================== the transaction ============================== */
// the paragraphs of the template as it would be downloaded, one line each: what a change did to the letter
function builtLines() {
  const an = state.built && state.built.an; if (!an) return []
  return an.paras.filter((p) => !p.fallback && (p.model.text || '').trim()).map((p) => ({ k: oneLine(p.model.text), page: pageLabel(p) }))
}
export function lineDiff(a, b) {
  const n = a.length, m = b.length; const L = Array.from({ length: n + 1 }, () => new Int32Array(m + 1))
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = a[i].k === b[j].k ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1])
  const removed = [], added = []; let i = 0, j = 0
  while (i < n || j < m) {
    if (i < n && j < m && a[i].k === b[j].k) { i++; j++ }
    else if (j < m && (i >= n || L[i][j + 1] >= L[i + 1][j])) { added.push({ page: b[j].page || undefined, text: clip(b[j].k, 180) }); j++ }
    else { removed.push({ page: a[i].page || undefined, text: clip(a[i].k, 180) }); i++ }
  }
  return { removed: removed.slice(0, 8), added: added.slice(0, 8), more: Math.max(0, removed.length - 8) + Math.max(0, added.length - 8) }
}
function issueMap() {
  const m = new Map(); for (const x of state.issues || []) if (x.level === 'error' || x.level === 'warn') m.set(x.key, { level: x.level, text: clip(ckPlain(x.html), 200), pids: (x.locs || []).slice(0, 3) })
  return m
}
const sameSnap = (a, b) => a.rest === b.rest && a.csv === b.csv && a.csvExtra === b.csvExtra && Object.keys(a.xml).length === Object.keys(b.xml).length && Object.keys(a.xml).every((k) => a.xml[k] === b.xml[k])
function delta(before, after) {
  const added = [...after].filter(([k]) => !before.has(k)).map(([k, v]) => ({ key: k, ...v }))
  const resolved = [...before].filter(([k]) => !after.has(k)).length
  return { new_problems: added.slice(0, 8), resolved_problems: resolved, errors_now: [...after.values()].filter((v) => v.level === 'error').length, warnings_now: [...after.values()].filter((v) => v.level === 'warn').length }
}

/** Run a write tool. dry: show what it would do and put everything back. Otherwise it is applied as ONE undo step. */
async function transact(name, args, dry) {
  const tool = WRITE[name]
  await flushEditor()   // words typed in the editor go into the letter first
  const before = snapState(); const n0 = HISTORY.undo.length; const redo0 = HISTORY.redo; const group0 = HISTORY.group; const sel0 = state.sel
  build(); const lines0 = builtLines(); const iss0 = issueMap()
  const rollback = () => { restoreSnap(before); HISTORY.undo.length = n0; HISTORY.redo = redo0; HISTORY.group = group0; state.sel = sel0; state.cb = null; state.condEdit = null; state.switchUi = null; notify() }
  tool.check(args)
  const msgs = []; const off = on('toast', (m) => msgs.push(String(m)))
  let info, changed
  try {
    info = tool.run(args) || {}
    computeLogic(); build()
    changed = !sameSnap(before, snapState())
  } catch (e) {
    off(); rollback()
    if (e instanceof ToolError) throw e
    console.warn(e); throw new ToolError(`The change could not be made (${e && e.message || e}). Nothing was changed.`)
  }
  off()
  if (!changed) { rollback(); throw new ToolError(msgs.length ? `Nothing was changed. ${msgs.join(' ')}` : 'Nothing was changed: the letter is already like that.') }
  const diff = lineDiff(lines0, builtLines()); const summary = tool.summary(args, info)
  if (dry) { const d = delta(iss0, issueMap()); rollback(); return { summary, narrow: !!(tool.narrow && tool.narrow(args, info)), diff, ...d } }
  // one undo step for everything the action did
  HISTORY.undo.length = n0; HISTORY.undo.push(before); HISTORY.redo = []; HISTORY.group = ''
  applied.push({ depth: HISTORY.undo.length, summary, tool: name })
  notify(); scheduleAutosave(); await syncEditorSource()
  let real = ''
  if (server.ok) {
    try { await Promise.race([realCheck(), new Promise((r) => setTimeout(r, 8000))]) } catch { /* the page's own checks still count */ }
    const eng = engineStatus(); real = eng.kind === 'passed' ? 'Real Jinja check passed.' : eng.kind === 'failed' ? `Real Jinja check found a problem: ${eng.title}` : eng.kind === 'checking' ? 'Real Jinja check is still running.' : ''
  }
  return { summary, diff, ...delta(iss0, issueMap()), info, ...(real ? { real_jinja: real } : {}) }
}

/** The assistant's own applied changes, newest last: what the undo tool may undo. */
export const applied = []
const UNDO = {
  check() {
    const top = applied[applied.length - 1]
    if (!top) throw new ToolError('There is nothing from this assistant to undo.')
    if (top.depth !== HISTORY.undo.length) throw new ToolError('The letter was changed after that, so I can’t undo only my change. The person can use Undo in the top bar.')
    return top
  },
}
export async function undoApplied() { await flushEditor(); const top = UNDO.check(); undo(); applied.pop(); await syncEditorSource(); return { summary: `Undone: ${top.summary}` } }

export async function planWrite(name, args) {
  if (name === 'undo') { const top = UNDO.check(); return { summary: `Undo: ${top.summary}`, narrow: false, diff: { removed: [], added: [], more: 0 }, new_problems: [], resolved_problems: 0 } }
  return transact(name, args, true)
}
export async function applyWrite(name, args) {
  if (name === 'undo') return undoApplied()
  return transact(name, args, false)
}
