import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, beforeEach } from 'vitest'
import {
  alignVersions, applyCombine, build, cbParse, combineCancel, combineMove, combineSetBase, combineSetLoose, combineSetName, combineView, commonEnds,
  flagFields, joinable, loadVersions, markerText, matchPairs, needCondition, on, parseXml, planVersions, similarText, slugOf, startJoinable, state,
  suggestName, undo,
} from './index.js'

const P = (text) => ({ kind: 'p', text })
const B = () => ({ kind: 'p', text: '' })
const T = (...rows) => ({ kind: 'tbl', text: '[table] ' + rows.join(' | '), rows })
const fields = (plan, labels) => flagFields(plan, labels || plan.order.map((i) => 'v' + i))
// what one version sees: the blocks of the script whose conditions hold for it (the plan's own reading of if / elif / else)
function seen(plan, v, lists) {
  const out = []; const stack = []
  const on = () => stack.every((s) => s.now)
  const holds = (n) => n.terms.some((t) => t.f.set.includes(v) === t.yes)
  for (const s of plan.script) {
    if (s.op === 'mark') {
      if (s.kind === 'if') stack.push({ done: false, now: false })
      const top = stack[stack.length - 1]
      if (s.kind === 'endif') { stack.pop(); continue }
      top.now = !top.done && (s.kind === 'else' || holds(plan.needs[s.need])); top.done ||= top.now
      continue
    }
    const e = plan.merged[s.k]
    if (on() && e.refs[v] != null && !e.blank) out.push(lists[v][e.refs[v]].text)
  }
  return out
}
const textOf = (list) => list.filter((b) => b.text).map((b) => b.text)

describe('alignment', () => {
  it('keeps text that is the same in every version once', () => {
    const al = alignVersions([[P('Dear'), P('promo text'), P('Regards')], [P('Dear'), P('variable text'), P('Regards')], [P('Dear'), P('no increase'), P('Regards')]])
    expect(al.sameCount).toBe(2)
    expect(al.merged.map((e) => e.text)).toEqual(['Dear', 'promo text', 'variable text', 'no increase', 'Regards'])
  })
  it('puts a paragraph only some versions have in its place, from the base or a later version', () => {
    expect(alignVersions([[P('1'), P('extra'), P('2')], [P('1'), P('2')]]).merged.map((e) => e.text)).toEqual(['1', 'extra', '2'])
    expect(alignVersions([[P('1'), P('2')], [P('1'), P('new'), P('2')]]).merged.map((e) => e.text)).toEqual(['1', 'new', '2'])
  })
  it('uses the chosen base first and ignores small number differences when asked', () => {
    const a = [P('Pay is 100 now'), P('x')]; const b = [P('Pay is 250 now'), P('y')]
    expect(planVersions([a, b], { loose: true }).items.filter((i) => i.kind === 'inline')).toHaveLength(0)
    expect(planVersions([a, b], { loose: false }).items.filter((i) => i.kind === 'inline')).toHaveLength(1)
    const al = alignVersions([a, b], { base: 1 })
    expect(al.order).toEqual([1, 0])
    expect(al.merged[0].text).toBe('Pay is 250 now')
  })
  it('a paragraph with a few words changed is one entry (similar), a different paragraph is not', () => {
    const al = alignVersions([[P('Your pay is set, effective today.'), P('z')], [P('Your pay is set, effective today, with your promotion.'), P('z')]])
    expect(al.merged).toHaveLength(2)
    expect(Object.keys(al.merged[0].refs)).toEqual(['0', '1'])
    expect(similarText('We kept your pay.', 'You get a one-time award.')).toBe(false)
    expect(matchPairs([P('a b c d e f')], [P('a b c d e f g')], true)[0][2]).toBe(true)
  })
  it('blank lines count least, so they never pull a real paragraph out of line', () => {
    // the note sits after two blank lines in one version and after one in the other: still one note
    const al = alignVersions([[P('x'), B(), B(), P('note'), P('end')], [P('x'), B(), P('note'), B(), B(), P('end')]])
    expect(al.merged.filter((e) => e.text === 'note')).toHaveLength(1)
  })
  it('a picture or page break lines up by the text after it, not with any other picture', () => {
    const pb = (next) => ({ kind: 'p', text: '[page break]', match: '[page break] ' + next, blank: false })
    const a = [P('a'), pb('Annex'), P('Annex'), P('z'), pb('Wage'), P('Wage')]
    const b = [P('a'), pb('Annex'), P('Annex'), P('z'), pb('Incentive'), P('Incentive'), pb('Wage'), P('Wage')]
    const m = alignVersions([a, b]).merged
    const breaks = m.filter((e) => e.text === '[page break]')
    expect(breaks.map((e) => Object.keys(e.refs).length)).toEqual([2, 1, 2])
  })
  it('a table with a row more is one entry; a table with other columns is another', () => {
    const al = alignVersions([[T('Item | Amount', 'Pay | 1', 'Total | 1')], [T('Item | Amount', 'Pay | 1', 'Bonus | 2', 'Total | 3')], [T('What | Sum', 'Pay | 1')]], { loose: false })
    expect(al.merged).toHaveLength(2)
  })
})

describe('words inside a paragraph', () => {
  it('cuts only between words, never inside a «field» or a {{ tag }}', () => {
    const a = 'Your target is INR «New_Target»/-.'; const b = 'Your target is INR «New_Target»/- (against «Old»).'
    const { pre, suf } = commonEnds([a, b])
    expect(a.slice(0, pre)).toBe('Your target is INR «New_Target»/-')
    expect(b.slice(pre, b.length - suf)).toMatch(/^ \(against «Old»\)/)
    const c = commonEnds(['revise your compensation now', 'revise your retainer fee now'])
    expect('revise your compensation now'.slice(0, c.pre)).toBe('revise your ')
    const d = commonEnds(['Update {{ x }} here', 'Update {{ y }} here'])
    expect(d.pre).toBe('Update '.length)
  })
  it('writes the words of each version side by side with if / else', () => {
    const lists = [[P('Subject: Annual Performance Review and Compensation Update for the year 2026')], [P('Subject: Annual Performance Review and Compensation Update for the year 2026')], [P('Subject: Annual Performance Review and Retainer Fee update for the year 2026')]]
    const plan = planVersions(lists)
    const e = plan.merged[0]
    expect(e.inline.groups.map((g) => g.mid)).toEqual(['Compensation Update', 'Retainer Fee update'])
    expect(e.inline.branches.map((b) => b.kind)).toEqual(['if', 'else'])
    expect(needCondition(plan.needs[e.inline.branches[0].need], fields(plan, ['a', 'b', 'consultant']))).toBe('custom_schema.consultant | string | lower | trim == "no"')
  })
})

describe('yes / no fields', () => {
  it('two independent choices give two fields, not one per version', () => {
    const v = (promo, bonus) => [P('Dear Nisha,'), ...(promo ? [P('We promote you to Team Lead.')] : []), P('Your review is done.'), ...(bonus ? [P('A bonus is paid in April.')] : []), P('Regards')]
    const lists = [v(false, false), v(true, false), v(false, true), v(true, true)]
    const plan = planVersions(lists)
    const f = fields(plan, ['base', 'promotion', 'bonus', 'promotion-bonus'])
    expect(Object.values(f).sort()).toEqual(['custom_schema.bonus', 'custom_schema.promotion'])
    lists.forEach((l, i) => expect(seen(plan, i, lists)).toEqual(textOf(l)))
  })
  it('a big part only some versions have wraps the smaller differences inside it, as people write it', () => {
    const body = (o) => [P('Dear Ana,'), P('Thanks.'), P('Regards'), ...(o.consultant ? [] : [P('Annexure I'), P('Pay table'), ...(o.note ? [P('Note: merged.')] : []), ...(o.pli ? [P('Incentive letter'), P('Target')] : []), P('Wage rules')])]
    const opts = [{}, { note: true }, { pli: true }, { pli: true, note: true }, { consultant: true }]
    const lists = opts.map(body)
    const plan = planVersions(lists)
    const marks = plan.script.filter((s) => s.op === 'mark')
    expect(marks.map((m) => m.kind)).toEqual(['if', 'if', 'endif', 'if', 'endif', 'endif'])   // consultant no { note } { incentive }
    const f = fields(plan, ['standard', 'merged-note', 'incentive', 'incentive-merged-note', 'consultant'])
    expect(needCondition(plan.needs[marks[0].need], f)).toBe('custom_schema.consultant | string | lower | trim == "no"')
    lists.forEach((l, i) => expect(seen(plan, i, lists)).toEqual(textOf(l)))
  })
  it('alternatives that cover every version are one if / elif / else; "no" is used only between all versions', () => {
    const lists = [[P('a'), P('We kept your pay.'), P('z')], [P('a'), P('Your pay goes up by six percent.'), P('z')], [P('a'), P('You get a one-time award.'), P('z')]]
    const plan = planVersions(lists)
    expect(plan.script.filter((s) => s.op === 'mark').map((m) => m.kind)).toEqual(['if', 'elif', 'else', 'endif'])
    for (const n of plan.needs) if (n.ctx.length < 3) expect(n.terms.every((t) => t.yes)).toBe(true)
    lists.forEach((l, i) => expect(seen(plan, i, lists)).toEqual(textOf(l)))
  })
  it('two shared paragraphs in another order in one version still give every version its own order', () => {
    const lists = [[P('a'), P('benefits'), P('leave'), P('z')], [P('a'), P('leave'), P('benefits'), P('z')], [P('a'), P('benefits'), P('leave'), P('z')]]
    const plan = planVersions(lists)
    lists.forEach((l, i) => expect(seen(plan, i, lists)).toEqual(textOf(l)))
  })
  it('table rows only some versions have get a row condition; a table with other columns is a whole alternative', () => {
    const lists = [[P('a'), T('Item | Amount', 'Pay | x', 'Total | y')], [P('a'), T('Item | Amount', 'Pay | x', 'Insurance | i', 'Total | y')], [P('a'), T('What | Sum', 'Award | w')]]
    const plan = planVersions(lists, { loose: false })
    const e = plan.merged.find((x) => x.kind === 'tbl' && (x.rowPlan || x.alts))
    expect(plan.items.map((i) => i.kind).sort()).toEqual(['blocks', 'rows'])
    expect(e.rowPlan.conds.map((c) => e.rowPlan.rows[c.ri].text)).toEqual(['Insurance | i'])
    const lists2 = [[P('a'), T('Item | Amount', 'Pay | x')], [P('a'), T('What | Sum', 'Award | w')]]
    const plan2 = planVersions(lists2, { loose: false })
    expect(plan2.items.map((i) => i.kind)).toEqual(['blocks'])
  })
  it('names a field from the words only those versions have in their file names, else from the text', () => {
    expect(suggestName([1, 3], ['XY_Bonus_New', 'XYPromotionBonus_New', 'Base', 'x9f3_Promotion-Bonus'], '')).toBe('promotion')
    expect(suggestName([0], ['ab12cd34-11_Letter_consultant', 'ef56-1_Letter_staff'], '')).toBe('consultant')
    expect(suggestName([0, 1], ['A', 'B', 'C'], '[page break]\n3 May\nSubject: Incentive Plan for 2026')).toBe('incentive_plan')
    expect(slugOf('No increase (2024)')).toBe('no_increase_2024')
  })
  it('a suggested name never reuses a value the letters already have; the person can rename', () => {
    const plan = { flags: [{ set: [0], key: '0', text: '' }, { set: [1], key: '1', text: '' }] }
    expect(flagFields(plan, ['ESI', 'other'], {}, new Set(['esi']))['0']).toBe('custom_schema.has_esi')
    expect(flagFields(plan, ['ESI', 'other'], { 0: 'Gets ESI', 1: 'employee_schema.band' })).toEqual({ 0: 'custom_schema.gets_esi', 1: 'employee_schema.band' })
  })
})

describe('the tag lines', () => {
  it('join the paragraph before ({%- …); after a table, the paragraph after (… -%})', () => {
    expect(markerText('if', 'x == "yes"')).toBe('{%- if x == "yes" %}')
    expect(markerText('endif', '', false, true)).toBe('{% endif -%}')
    expect(markerText('else', '', true)).toBe('{%- else %}')
    expect(cbParse('custom_schema.a | string | lower | trim == "yes"')).toBeTruthy()
  })
  it('only join a paragraph that has nothing after its text (a picture, a page break) or before it', () => {
    const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
    const p = (inner) => parseXml(`<w:p xmlns:w="${W}">${inner}</w:p>`).documentElement
    expect(joinable(p('<w:r><w:t>Hi</w:t></w:r>'))).toBe(true)
    expect(joinable(p('<w:r><w:t>Hi</w:t></w:r><w:r><w:drawing/></w:r>'))).toBe(false)
    expect(joinable(p('<w:r><w:br w:type="page"/></w:r>'))).toBe(false)
    expect(joinable(p(''))).toBe(false)
    expect(startJoinable(p('<w:r><w:drawing/></w:r><w:r><w:t>Hi</w:t></w:r>'))).toBe(false)
    expect(startJoinable(p('<w:pPr><w:sectPr/></w:pPr><w:r><w:t>Hi</w:t></w:r>'))).toBe(false)
    expect(startJoinable(p('<w:r><w:t>Hi</w:t></w:r><w:r><w:drawing/></w:r>'))).toBe(true)
  })
})

// ---- the made-up fixture sets through the engine (python tests_ui/react/combine.py renders them with docxtpl) ----
// eslint-disable-next-line no-undef
const FIX = resolve(process.cwd(), '../tests_ui/fixtures')
const fileAt = (dir, name) => {
  const b = readFileSync(resolve(dir, name))
  return { name, arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) }
}
const setFiles = (set) => { const dir = resolve(FIX, 'combine_sets', set); return readdirSync(dir).filter((n) => n.endsWith('.docx')).sort().map((n) => fileAt(dir, n)) }
const NAMES = ['promotion.docx', 'variable-pay.docx', 'no-increase.docx', 'bonus-only.docx']
const toasts = []
on('toast', (m) => toasts.push(m))

describe('combining the four fixture versions', () => {
  beforeEach(async () => {
    toasts.length = 0; combineCancel(); localStorage.clear()
    await loadVersions(NAMES.map((n) => fileAt(resolve(FIX, 'versions'), n)))
  })

  it('reads the files, reports each bad one in plain words, and summarises', async () => {
    const view = combineView()
    expect(view.ready).toBe(true)
    expect(view.differ).toBe(3)   // paragraph + extra, table row, sign line
    const r = await loadVersions([{ name: 'notes.txt', arrayBuffer: async () => new ArrayBuffer(3) }, { name: 'broken.docx', arrayBuffer: async () => new TextEncoder().encode('nope').buffer }])
    expect(r.errors).toEqual(['notes.txt is not a .docx file.', 'broken.docx is not a .docx file.'])
    expect(state.combine.versions).toHaveLength(4)
  })

  it('shares one paragraph between two versions and gives the empty version no branch', () => {
    const v = combineView()
    const para = v.regions.find((r) => r.groups.some((g) => g.versions.length === 2 && /variable pay/.test(g.texts[0] || '')))
    expect(para.groups.map((g) => g.versions).sort()).toEqual([['no-increase'], ['promotion'], ['variable-pay', 'bonus-only']])
    const shared = para.groups.find((g) => g.versions.length === 2)
    expect(shared.english).toMatch(/variable pay/)
    expect(shared.english).toMatch(/bonus only/)
    expect(para.groups.at(-1).english).toBe('none of the above')
    const sign = v.regions.find((r) => r.groups.some((g) => /sign and return/.test(g.texts[0] || '')))
    expect(sign.groups.find((g) => g.empty).versions).toEqual(['no-increase'])
    const rows = v.regions.find((r) => r.kind === 'rows')
    expect(rows.groups).toHaveLength(4)
  })

  it('combines in one undo step with if / elif / endif lines that cbParse can read', async () => {
    const rep = await applyCombine()
    expect(rep.regions).toBe(3)
    expect(state.combine).toBeNull()
    expect(state.tab).toBe('logic')
    expect(state.logic.every((l) => l.mg)).toBe(true)
    build()
    const xml = state.built.xml['word/document.xml']
    const tags = [...xml.matchAll(/\{%-?\s*(if|elif|else|endif)[^%]*-?%\}/g)].map((m) => m[1])
    expect(tags.filter((t) => t === 'if').length).toBe(tags.filter((t) => t === 'endif').length)
    expect(xml).toContain('Your variable pay for the year')
    expect(xml).toContain('After this year')
    for (const l of state.logic.filter((x) => /^\{%-? *(if|elif)/.test(x.text))) expect(cbParse(l.text)).toBeTruthy()
    expect(toasts.join(' ')).toMatch(/Combined 4 versions. Each difference is an if \/ else on a yes \/ no field/)
    expect(state.combineFlags).toContain('custom_schema.promotion')
    undo()
    build()
    expect(state.built.xml['word/document.xml']).not.toContain('After this year')
    expect(state.logic).toHaveLength(0)
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
    expect(await applyCombine()).toBeTruthy()
  })

  it('a field the person renames is used in the letter and stays when versions move', async () => {
    const f = combineView().flags.find((x) => x.name === 'promotion')
    combineSetName(f.key, 'Promoted This Year')
    combineMove(state.combine.versions[0].id, 1)
    expect(combineView().flags.map((x) => x.field)).toContain('custom_schema.promoted_this_year')
    await applyCombine()
    expect(state.logic.some((l) => l.text.includes('custom_schema.promoted_this_year'))).toBe(true)
  })

  it('the "ignore small differences" switch changes what counts as a difference', () => {
    expect(state.combine.loose).toBe(true)
    combineSetLoose(false)
    expect(state.combine.loose).toBe(false)
    expect(combineView().ready).toBe(true)
  })

  it('one version only: not ready, and Combine refuses in plain words', async () => {
    combineCancel()
    await loadVersions([fileAt(resolve(FIX, 'versions'), NAMES[0])])
    expect(combineView().ready).toBe(false)
    expect(await applyCombine()).toBe(false)
    expect(toasts.at(-1)).toMatch(/at least two versions/)
  })
})

describe('the made-up version sets', () => {
  beforeEach(() => { combineCancel(); localStorage.clear() })
  const fieldsOfSet = async (set) => { await loadVersions(setFiles(set)); return combineView().flags.map((f) => f.name).sort() }

  it('grid: promotion x bonus is two fields', async () => {
    expect(await fieldsOfSet('grid')).toEqual(['has_bonus', 'promotion'])
  })
  it('cables: the same fields a person writes by hand, nested under the consultant switch, pictures and lists copied', async () => {
    expect(await fieldsOfSet('cables')).toEqual(['change', 'consultant', 'incentive', 'insurance', 'pay_merged', 'promotion'])
    const kinds = combineView().regions.map((r) => r.kind)
    expect(kinds.filter((k) => k === 'inline')).toHaveLength(3)   // subject words, retainer fee words, the "as against" words
    expect(kinds.filter((k) => k === 'rows')).toHaveLength(1)     // the insurance row
    const rep = await applyCombine()
    expect(rep.images).toBe(0)   // the incentive section's signature picture is copied, not dropped
    expect(rep.lists).toBe(0)    // and its numbered list keeps a list of its own
    build()
    const xml = state.built.xml['word/document.xml']
    expect(xml).toMatch(/rIdCombine\d+x/)
    expect((xml.match(/Last year/g) || []).length).toBe(1)   // the table is not copied once per version
    expect(xml).toContain('{%- if custom_schema.consultant | string | lower | trim == "no" %}')
  })
  it('shapes: alternatives, another order, other columns, an extra and a missing section', async () => {
    expect(await fieldsOfSet('shapes')).toHaveLength(6)
    const kinds = combineView().regions.map((r) => r.kind)
    expect(kinds).toContain('inline')
    expect(await applyCombine()).toBeTruthy()
  })
  it('two: a few words and one paragraph, one field', async () => {
    expect(await fieldsOfSet('two')).toEqual(['promotion'])
  })
})
