import { describe, expect, it } from 'vitest'
import { tagSyntaxProblem, tagProblem, straighten, squash } from './index.js'

// The page's own syntax checks are worded like the real Jinja check on the server (renderer/engine.py _friendly).
describe('tagSyntaxProblem', () => {
  const good = ['{{ first_name }}', '{{ ctc | indian_comma }}', '{% if a == "b" -%}', '{%- else -%}', '{%- endif %}', '{% for x in items %}', "{{ currentDatetime('%B %d, %Y') }}",
    `{{ mobile | default("Not 'provided'", true) }}`, '{# a comment #}', '{% set x = 3 %}']
  for (const t of good) it(`accepts ${t}`, () => expect(tagSyntaxProblem(t)).toBe(''))

  const bad = [
    ['{{ name | flaot }}', /isn't a filter Jinja knows/],
    ['{% if a = 1 %}', /Use == to compare/],
    ['{% iff a == 1 %}', /isn't a Jinja tag/],
    ['{{ a( }}', /bracket \( or \[ is opened but not closed/],
    ['{{ a) }}', /\) or \] without its opening bracket/],
    ['{{ "abc }}', /quote isn't closed/],
    ["{{ 'abc }}", /quote isn't closed/],
    ['{% if %}', /needs a condition/],
    ['{% %}', /empty or starts with something/],
    ['{% elif %}', /needs a condition/],
  ]
  for (const [tag, why] of bad) it(`explains ${tag}`, () => expect(tagSyntaxProblem(tag)).toMatch(why))

  it('is not fooled by an apostrophe or a bracket inside quotes', () => {
    expect(tagSyntaxProblem(`{{ x | default("it's (a) [test]") }}`)).toBe('')
  })
})

describe('tagProblem (text typed into a tag box)', () => {
  it('reports an unclosed tag, then looks at every tag in the text', () => {
    expect(tagProblem('{{ first_name')).toMatch(/isn't closed/)
    expect(tagProblem('{{ first_name }} {% if x = 1 %}')).toMatch(/Use ==/)
    expect(tagProblem('{{ first_name }} {{ last_name }}')).toBe('')
    expect(tagProblem('')).toBe('')
  })
})

describe('small text helpers', () => {
  it('straightens curly quotes and dashes inside tags only', () => {
    expect(straighten('{{ a | default(‘x’) }}')).toBe("{{ a | default('x') }}")
    expect(straighten('{%– if a –%}')).toBe('{%- if a -%}')
  })
  it('squash makes two spellings of one tag equal', () => {
    expect(squash('{%- if  a == "b" -%}')).toBe(squash('{% if a=="b" %}'.replace('a=="b"', 'a == "b"')))
  })
})
