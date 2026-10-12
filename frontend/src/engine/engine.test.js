import { beforeAll, describe, expect, it } from 'vitest'
import api, { buildCtx, getCompiled, getRev, loadDocx, mappingCsv, notify, on, parseRendered, renderEmployee, sampleDocx, state, subscribe, toast, exportSetup, importSetup, undo, redo, recordUndo, build } from './index.js'

// The engine runs in jsdom here (it needs DOMParser / XMLSerializer for the .docx XML). The full old-page comparison is tests_ui/parity.py.
describe('change notification', () => {
  it('batches notify() calls into one callback per microtask', async () => {
    let n = 0
    const off = subscribe(() => { n++ })
    const before = getRev()
    notify(); notify(); notify()
    expect(getRev()).toBe(before + 3)
    expect(n).toBe(0)
    await Promise.resolve()
    expect(n).toBe(1)
    off()
    notify(); await Promise.resolve()
    expect(n).toBe(1)
  })
  it('delivers events (toasts) to listeners', () => {
    const got = []
    const off = on('toast', (m) => got.push(m))
    toast('hello')
    off(); toast('ignored')
    expect(got).toEqual(['hello'])
  })
  it('publishes the old test hook', () => {
    for (const name of ['state', 'buildBlob', 'loadDocx', 'ingestCsv', 'build', 'analyze', 'getCompiled', 'refreshPreview', 'runBatch', 'exportSetup', 'importSetup', 'undo', 'redo', 'setTab', 'setView', 'renameEverywhere', 'applyMerge', 'loadMergeB', 'applySwitch', 'HISTORY', 'buildCtx', 'renderEmployee', 'parseRendered', 'buildModel', 'cbNew', 'cbExpr', 'cbParse', 'cbEmployee']) {
      expect(window.__lt, name).toHaveProperty(name)
    }
    expect(window.__lt.state).toBe(state)
    expect(api.state).toBe(state)
  })
})

describe('the sample letter through the engine', () => {
  beforeAll(async () => { await loadDocx(await sampleDocx(), 'sample-appraisal-letter.docx', true) })

  it('finds the placeholders', () => {
    const finds = state.rows.map((r) => r.find)
    expect(finds).toContain('[Employee Code]')
    expect(finds).toContain('<<Letter Date>>')
    expect(finds).toContain('XXXX')
    expect(state.rows.find((r) => r.find === '[Employee Code]').key).toBe('emp_code')
    expect(state.tables.length).toBe(1)
  })

  it('builds a template with tags and runs the checks', () => {
    build()
    expect(state.built.xml['word/document.xml']).toContain('{{ emp_code }}')
    expect(Array.isArray(state.built.checks)).toBe(true)
    expect(mappingCsv()).toMatch(/^﻿Text in letter,CompUp tag/)
  })

  it('fills the letter for sample values with the bundled preview engine', async () => {
    const comp = await getCompiled()
    expect(comp.error).toBeFalsy()
    const info = buildCtx(null)
    const r = renderEmployee(comp, info.ctx)
    expect(r.error).toBeFalsy()
    const pr = parseRendered(r.xml)
    expect(pr.broken).toBeFalsy()
    expect(r.xml['word/document.xml']).toContain('E1042')
  })

  it('exports the setup, and undo / redo go back and forth', () => {
    recordUndo()
    state.edits['g:XXXX'] = { key: 'ctc' }
    const setup = JSON.parse(JSON.stringify(exportSetup()))
    expect(setup.format).toBe('compup-letter-tagger-setup')
    expect(setup.edits['g:XXXX']).toEqual({ key: 'ctc' })
    undo()
    expect(state.edits['g:XXXX']).toBeUndefined()
    redo()
    importSetup(setup, { noUndo: true })
    expect(state.edits['g:XXXX']).toEqual({ key: 'ctc' })
  })
})
