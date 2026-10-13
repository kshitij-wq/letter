import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, beforeEach } from 'vitest'
import {
  alignVersions, applyCombine, autoValues, slugOf, build, cbParse, combineCancel, combineMove, combineSetBase, combineSetLoose, combineView, groupCondition, groupRegion,
  loadVersions, on, planVersions, regionBranches, state, undo,
} from './index.js'

const P = (text) => ({ kind: 'p', text })
const T = (text) => ({ kind: 'tbl', text: '[table] ' + text })
const cfgOf = (labels) => ({ versions: labels.map((label, i) => ({ id: 'v' + i, label })) })

describe('alignment', () => {
  it('keeps text that is the same in every version once and finds the places that differ', () => {
    const a = [P('Dear'), P('promo text'), P('Regards')]
    const b = [P('Dear'), P('variable text'), P('Regards')]
    const c = [P('Dear'), P('no increase'), P('Regards')]
    const al = alignVersions([a, b, c])
    expect(al.sameCount).toBe(2)
    expect(al.regions).toHaveLength(1)
    expect(al.regions[0].content.map((x) => x.map((y) => y.text))).toEqual([['promo text'], ['variable text'], ['no increase']])
  })
  it('handles a paragraph only some versions have, in the right place', () => {
    const a = [P('1'), P('extra'), P('2')]
    const b = [P('1'), P('2')]
    const al = alignVersions([a, b])
    expect(al.merged.map((e) => e.text)).toEqual(['1', 'extra', '2'])
    expect(al.regions).toHaveLength(1)
    expect(al.regions[0].content[1]).toEqual([])
  })
  it('puts a block that only the later version has between the common ones', () => {
    const al = alignVersions([[P('1'), P('2')], [P('1'), P('new'), P('2')]])
    expect(al.merged.map((e) => e.text)).toEqual(['1', 'new', '2'])
    expect(al.regions[0].content.map((x) => x.length)).toEqual([0, 1])
  })
  it('uses the chosen base first and ignores small number differences when asked', () => {
    const a = [P('Pay is 100 now'), P('x')]
    const b = [P('Pay is 250 now'), P('y')]
    expect(alignVersions([a, b], { loose: true }).sameCount).toBe(1)
    expect(alignVersions([a, b], { loose: false }).sameCount).toBe(0)
    const al = alignVersions([a, b], { base: 1 })
    expect(al.order).toEqual([1, 0])
    expect(al.merged[0].text).toBe('Pay is 250 now')
  })
  it('a table that differs in a row is one difference', () => {
    const al = alignVersions([[P('a'), T('x | 1'), P('z')], [P('a'), T('x | 2'), P('z')]], { loose: false })
    expect(al.regions).toHaveLength(1)
    expect(al.regions[0].content.map((x) => x[0].kind)).toEqual(['tbl', 'tbl'])
  })
  it('different regions stay separate; three versions agree in the middle', () => {
    const lists = [[P('a'), P('x1'), P('m'), P('y1')], [P('a'), P('x2'), P('m'), P('y2')], [P('a'), P('x1'), P('m'), P('y1')]]
    const al = alignVersions(lists, { loose: false })
    expect(al.regions).toHaveLength(2)
    expect(al.sameCount).toBe(2)
  })
})

describe('grouping', () => {
  it('groups versions with the same text and marks empty groups', () => {
    const lists = [[P('a'), P('X'), P('z')], [P('a'), P('Y'), P('z')], [P('a'), P('X'), P('z')], [P('a'), P('z')]]
    const plan = planVersions(lists)
    expect(plan.regions).toHaveLength(1)
    const g = plan.regions[0].groups
    expect(g.map((x) => x.versions)).toEqual([[0, 2], [1], [3]])
    expect(g.map((x) => x.empty)).toEqual([false, false, true])
  })
  it('a region where only blank lines differ is not a difference', () => {
    const plan = planVersions([[P('a'), P('')], [P('a')]])
    expect(plan.regions).toHaveLength(0)
  })
  it('groupRegion follows the order given', () => {
    const r = { content: [[P('A')], [P('B')], [P('A')]] }
    expect(groupRegion(r, [2, 0, 1]).map((x) => x.versions)).toEqual([[2, 0], [1]])
  })
})

describe('conditions', () => {
  it('every version gets a condition on the placeholder field, made from its name', () => {
    const cfg = cfgOf(['Promotion', 'Variable pay', 'Promotion'])
    expect(slugOf('No increase (2024)')).toBe('no_increase_2024')
    expect(autoValues(cfg)).toEqual({ v0: 'promotion', v1: 'variable_pay', v2: 'promotion_2' })
    expect(groupCondition(cfg, [1])).toBe('custom_schema.letter_version | string | lower | trim == "variable_pay"')
    expect(cbParse(groupCondition(cfg, [1]))).toBeTruthy()
  })
  it('versions that share a text are joined with "or", each in brackets, and stay readable', () => {
    const cfg = cfgOf(['Promotion', 'Variable pay'])
    expect(groupCondition(cfg, [0, 1])).toBe('(custom_schema.letter_version | string | lower | trim == "promotion") or (custom_schema.letter_version | string | lower | trim == "variable_pay")')
    expect(cbParse(groupCondition(cfg, [0, 1]))).toBeTruthy()
  })
})

describe('branches', () => {
  const lists = [[P('a'), P('X'), P('z')], [P('a'), P('Y'), P('z')], [P('a'), P('z')]]
  const region = () => planVersions(lists).regions[0]
  it('writes if / elif and leaves the empty group without a branch', () => {
    const b = regionBranches(region(), cfgOf(['A', 'B', 'C']))
    expect(b.map((x) => x.kind)).toEqual(['if', 'elif'])
    expect(b.map((x) => x.group.versions)).toEqual([[0], [1]])
    expect(b[1].cond).toContain('"b"')
  })
})

// ---- the real fixtures through the engine ----
// eslint-disable-next-line no-undef
const FIX = resolve(process.cwd(), '../tests_ui/fixtures/versions')
const file = (name) => {
  const b = readFileSync(resolve(FIX, name))
  return { name, arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) }
}
const NAMES = ['promotion.docx', 'variable-pay.docx', 'no-increase.docx', 'bonus-only.docx']
const toasts = []
on('toast', (m) => toasts.push(m))

describe('combining the four fixture versions', () => {
  beforeEach(async () => {
    toasts.length = 0; combineCancel(); localStorage.clear()
    await loadVersions(NAMES.map(file))
  })

  it('reads the files, reports each bad one in plain words, and summarises', async () => {
    const view = combineView()
    expect(view.ready).toBe(true)
    expect(view.differ).toBe(3)   // paragraph + extra, table, sign line
    const r = await loadVersions([{ name: 'notes.txt', arrayBuffer: async () => new ArrayBuffer(3) }, { name: 'broken.docx', arrayBuffer: async () => new TextEncoder().encode('nope').buffer }])
    expect(r.errors).toEqual(['notes.txt is not a .docx file.', 'broken.docx is not a .docx file.'])
    expect(state.combine.versions).toHaveLength(4)
  })

  it('shares one paragraph between two versions and gives the empty version no branch', () => {
    const v = combineView()
    const para = v.regions.find((r) => r.groups.some((g) => g.versions.length === 2 && g.texts[0] && /variable pay/.test(g.texts[0])))
    expect(para.groups.map((g) => g.versions)).toEqual([['promotion'], ['variable-pay', 'bonus-only'], ['no-increase']])
    expect(para.groups[1].english).toMatch(/variable_pay/)
    expect(para.groups[1].english).toMatch(/bonus_only/)
    const sign = v.regions.find((r) => r.groups.some((g) => g.texts[0] && /sign and return/.test(g.texts[0])))
    expect(sign.groups.find((g) => g.empty).versions).toEqual(['no-increase'])
  })

  it('combines in one undo step with if / elif / endif lines that cbParse can read', async () => {
    const before = state.combine.versions[0].buf
    const rep = await applyCombine()
    expect(rep.regions).toBe(3)
    expect(state.combine).toBeNull()
    expect(state.tab).toBe('logic')
    expect(state.logic.every((l) => l.mg)).toBe(true)
    build()
    const xml = state.built.xml['word/document.xml']
    const tags = [...xml.matchAll(/\{%-?\s*(if|elif|else|endif)[^%]*-?%\}/g)].map((m) => m[1])
    expect(tags.filter((t) => t === 'if').length).toBe(tags.filter((t) => t === 'endif').length)
    expect(tags.filter((t) => t === 'if').length).toBe(3)
    expect(xml).toContain('Your variable pay for the year')
    expect(xml).toContain('After this year')
    for (const l of state.logic.filter((x) => /^\{%-? *(if|elif)/.test(x.text))) expect(cbParse(l.text)).toBeTruthy()
    expect(toasts.join(' ')).toMatch(/Combined 4 versions. Each difference is an if \/ else block/)
    undo()
    build()
    expect(state.built.xml['word/document.xml']).not.toContain('After this year')
    expect(state.logic).toHaveLength(0)
    expect(before.byteLength).toBeGreaterThan(0)
  })

  it('another base version keeps its own text in place', async () => {
    combineSetBase(state.combine.versions[2].id)
    await applyCombine()
    expect(state.fileName).toBe('no-increase.docx')
    build()
    expect(state.built.xml['word/document.xml']).toContain('After this year')
  })

  it('moving a version keeps the base', async () => {
    const [a, , c] = state.combine.versions
    combineSetBase(c.id); combineMove(a.id, 1)
    expect(state.combine.versions[state.combine.base].id).toBe(c.id)
    expect(combineView().ready).toBe(true)
    await applyCombine()
    expect(state.logic.some((l) => /\{%-\s*else/.test(l.text))).toBe(false)
  })

  it('every version is switched on the placeholder field, made from its name', async () => {
    const view = combineView()
    expect(view.ready).toBe(true)
    expect(view.autoField).toBe('custom_schema.letter_version')
    const rep = await applyCombine()
    expect(rep.regions).toBe(3)
    const conds = state.logic.filter((x) => /^\{%-? *(if|elif)/.test(x.text)).map((x) => x.text)
    expect(conds.length).toBeGreaterThan(0)
    for (const c of conds) { expect(c).toContain('custom_schema.letter_version'); expect(cbParse(c)).toBeTruthy() }
    expect(conds.join(' ')).toMatch(/== "promotion"/)
    expect(conds.join(' ')).toMatch(/== "no_increase"/)
    expect(toasts.at(-1)).toMatch(/set who sees which in Conditions/)
  })

  it('the "ignore small differences" switch changes what counts as a difference', () => {
    expect(state.combine.loose).toBe(true)
    combineSetLoose(false)
    expect(state.combine.loose).toBe(false)
    expect(combineView().ready).toBe(true)
  })

  it('one version only: not ready, and Combine refuses in plain words', async () => {
    combineCancel()
    await loadVersions([file(NAMES[0])])
    expect(combineView().ready).toBe(false)
    expect(await applyCombine()).toBe(false)
    expect(toasts.at(-1)).toMatch(/at least two versions/)
  })
})
