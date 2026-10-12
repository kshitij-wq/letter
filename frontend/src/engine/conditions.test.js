import { describe, expect, it } from 'vitest'
import { CB_OPS, CB_NUM, cbEnglish, cbExpr, cbNew, cbParse, cbRuleExpr, condEnglish } from './index.js'

// A condition the builder writes must be readable by cbParse (so it can be edited and described again),
// whatever the test and whatever is typed as the value.
const FIELD = 'employee_schema.rating'
const TEXT_VALUES = ['A', 'A, A+', 'Yes', "O'Brien", 'R&D', 'say "hi"', 'back\\slash', 'x and y', 'x or y', '<b>', 'Ünïcode ₹', 'a (b) [c]', '  padded  ', 'in', 'not']
const NUM_VALUES = ['3', '0', '-5', '0.5', '1,200', '12,00,000', '₹ 4500']
const NO_VALUE = new Set(['empty', 'filled'])
const rule = (op, value) => ({ field: FIELD, op, value })
const cb = (...rules) => ({ rules, join: 'and', raw: null })

describe('condition builder: write, read back, write again', () => {
  for (const [op, label] of CB_OPS) {
    const values = NO_VALUE.has(op) ? [''] : CB_NUM[op] ? NUM_VALUES : TEXT_VALUES
    for (const value of values) {
      it(`${label} ${JSON.stringify(value)}`, () => {
        const expr = cbExpr(cb(rule(op, value)))
        expect(expr, 'the builder wrote something').not.toBe('')
        const parsed = cbParse(expr)
        expect(parsed, `cbParse could not read: ${expr}`).not.toBeNull()
        expect(parsed.rules).toHaveLength(1)
        expect(parsed.rules[0].field).toBe(FIELD)
        // writing what was read gives the same condition (text is compared lower-case, so values come back lower-cased)
        expect(cbExpr(parsed)).toBe(expr)
        expect(cbEnglish(parsed)).not.toBe('')
        expect(condEnglish(expr)).toBe(cbEnglish(parsed))
      })
    }
  }

  it('keeps the value text (lower-cased) for "is" and "is one of"', () => {
    expect(cbParse(cbExpr(cb(rule('is', 'R&D')))).rules[0]).toEqual({ field: FIELD, op: 'is', value: 'r&d' })
    expect(cbParse(cbExpr(cb(rule('in', 'A, A+')))).rules[0]).toEqual({ field: FIELD, op: 'in', value: 'a, a+' })
    expect(cbParse(cbExpr(cb(rule('has', 'x or y')))).rules[0]).toMatchObject({ op: 'has', value: 'x or y' })
  })

  it('keeps numbers as numbers, commas removed', () => {
    expect(cbParse(cbExpr(cb(rule('gt', '12,00,000')))).rules[0]).toEqual({ field: FIELD, op: 'gt', value: '1200000' })
    expect(cbParse(cbExpr(cb(rule('le', '-5')))).rules[0]).toEqual({ field: FIELD, op: 'le', value: '-5' })
  })

  it('joins rules with and / or and reads them back', () => {
    for (const join of ['and', 'or']) {
      const c = { rules: [rule('is', 'A'), { field: 'ctc', op: 'gt', value: '100000' }, { field: 'dept', op: 'notin', value: 'HR, Legal' }], join, raw: null }
      const expr = cbExpr(c)
      const parsed = cbParse(expr)
      expect(parsed.join).toBe(join)
      expect(parsed.rules).toHaveLength(3)
      expect(cbExpr(parsed)).toBe(expr)
    }
  })

  it('writes the CompUp way: text lower-case and trimmed, numbers through | float with a default', () => {
    expect(cbRuleExpr(rule('is', 'Yes'))).toBe(`${FIELD} | string | lower | trim == "yes"`)
    expect(cbRuleExpr({ field: 'ctc', op: 'gt', value: '5' })).toBe('(ctc | default(0) | string | replace(",", "") | float) > 5')
    expect(cbRuleExpr(rule('empty', ''))).toBe(`(${FIELD} | default('', true) | string | trim) == ""`)
  })

  it('writes nothing for an unfinished rule, and "&", "<", ">" inside quotes as \\u escapes', () => {
    expect(cbRuleExpr(rule('is', ''))).toBe('')
    expect(cbRuleExpr({ field: 'not a field', op: 'is', value: 'x' })).toBe('')
    expect(cbRuleExpr(rule('is', 'R&D <x>'))).toContain('\\u0026')
  })

  it('a hand-written condition the builder cannot read stays as written (raw)', () => {
    const c = cbNew('employee_schema.rating | lower in ["a", "b"] and ctc | float > 3 or dept == "x"')
    expect(c.raw).not.toBeNull()
    expect(cbExpr(c)).toContain('employee_schema.rating')
  })
})
