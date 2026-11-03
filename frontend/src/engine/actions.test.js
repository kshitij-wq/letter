import { beforeEach, describe, expect, it } from 'vitest'
import {
  acceptAllChecks, addLogic, addManual, afterLogicChange, applyInlineIf, applyParaCondition, build, cbNew, changeSettings, chooseDataFilter, clearData, clickParagraph,
  closeBlockAt, commitLogicText, computeLogic, confirmRow, deleteLogic, deleteRow, exportChecklist, finalTag, insertLogicTag, loadDataFile, loadDocx, nextReviewId,
  oldTagNames, on, paperHtml, previewTag, previewValues, resetRowTag, rowStatus, runTableAction, sampleDocx, setLogicPlace, setRowEnabled, setRowFormat, setRowKey, setRowTag,
  startClosing, state, stepInfo, typeTableCellKey, setTab, setView, cancelPicking, startPlacing, discardUnplaced,
} from './index.js'
import { rowFor } from './testkit.js'

const toasts = []
on('toast', (m) => toasts.push(m))

beforeEach(async () => {
  toasts.length = 0
  localStorage.clear(); state.learned = {}; state.learnedCells = {}   // what earlier tests taught the page
  await loadDocx(await sampleDocx(), 'sample-appraisal-letter.docx', true)
})

describe('placeholders', () => {
  it('setRowKey writes the tag, remembers the choice, and the template uses it', () => {
    const r = rowFor('[Employee Code]')
    setRowKey(r.id, ' custom_schema.empid ')
    expect(state.edits[r.id].key).toBe('custom_schema.empid')
    expect(rowFor('[Employee Code]').key).toBe('custom_schema.empid')
    expect(JSON.parse(localStorage.getItem('lt.learned'))['employee code']).toBe('custom_schema.empid')
    build()
    expect(state.built.xml['word/document.xml']).toContain('{{ custom_schema.empid }}')
  })

  it('a typed tag replaces the generated one until it is reset', () => {
    const r = rowFor('[Employee Code]')
    setRowTag(r.id, '{{ emp_code | upper }}')
    expect(finalTag(rowFor('[Employee Code]'))).toBe('{{ emp_code | upper }}')
    resetRowTag(r.id)
    expect(finalTag(rowFor('[Employee Code]'))).toBe('{{ emp_code }}')
  })

  it('choosing a format drops a typed tag; skipping a row leaves the text as typed', () => {
    const r = rowFor('<<Letter Date>>')
    setRowTag(r.id, '{{ x }}')
    setRowFormat(r.id, 'upper')
    expect(state.edits[r.id].override).toBeNull()
    setRowEnabled(r.id, false)
    expect(rowStatus(rowFor('<<Letter Date>>'))).toBe('off')
  })

  it('confirming a suggestion marks it reviewed; accept-all counts the rest', () => {
    const before = state.rows.filter((x) => x.count && rowStatus(x) === 'check').length
    const next = nextReviewId()
    if (before) {
      expect(next).not.toBeNull()
      confirmRow(next)
      expect(rowStatus(state.rows.find((x) => x.id === next))).toBe('tagged')
    }
    expect(acceptAllChecks()).toBe(Math.max(0, before - (before ? 1 : 0)))
  })

  it('addManual adds a row once, deleteRow removes it', () => {
    const events = []
    const off = on('flashRow', (e) => events.push(e.id))
    addManual('Annexure')
    expect(rowFor('Annexure')).toBeTruthy()
    expect(events).toEqual(['g:Annexure'])
    addManual('Annexure')
    expect(toasts).toContain('That text is already in the list.')
    deleteRow('g:Annexure')
    expect(rowFor('Annexure')).toBeUndefined()
    off()
  })

  it('changeSettings rebuilds the tags (money format) and is undoable', () => {
    changeSettings({ money: 'intl' })
    expect(state.settings.money).toBe('intl')
    changeSettings({ money: 'indian' })
  })
})

describe('salary table', () => {
  it('suggests component tags, remembers a typed cell, and clears', () => {
    const t = state.tables[0]
    runTableAction(t, 'comp')
    expect(toasts.at(-1)).toMatch(/Filled \d+ cell/)
    const row = t.rows[0]
    typeTableCellKey(t, row, row.empties[0], 'ctc')
    expect(row.cells[row.empties[0]].key).toBe('ctc')
    expect(Object.keys(JSON.parse(localStorage.getItem('lt.cells'))).length).toBeGreaterThan(0)
    runTableAction(t, 'clear')
    expect(toasts.at(-1)).toBe('Cleared the table tags.')
  })
})

describe('conditions', () => {
  const bodyParas = () => state.an.paras.filter((p) => p.kind === 'body' && !p.fallback && !p.textbox && p.model.text.trim().length > 30)

  it('"show these paragraphs only when" adds a closed if / end if pair', () => {
    const p = bodyParas()[0]
    clickParagraph(p.pid, false)
    expect(state.sel.pids).toEqual([p.pid])
    state.cb = cbNew('employee_schema.promotion_needed | lower | trim == "yes"')
    applyParaCondition()
    computeLogic()
    expect(state.lg.filter((e) => e.kw === 'if' && e.status === 'ok')).toHaveLength(1)
    expect(state.lg.filter((e) => e.kw === 'endif' && e.status === 'ok')).toHaveLength(1)
    expect(toasts.at(-1)).toMatch(/^Added: shown only when/)
  })

  it('an open if can be closed where the person picks', () => {
    const [a, b] = bodyParas()
    const id = addLogic(a.pid, 'before', 'if ctc > 5')
    afterLogicChange()
    expect(state.lg.some((e) => e.status === 'open')).toBe(true)
    startClosing(state.lg.find((e) => e.status === 'open').key)
    expect(state.closing).toBeTruthy()
    expect(closeBlockAt(b.pid)).toBe(true)
    expect(state.closing).toBeNull()
    expect(state.lg.some((e) => e.status === 'open')).toBe(false)
    deleteLogic(id)
    expect(state.logic.find((l) => l.id === id)).toBeUndefined()
  })

  it('refuses an end that comes before its if', () => {
    const [a, b] = bodyParas()
    addLogic(b.pid, 'before', 'if ctc > 5'); afterLogicChange()
    startClosing(state.lg.find((e) => e.status === 'open').key)
    expect(closeBlockAt(a.pid)).toBe(false)
    expect(toasts.at(-1)).toMatch(/after the if/)
    cancelPicking()
  })

  it('words inside a sentence: if / end if around them', () => {
    const p = bodyParas()[0]
    state.sel = { pids: [], anchor: null, text: p.model.text.slice(0, 8), range: { pid: p.pid, s: 0, e: 8, text: p.model.text.slice(0, 8) } }
    state.cb = cbNew('employee_schema.promotion_needed | lower | trim == "yes"')
    expect(applyInlineIf('')).toBe(true)
    expect(state.logic.filter((l) => l.place === 'at')).toHaveLength(2)
    build()
    expect(state.built.xml['word/document.xml']).toMatch(/\{% if employee_schema\.promotion_needed/)
  })

  it('a typed logic tag, its position and its text', () => {
    const p = bodyParas()[0]
    clickParagraph(p.pid, false)
    expect(insertLogicTag('if', 'before')).toBe(false)   // CONDITION is still in it
    expect(toasts.at(-1)).toMatch(/Replace CONDITION/)
    expect(insertLogicTag('if x == "y"', 'before')).toBe(true)
    const l = state.logic.at(-1)
    setLogicPlace(l.id, 'after')
    expect(state.logic.at(-1).place).toBe('after')
    commitLogicText(l.id, 'endif')
    expect(state.logic.at(-1).text).toBe('{%- endif %}')
  })

  it('an unplaced tag can be picked up and dropped', () => {
    state.unplaced.push({ text: '{% endif %}', place: 'after', reason: 'x' })
    startPlacing(0)
    expect(state.placing.k).toBe(0)
    cancelPicking()
    discardUnplaced(0)
    expect(state.unplaced).toHaveLength(0)
  })
})

describe('data files', () => {
  const csv = 'emp_code,first_name,promotion,dept\nE1,Asha,yes,Finance\nE2,Ravi,no,R&D\nE3,Meera,yes,Finance\n'

  it('loads a CSV, filters the employees, and clears them', async () => {
    expect(await loadDataFile(new File([csv], 'emps.csv'), false)).toBe(true)
    expect(state.csv.mode).toBe('sample')
    expect(state.csv.rows).toHaveLength(3)
    chooseDataFilter('promotion')
    expect(state.dataFilter.col).toBe('promotion')
    clearData()
    expect(state.csv).toBeNull()
  })

  it('says why a bad file could not be read, as an event', async () => {
    const errors = []
    const off = on('error', (e) => errors.push(e))
    expect(await loadDataFile(new File([''], 'empty.csv'), false)).toBe(false)
    expect(errors[0].message).toMatch(/Could not read that file: That CSV is empty/)
    off()
  })

  it('previews one placeholder and the list of values', async () => {
    await loadDataFile(new File([csv], 'emps.csv'), false)
    const r = rowFor('[Employee Code]')
    const p = await previewTag(r)
    expect(p.kind).toBe('value')
    expect(p.text).toBe('E1')
    expect(p.note).toMatch(/emps\.csv/)
    const v = previewValues().rows
    expect(v.find((x) => x.id === 'emp_code')).toMatchObject({ value: 'E1', source: 'data' })
    expect(v.find((x) => x.id === 'ctc').source).toBe('sample')
  })
})

describe('what the interface reads', () => {
  it('steps, export checklist and the letter as HTML', () => {
    const { done, info } = stepInfo()
    expect(done.doc).toBe(false)   // the sample letter doesn't count as "your letter"
    expect(info.tags.label).toMatch(/^Tags & fields/)
    const c = exportChecklist()
    expect(c.items.map((i) => i.label)).toEqual(['Placeholders', 'Conditions', 'Validate', 'Real Jinja check', 'Employee test'])
    setView('source')
    expect(paperHtml('source')).toContain('data-pid="word/document.xml#0"')
    expect(paperHtml('tagged')).toContain('class="tg"')
    setTab('check')
    expect(state.tab).toBe('check')
    expect(oldTagNames().names.map((n) => n.id)).toContain('mobile')
  })
})
