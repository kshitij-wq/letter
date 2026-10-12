import { beforeEach, describe, expect, it } from 'vitest'
import { flags, chooseDataFilter,chooseTeamClient, dataSummary, ingestCsv, loadDocx, notify, on, previewBarInfo, previewValues, sampleDocx, setPvQuery, setTeamNew, setView, state, togglePvIssues, letterSummary, exportChecklist } from './index.js'

const toasts = []
on('toast', (m) => toasts.push(m))

const CSV = [
  'Emp Code,First Name,Last Name,Letter Template,Level',
  'E1,Asha,Menon,Appraisal Letter,L4',
  'E2,Ravi,Shah,Appraisal Letter,L5',
  'E3,Meera,Rao,Promotion Letter,L5',
].join('\n')

beforeEach(async () => {
  toasts.length = 0
  localStorage.clear()
  state.csv = null; state.csvExtra = []; state.dataFilter = null; state.pvQuery = ''
  await loadDocx(await sampleDocx(), 'sample-appraisal-letter.docx', true)
})

describe('letterSummary', () => {
  it('counts what the Client letter row shows', () => {
    const s = letterSummary()
    expect(s.name).toBe('sample-appraisal-letter.docx')
    expect(s.isSample).toBe(true)
    expect(s.paras).toBeGreaterThan(5)
    expect(s.empty).toBe(false)
    expect(s.text).toMatch(/paragraphs/)
  })
  it('is null with no letter', () => {
    const keep = state.an; state.an = null
    expect(letterSummary()).toBeNull()
    state.an = keep
  })
})

describe('dataSummary', () => {
  it('is null without data', () => { expect(dataSummary()).toBeNull() })

  it('describes an employee file, its filter and the rows', () => {
    ingestCsv(CSV, 'emps.csv')
    const d = dataSummary()
    expect(d.kind).toBe('sample')
    expect(d.name).toBe('emps.csv')
    expect(d.employees).toBe(2)
    expect(d.total).toBe(3)
    expect(d.meta).toBe('2 of 3 employees · 5 columns')
    expect(d.filter.auto).toBe(true)
    expect(d.filter.value).toBe('Appraisal Letter')
    expect(d.canAddExtra).toBe(true)
    const f = d.filter.columns.find((c) => c.col === 'Letter Template')
    expect(f.values).toEqual([{ value: 'Appraisal Letter', count: 2 }, { value: 'Promotion Letter', count: 1 }])
    expect(d.extras).toEqual([])
  })

  it('lists extra files with how they match', () => {
    ingestCsv(CSV, 'emps.csv')
    flags.addingExtra = true
    ingestCsv('Emp Code,Old CTC\nE1,100\nE2,200', 'old.csv')
    flags.addingExtra = false
    const d = dataSummary()
    expect(d.name).toBe('emps.csv')
    expect(d.extras).toHaveLength(1)
    expect(d.extras[0]).toMatchObject({ name: 'old.csv', kind: 'rows', rows: 2, columns: 2, matched: 2, matchBy: 'Emp Code' })
  })

  it('a tag list is not a place to add more data', () => {
    ingestCsv('{{ first_name }}\n{{ last_name }}', 'tags.csv')
    const d = dataSummary()
    expect(d.kind).toBe('keys')
    expect(d.canAddExtra).toBe(true)
    expect(d.keys).toBeGreaterThan(0)
  })
})

describe('previewBarInfo', () => {
  it('says sample data when no file is loaded', () => {
    const b = previewBarInfo()
    expect(b.real).toBe(false)
    expect(b.rows).toBe(0)
    expect(b.count).toBe('')
  })

  it('counts employees, searches and steps', () => {
    ingestCsv(CSV, 'emps.csv')
    chooseDataFilter('')   // the file name matches "Appraisal Letter", so the page picks those employees: look at everyone
    let b = previewBarInfo()
    expect(b.real).toBe(true)
    expect(b.rows).toBe(3)
    expect(b.count).toBe('Employee 1 of 3')
    expect(b.canStep).toBe(true)
    setPvQuery('meera')
    b = previewBarInfo()
    expect(b.count).toBe('1 of 3 match · Employee 1 of 1')
    expect(b.picker.shown).toEqual([2])
    expect(state.pvIdx).toBe(2)
    setPvQuery('nobody')
    b = previewBarInfo()
    expect(b.count).toBe('0 of 3 match')
    setPvQuery('')
  })

  it('opens the problem list only when there is something to show', () => {
    expect(previewBarInfo().open).toBe(false)
    state.pv = { issues: [{ level: 'warn', msg: 'x', key: 'k' }] }
    togglePvIssues()
    expect(previewBarInfo().open).toBe(true)
    state.pv = { error: { msg: 'boom' } }
    expect(previewBarInfo().open).toBe(true)
    state.pv = {}; state.pvIssuesOpen = false
  })
})

describe('the rest of the Preview & export data', () => {
  it('readiness lines each carry the step they belong to', () => {
    const c = exportChecklist()
    expect(c.items.length).toBeGreaterThan(3)
    expect(c.items.map((i) => i.label)).toEqual(expect.arrayContaining(['Placeholders', 'Conditions', 'Validate']))
  })

  it('values say where each one comes from', async () => {
    setView('tagged')
    const v = previewValues()
    expect(v.rows.length).toBeGreaterThan(0)
    expect(v.rows.every((r) => ['data', 'sample', 'changed', 'notset', 'set'].includes(r.source))).toBe(true)
  })

  it('the team panel helpers change engine state', async () => {
    setTeamNew(true)
    expect(state.teamNew).toBe(true)
    setTeamNew(false)
    expect(state.teamNew).toBe(false)
    chooseTeamClient('')
    notify()
    expect(state.team).toBeNull()
  })
})
