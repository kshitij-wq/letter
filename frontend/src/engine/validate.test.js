import { beforeEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import process from 'node:process'
import { batchView, build, checkView, engineStatus, flagList, ingestCsv, issueByKey, loadDocx, placeChips, runBatch, runIssueFix, sampleDocx, server, state, stopBatch } from './index.js'

// The data half of the Validate step: what the screen reads instead of the old renderChecks / renderBatch.
beforeEach(async () => {
  localStorage.clear(); state.learned = {}; state.learnedCells = {}
  server.ok = false; server.probed = true; server.check = null; server.err = null; server.checking = false; server.info = null; delete window.claude
  await loadDocx(await sampleDocx(), 'sample-appraisal-letter.docx', true)
  state.batch = null; state.batchOnlyBad = undefined
})

// a made-up tagged template with two typing mistakes (tests_ui/fixtures)
async function loadBroken() {
  const b = readFileSync(process.cwd() + '/../tests_ui/fixtures/broken_tagged.docx')
  await loadDocx(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), 'broken_tagged.docx', false)
  build()
}

describe('checkView', () => {
  it('counts what the findings say and groups them by category', () => {
    build()
    const v = checkView()
    const all = v.groups.flatMap((g) => g.items)
    expect(v.counts.errors).toBe(all.filter((x) => x.level === 'error').length)
    expect(v.counts.warnings).toBe(all.filter((x) => x.level === 'warn').length)
    expect(v.counts.notes).toBe(all.filter((x) => x.level === 'info').length)
    expect(v.groups.every((g) => g.items.length > 0 && g.items.every((x) => x.cat === g.cat))).toBe(true)
    expect(all.map((x) => x.idx)).toEqual(all.map((_, i) => i))   // indexes run in display order
    expect(new Set(all.map((x) => x.key)).size).toBe(all.length)   // keys are unique
  })

  it('is never "clean" while problems remain, and says so when only the page checks ran', () => {
    build()
    const v = checkView()
    if (v.counts.errors || v.counts.warnings) expect(v.clean).toBe(false)
    state.issues = []; state.issueGroups = []; state.ckFixed = []
    const clean = checkView()
    expect(clean.clean).toBe(true)                 // page checks only (back end off, probe done)
    expect(clean.cleanText).toMatch(/isn't available here, so this is the page checks only/)
    server.ok = true; server.check = null; server.info = { versions: { docxtpl: '9.9' } }
    const waiting = checkView()
    expect(waiting.clean).toBe(false)              // real Jinja has not answered yet: not confirmed
    expect(waiting.engine.kind).toBe('notrun')
    server.check = { syntax: [], variables: ['a', 'b'], target: 'file' }
    const ok = checkView()
    expect(ok.clean).toBe(true)
    expect(ok.engine).toMatchObject({ kind: 'passed' })
    expect(ok.engine.title).toMatch(/docxtpl 9\.9.*2 fields used/)
    expect(ok.cleanText).toMatch(/Real Jinja \(docxtpl 9\.9\)/)
  })

  it('engineStatus words every state of the real check', () => {
    server.probed = false
    expect(engineStatus().kind).toBe('none')
    server.probed = true
    expect(engineStatus()).toMatchObject({ kind: 'unavailable' })
    server.ok = true; server.info = {}
    server.err = 'The server answered 500.'
    expect(engineStatus()).toMatchObject({ kind: 'error', title: "Real Jinja check didn't run: The server answered 500." })
    server.err = null; server.checking = true
    expect(engineStatus().title).toBe('Checking with real Jinja…')
    server.check = { syntax: [{}, {}], variables: [], target: 'built' }
    expect(engineStatus().title).toBe('Checking again with real Jinja…')
    server.checking = false
    const f = engineStatus()
    expect(f.kind).toBe('failed'); expect(f.title).toMatch(/2 typing mistakes/); expect(f.detail).toMatch(/with your changes/)
  })

  it('flags are the findings with a place, keyed per paragraph, and look up by key', async () => {
    await loadBroken()
    const flags = flagList()
    expect(flags.length).toBeGreaterThan(0)
    for (const f of flags) {
      expect(f.letter).toMatch(/^[A-Z]+$/)
      expect(['error', 'warn']).toContain(f.level)
      expect(state.an.byPid.has(f.pid)).toBe(true)
      expect(issueByKey(f.issueKey)).toMatchObject({ letter: f.letter, idx: f.index })
    }
    expect(issueByKey('nope')).toBeNull()
    const before = new Map(flags.map((f) => [f.issueKey, f.letter]))
    build()   // same problems again: the same letters
    for (const f of flagList()) expect(before.get(f.issueKey)).toBe(f.letter)
  })

  it('runs the one-click fix of a finding, and the finding goes', async () => {
    await loadBroken()
    expect(checkView().counts.errors).toBe(2)
    const fixable = checkView().groups.flatMap((g) => g.items).find((x) => x.fix)
    expect(fixable).toBeTruthy()
    expect(runIssueFix(fixable.fix.idx)).toBe(true)
    expect(checkView().counts.errors).toBe(1)
    expect(runIssueFix(99999)).toBe(false)
  })

  it('placeChips skips places that no longer exist', () => {
    const pid = [...state.an.byPid.keys()][0]
    expect(placeChips([pid, 'gone#1'])).toHaveLength(1)
  })
})

describe('batchView', () => {
  const csv = 'Employee Code,First Name\nE1,Asha\nE2,Ben\nE3,Chitra\n'

  it('explains an empty state, then reports a finished test', async () => {
    expect(batchView()).toMatchObject({ rows: 0, status: 'none' })
    expect(batchView().noRowsText).toMatch(/Load a CSV or Excel file/)
    ingestCsv(csv, 'people.csv')
    expect(batchView().src).toMatchObject({ name: 'people.csv', count: 3 })
    await runBatch()
    const v = batchView()
    expect(v.status).toBe('done')
    expect(v.done.total).toBe(3)
    expect(v.done.list.length).toBe(v.done.only ? v.done.bad : 3)
    expect(v.stats).toMatch(/\d+ fine · \d+ to look at/)
  })

  it('is never all clear when the back end is on and real Jinja has not confirmed', async () => {
    ingestCsv(csv, 'people.csv')
    await runBatch()
    const B = state.batch
    B.perEmp.forEach((x) => { x.n = 0 }); B.groups.clear()
    server.ok = true; server.info = {}
    B.real = null; B.realErr = null; B.realRunning = false
    let v = batchView()
    expect(v.done.allClear).toBe(false)
    B.real = { employees: { tested: 3, failed: [] } }
    v = batchView()
    expect(v.done.real.kind).toBe('passed')
    expect(v.done.allClear).toBe(true)
    B.realErr = 'boom'
    v = batchView()
    expect(v.done.real.kind).toBe('error')
    expect(v.done.allClear).toBe(false)
    B.realErr = null; B.stale = true
    expect(batchView().done.allClear).toBe(false)   // the template changed since
  })

  it('without the back end a clean run is "page only", not a green light', async () => {
    ingestCsv(csv, 'people.csv')
    await runBatch()
    const B = state.batch
    B.perEmp.forEach((x) => { x.n = 0 }); B.groups.clear()
    const v = batchView()
    expect(v.done.pageOnly).toBe(true)
    expect(v.done.real.kind).toBe('none')
  })

  it('a stopped run is not all clear', async () => {
    ingestCsv(csv, 'people.csv')
    const run = runBatch()
    stopBatch()
    await run
    const v = batchView()
    expect(v.done.cancelled || v.done.total === 3).toBe(true)
    if (v.done.cancelled) expect(v.done.allClear).toBe(false)
  })
})
