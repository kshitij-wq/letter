import { describe, expect, it } from 'vitest'
import { tagSyntaxProblem } from '../../engine'
import { PLAIN_CATS, plainEngine, plainLine, plainMessage } from './plain'

const JARGON = /jinja|syntax|filter|undefined|expression|delimiter|\bblock\b/i

describe('plain wording for Validate', () => {
  it('rewrites every sentence the page\'s own syntax check can give, in everyday words', () => {
    const tags = ['{{ a', '{{ (a }}', '{{ a) }}', '{% %}', '{% iff a == 1 %}', '{% if a = 1 %}', '{% if %}', '{{ name | flaot }}', '{{ "x }}']
    for (const t of tags) {
      const why = tagSyntaxProblem(t)
      if (!why) continue
      const m = plainMessage(why)
      expect(m.original, t).toBe(why)
      expect(m.html, t).not.toMatch(JARGON)
    }
  })
  it('rewrites what the full check (renderer/engine.py _friendly) says', () => {
    const real = [
      '“rating” isn\'t in the data for this employee, and the tag uses it in a way that needs a value (for example with | float). Add the column, or write rating | default(0).',
      '“basic” is missing for this employee (for example custom_schema.basic), and the tag needs a value there. Add the column, or use | default(…).',
      'There is a {% endif %} without the {% if %} (or {% for %}) it belongs to above it.',
      'An {% if %} is never closed. Add {% endif %} where it should stop.',
      'A tag has a typing mistake near “}}”: a missing quote, bracket or | , or two words without and / or between them.',
    ]
    for (const r of real) { const m = plainMessage(r); expect(m.html).not.toMatch(JARGON); expect(m.original).toBe(r) }
    expect(plainMessage(real[0]).html).toMatch(/has no value for this employee/)
  })
  it('rewrites the page\'s own findings and keeps the tag in a code chip', () => {
    const m = plainMessage('<code>{% endif %}</code> has no matching <code>{% if %}</code> above it.')
    expect(m.html).toBe('<code>{% endif %}</code> has no “if” before it. Add the missing “if” above it, or delete this line.')
    expect(plainMessage('A quote isn&#39;t closed in this tag. Every &quot; or &#39; needs its pair. <code>{{ a }}</code>').html).toMatch(/^A quotation mark in this tag has no partner/)
    expect(plainMessage('Nothing to change here.')).toEqual({ html: 'Nothing to change here.', original: '' })
  })
  it('toasts and the engine line carry no jargon either', () => {
    expect(plainLine('Real Jinja (the engine CompUp uses) filled the letter for all 4.')).toMatch(/^The full check/)
    const e = plainEngine({ kind: 'passed', title: 'Real Jinja check passed: docxtpl 0.20.2, the engine CompUp uses. 6 fields used.', detail: 'x' })
    expect(e.title).toBe("The full check passed: CompUp's engine can fill this letter. 6 fields used.")
    expect(plainEngine({ kind: 'failed', title: 'Real Jinja check failed: 2 typing mistakes, listed first below.', detail: '' }).title).toMatch(/found 2 mistakes/)
    for (const c of Object.values(PLAIN_CATS)) expect(`${c.name} ${c.why} ${c.fix}`).not.toMatch(JARGON)
  })
})
