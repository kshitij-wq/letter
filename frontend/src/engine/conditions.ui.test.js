import { beforeEach, describe, expect, it } from 'vitest'
import {
  addLogic, blockCountInfo, cbAddRule, cbExpr, cbFacts, cbNew, cbParse, cbPickValue, cbRemoveRule, cbRestart, cbSetField, cbToBuilder, cbToJinja,
  clickParagraph, closeBlockAt, computeLogic, insertIntoText, lgInsertAtCursor, lgTextForKw, lgTextWithExpr, loadDocx, logicProblems, logicRows,
  logicSay, logicTpl, logicWhere, paraSelection, pickingInfo, sampleDocx, startClosing, startPlacing, state, cancelPicking, afterLogicChange, recordUndo,
} from './index.js'

beforeEach(async () => {
  localStorage.clear()
  await loadDocx(await sampleDocx(), 'sample-appraisal-letter.docx', true)
})

const bodyParas = () => state.an.paras.filter((p) => p.kind === 'body' && !p.fallback && p.model.text.trim().length > 20)

describe('builder edits', () => {
  it('adds and removes rules and keeps the condition readable', () => {
    const cb = cbNew('')
    cbSetField(cb, 0, ' employee_schema.rating ')
    cb.rules[0].value = 'A'
    const k = cbAddRule(cb)
    expect(k).toBe(1)
    cbSetField(cb, 1, 'employee_schema.band')
    cb.rules[1].value = 'x'
    cb.join = 'or'
    const expr = cbExpr(cb)
    expect(cbParse(expr).rules).toHaveLength(2)
    cbRemoveRule(cb, 1)
    expect(cb.rules).toHaveLength(1)
    expect(cbFacts(cb)).toMatchObject({ raw: false, handOk: true, why: '' })
    expect(cbFacts(cb).en).toMatch(/is “A”$/)
  })

  it('clicking value chips: one value, then a list, then off again', () => {
    const cb = cbNew('')
    cbSetField(cb, 0, 'employee_schema.rating')
    cbPickValue(cb, 0, 'A')
    expect(cb.rules[0]).toMatchObject({ op: 'is', value: 'A' })
    cbPickValue(cb, 0, 'B')                       // a second value turns "is" into "is one of"
    expect(cb.rules[0]).toMatchObject({ op: 'in', value: 'A, B' })
    cbPickValue(cb, 0, 'A')
    expect(cb.rules[0].value).toBe('B')
    cbPickValue(cb, 0, '')                        // the empty value means "is empty"
    expect(cb.rules[0]).toMatchObject({ op: 'empty', value: '' })
  })

  it('Builder -> Jinja -> Builder keeps the rules; hand-written text stays in Jinja', () => {
    const cb = cbNew('')
    cbSetField(cb, 0, 'employee_schema.rating'); cb.rules[0].value = 'A'
    cbToJinja(cb)
    expect(cb.raw).toBe(cbExpr({ ...cb, raw: null }))
    const back = cbToBuilder(cb)
    expect(back.raw).toBeNull()
    expect(back.rules[0].value).toBe('A')
    expect(cbToBuilder({ rules: [], join: 'and', raw: 'foo.bar | length > 3 and (x or y)' })).toBeNull()
    expect(cbToBuilder({ rules: [{ field: '', op: 'is', value: '' }], join: 'and', raw: '' }).rules).toHaveLength(1)
    expect(cbFacts({ rules: [], join: 'and', raw: 'foo.bar | length > 3 and (x or y)' }).handOk).toBe(false)
  })

  it('says what is wrong with a condition typed in Jinja', () => {
    const f = cbFacts({ rules: [], join: 'and', raw: 'rating = "a"' })
    expect(f.why).toMatch(/==/)
  })
})

describe('logic tag text helpers', () => {
  it('picking a kind keeps a typed condition between if and else if only', () => {
    expect(lgTextForKw('{% if x == "a" -%}', 'elif')).toBe('{%- elif x == "a" -%}')
    expect(lgTextForKw('{% if x == "a" -%}', 'else')).toBe('{%- else -%}')
    expect(lgTextForKw('', 'if')).toBe('{% if CONDITION -%}')
  })
  it('a preset condition goes into an if (or stays an else if)', () => {
    expect(lgTextWithExpr('{%- elif CONDITION -%}', 'a == 1')).toEqual({ kw: 'elif', text: '{%- elif a == 1 -%}' })
    expect(lgTextWithExpr('{% else %}', 'a == 1').kw).toBe('if')
  })
  it('a field replaces CONDITION, or goes before the closing %}', () => {
    expect(lgInsertAtCursor('{% if CONDITION -%}', 'rating', 0, 0)).toBe('{% if rating -%}')
    expect(lgInsertAtCursor('{% if x == 1 -%}', 'y', 16, 16)).toBe('{% if x == 1 y -%}')
  })
  it('a field in the Insert a tag box: empty box gets braces, empty braces are filled, else at the cursor', () => {
    expect(insertIntoText('', 'first_name', 0, 0)).toBe('{{ first_name }}')
    expect(insertIntoText('{{ }}', 'first_name', 5, 5)).toBe('{{ first_name }}')
    expect(insertIntoText('Dear {{ x }}', 'y', 4, 4)).toBe('Dear y {{ x }}')
  })
})

describe('what the Conditions step and the selection panel read', () => {
  it('an if that is never closed is a problem, closing it clears the problem', () => {
    const p = bodyParas()[0]
    recordUndo(); addLogic(p.pid, 'before', logicTpl('if', 'x == 1')); afterLogicChange()
    let pr = logicProblems()
    expect(pr.open).toHaveLength(1)
    expect(pr.label).toBe('1 to fix')
    const e = logicRows()[0]
    expect(logicWhere(e)).toMatch(/^(on p\.\d+ |in the \w+ )$/)
    expect(logicSay(e).en).toBeDefined()
    startClosing(e.key)
    expect(pickingInfo()).toMatchObject({ kind: 'close', word: 'if' })
    closeBlockAt(bodyParas()[1].pid)
    pr = logicProblems()
    expect(pr.probs).toBe(0)
    expect(pr.label).toBe('1 condition · all closed')
    expect(pickingInfo()).toBeNull()
  })

  it('picking up a tag that lost its place says where it goes', () => {
    state.unplaced = [{ text: '{% endif %}', place: 'after', reason: 'x' }]
    startPlacing(0)
    expect(pickingInfo()).toMatchObject({ kind: 'place', note: ' (line after)' })
    cancelPicking()
    expect(pickingInfo()).toBeNull()
  })

  it('knows the paragraphs selected and the block they sit in', () => {
    const [a, b] = bodyParas()
    clickParagraph(a.pid, false)
    let s = paraSelection()
    expect(s.ps).toHaveLength(1)
    expect(s.kw0).toBe('if')
    expect(s.onPage).toMatch(/^(on page \d+|in the letter)$/)
    clickParagraph(b.pid, true)
    s = paraSelection()
    expect(s.ps.length).toBeGreaterThan(1)
    expect(s.first.order).toBeLessThan(s.last.order)
  })

  it('an open if above the selection offers to close it', () => {
    const [a, b] = bodyParas()
    addLogic(a.pid, 'before', logicTpl('if', 'x == 1')); computeLogic()
    clickParagraph(b.pid, false)
    const s = paraSelection()
    expect(s.openTop).toBeTruthy()
    expect(s.kw0).toBe('endif')
    expect(s.place0).toBe('after')
  })

  it('has no employee counts without a data file', () => {
    computeLogic()
    expect(logicRows().every((e) => blockCountInfo(e) === null)).toBe(true)
  })
})
