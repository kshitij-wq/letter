import { beforeEach, describe, expect, it } from 'vitest'
import {
  applyCombine, build, dataColumnFor, resolveLabel, combineCancel, edit, exportChecklist, exportGate, ingestCsv, loadDataFile, loadDocx, on, loadVersions, notify, sampleDocx, saveStatusText, state, unsavedWork,
} from './index.js'
import { versionFile as file } from './testkit.js'


describe('combined template still on the placeholder version field', () => {
  beforeEach(async () => {
    combineCancel(); localStorage.clear(); state.csv = null; state.csvExtra = []
    await loadVersions(['promotion.docx', 'variable-pay.docx', 'no-increase.docx', 'bonus-only.docx'].map(file))
    await applyCombine()
    build()
  })

  it('warns in plain words, in Conditions, and the export gate counts it', () => {
    const w = state.built.checks.find((c) => /Choose which employee field decides the version/.test(c.html))
    expect(w && w.level).toBe('warn')
    expect(exportGate().warnings.some((x) => x.label === 'Validate')).toBe(true)
    expect(exportChecklist().items.find((i) => i.label === 'Validate').kind).toBe('warn')
  })

  it('stops warning once the data has a real letter_version column', () => {
    ingestCsv('emp,letter_version\nE1,promotion\nE2,bonus_only', 'emps.csv')
    build()
    expect(state.built.checks.some((c) => /decides the version/.test(c.html))).toBe(false)
  })
})

describe('export gate', () => {
  beforeEach(async () => { localStorage.clear(); state.csv = null; state.csvExtra = []; await loadDocx(await sampleDocx(), 'sample.docx', true); build() })

  it('has no errors on the sample and lists what is left as warnings', () => {
    const g = exportGate()
    expect(g.errors).toEqual([])
    expect(g.warnings.every((x) => x.label && x.text && x.step)).toBe(true)
  })
})

describe('leave-the-page guard and header status', () => {
  beforeEach(async () => { localStorage.clear(); await loadDocx(await sampleDocx(), 'client.docx', false) })

  it('is quiet until something is changed, then asks until saved to a file', () => {
    expect(unsavedWork()).toBe(false)
    const r = state.rows.find((x) => x.count)
    edit(r.id, { key: 'custom_schema.something' }); notify()
    expect(unsavedWork()).toBe(true)
  })

  it('never asks for the sample letter', async () => {
    await loadDocx(await sampleDocx(), 'sample.docx', true)
    expect(unsavedWork()).toBe(false)
  })

  it('says a change made in Edit letter happened', () => {
    expect(saveStatusText()).toBe('Not changed yet')
    state.editedAt = Date.now()
    expect(saveStatusText()).toMatch(/^Edited in Edit letter/)
    expect(unsavedWork()).toBe(true)
  })
})

describe('data columns', () => {
  beforeEach(async () => { localStorage.clear(); state.csv = null; state.csvExtra = []; await loadDocx(await sampleDocx(), 'sample.docx', true) })

  it('[Department] offers the dept column of the data, but does not apply it', () => {
    expect(dataColumnFor('employee_schema.department')).toBe('')
    ingestCsv('emp_code,dept\nE1,Finance\nE2,Sales', 'emps.csv')
    expect(dataColumnFor('employee_schema.department')).toBe('dept')
    expect(dataColumnFor('dept')).toBe('')
    expect(resolveLabel('Department').key).toBe('employee_schema.department')
  })

  it('a header-only CSV says so instead of "Loaded"', async () => {
    const f = { name: 'h.csv', text: async () => 'emp_code,first_name,dept' }
    const toasts = []
    const off = on('toast', (m) => toasts.push(m))
    await loadDataFile(f)
    off && off()
    expect(toasts.join(' ')).toMatch(/No employees in h\.csv/)
  })
})
