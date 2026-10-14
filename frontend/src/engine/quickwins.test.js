import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  applyCombine, build, combineCancel, exportChecklist, exportGate, ingestCsv, loadDocx, loadVersions, sampleDocx, state,
} from './index.js'

// eslint-disable-next-line no-undef
const FIX = resolve(process.cwd(), '../tests_ui/fixtures/versions')
const file = (name) => { const b = readFileSync(resolve(FIX, name)); return { name, arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) } }

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

