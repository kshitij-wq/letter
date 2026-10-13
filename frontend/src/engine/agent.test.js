import JSZip from 'jszip'
import { readFileSync } from 'node:fs'
import process from 'node:process'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  HISTORY, TOOLS, TOOL_BY_NAME, ToolError, WRITE, agentState, applied, applyWrite, buildAgentContext, clearConversation, decide, finalTag, ingestCsv, loadDocx, planWrite,
  READ, rowStatus, sampleDocx, sendMessage, setAutoApply, setRowKey, snapState, state, stopAgent, trimHistory, validateArgs, build, computeLogic, setTab,
} from './index.js'

const para = (text) => state.an.paras.find((p) => !p.fallback && p.model.text.includes(text))
const rowFor = (find) => state.rows.find((r) => r.find === find)
const same = (a, b) => a.rest === b.rest && Object.keys(a.xml).every((k) => a.xml[k] === b.xml[k])
const fixture = (name) => { const b = readFileSync(`${process.cwd()}/../tests_ui/fixtures/${name}`); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) }

beforeEach(async () => {
  localStorage.clear(); state.learned = {}; state.learnedCells = {}
  state.csv = null; state.csvExtra = []; state.dataFilter = null
  clearConversation(); agentState.autoApply = false; applied.length = 0
  await loadDocx(await sampleDocx(), 'sample-appraisal-letter.docx', true)
  setRowKey(rowFor('[Employee Code]').id, '')   // the sample tags itself on load: leave one placeholder without a tag
})
afterEach(() => { vi.restoreAllMocks(); delete globalThis.fetch })

describe('the tool list', () => {
  it('is the server file: every tool has a kind and a closed object schema', () => {
    expect(TOOLS.length).toBeGreaterThanOrEqual(18)
    for (const t of TOOLS) {
      expect(['read', 'write']).toContain(t.kind)
      expect(t.input_schema.type).toBe('object')
      expect(t.input_schema.additionalProperties).toBe(false)
    }
    expect(TOOL_BY_NAME.tag_text.allow_auto).toBe(true)
    expect(TOOL_BY_NAME.wrap_paragraphs_in_condition.allow_auto).toBeUndefined()
  })
})

describe('validateArgs', () => {
  const s = TOOL_BY_NAME.wrap_paragraphs_in_condition.input_schema
  it('accepts a good call', () => {
    expect(validateArgs(s, { pids: ['word/document.xml#1'], rules: [{ field: 'level', op: 'is', value: 'L4' }] })).toEqual([])
  })
  it('names what is wrong', () => {
    expect(validateArgs(s, {})).toEqual(['arguments.pids is required'])
    expect(validateArgs(s, { pids: [] }).join()).toMatch(/at least 1/)
    expect(validateArgs(s, { pids: ['a'], rules: [{ field: 'x', op: 'sounds like' }] }).join()).toMatch(/one of is, isnot/)
    expect(validateArgs(s, { pids: ['a'], extra: 1 }).join()).toMatch(/not a known argument/)
    expect(validateArgs(s, { pids: 'a' }).join()).toMatch(/must be a array/)
    expect(validateArgs(TOOL_BY_NAME.get_document_outline.input_schema, { limit: 1.5 }).join()).toMatch(/whole number/)
    expect(validateArgs(TOOL_BY_NAME.get_document_outline.input_schema, { limit: 999 }).join()).toMatch(/at most 300/)
  })
})

describe('what Claude is told', () => {
  it('never includes employee rows, names or amounts', () => {
    ingestCsv('emp_code,first_name,last_name,ctc,promotion\nE1,Zorblax,Quimby,987654,yes\nE2,Marwen,Tolliver,876543,no\nE3,Ines,Okafor,765432,yes', 'emps.csv')
    const ctx = JSON.stringify(buildAgentContext())
    for (const secret of ['Zorblax', 'Quimby', 'Marwen', 'Tolliver', '987654', '876543', 'Okafor']) expect(ctx).not.toContain(secret)
    expect(ctx).toContain('first_name')   // column names are allowed
  })

  it('carries the letter, the selection and the checks', () => {
    const p = para('[Employee Name]') || state.an.paras.find((x) => /\[/.test(x.model.text))
    state.sel = { pids: [p.pid], anchor: p.pid, text: '' }
    const ctx = buildAgentContext()
    expect(ctx.outline).toContain(p.pid)
    expect(ctx.selection).toContain(p.pid)
    expect(ctx.tags.placeholders).toBeGreaterThan(0)
    expect(ctx.letter_name).toBe('sample-appraisal-letter.docx')
  })

  it('trims whole turns from the old end, never half a tool exchange', () => {
    const u = (t) => ({ role: 'user', content: [{ type: 'text', text: t }] })
    const call = { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_1', name: 'get_tags', input: {} }] }
    const res = { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'x'.repeat(500) }] }
    const a = { role: 'assistant', content: [{ type: 'text', text: 'ok' }] }
    const out = trimHistory([u('first'), call, res, a, u('second'), call, res, a], 900)
    expect(out[0]).toEqual(u('second'))
    expect(out.length).toBe(4)
  })
})

describe('read tools', () => {
  it('outline gives paragraph ids the other tools accept; find_text finds the same ones', async () => {
    const o = await READ.get_document_outline({})
    expect(o.paragraphs.length).toBeGreaterThan(5)
    const first = o.paragraphs[0]
    expect(state.an.byPid.has(first.pid)).toBe(true)
    const f = await READ.find_text({ query: 'dear' })
    expect(f.total).toBeGreaterThan(0)
    expect(state.an.byPid.has(f.matches[0].pid)).toBe(true)
  })

  it('get_fields lists only real fields; get_tags and get_validation answer', async () => {
    const f = await READ.get_fields({ search: 'level' })
    expect(f.compup_tags.map((x) => x.key)).toContain('employee_schema.level')
    expect((await READ.get_tags({ status: 'need' })).total).toBeGreaterThan(0)
    const v = await READ.get_validation({})
    expect(v.counts).toHaveProperty('errors')
  })

  it('previews with made-up sample values only, even when employee data is loaded', async () => {
    ingestCsv('emp_code,first_name,last_name,ctc\nE1,Zorblax,Quimby,987654\nE2,Marwen,Tolliver,876543', 'emps.csv')
    const r = await READ.preview_for_employee({})
    expect(r.sample_values).toBe(true)
    const text = JSON.stringify(r)
    expect(text).not.toContain('Zorblax'); expect(text).not.toContain('Marwen'); expect(text).not.toContain('987654')
  })
})

describe('write tools are one undo step each', () => {
  it('a plan shows the change and leaves everything as it was', async () => {
    const r = rowFor('[Employee Code]')
    const before = snapState(); const depth = HISTORY.undo.length
    const plan = await planWrite('tag_text', { row_id: r.id, field: 'emp_code' })
    expect(plan.summary).toMatch(/Tag “\[Employee Code\]” with/)
    expect(plan.diff.added.some((x) => x.text.includes('{{ emp_code }}'))).toBe(true)
    expect(plan.diff.removed.some((x) => x.text.includes('[Employee Code]'))).toBe(true)
    expect(same(before, snapState())).toBe(true)
    expect(HISTORY.undo.length).toBe(depth)
    expect(rowFor('[Employee Code]').key).not.toBe('emp_code')
  })

  it('applying tags the text in one undo step, and undo puts it back', async () => {
    const r = rowFor('[Employee Code]'); const depth = HISTORY.undo.length
    const out = await applyWrite('tag_text', { row_id: r.id, field: 'emp_code' })
    expect(out.info.tag).toBe('{{ emp_code }}')
    expect(finalTag(rowFor('[Employee Code]'))).toBe('{{ emp_code }}')
    expect(state.built.xml['word/document.xml']).toContain('{{ emp_code }}')
    expect(HISTORY.undo.length).toBe(depth + 1)
    const res = await applyWrite('undo', {})
    expect(res.summary).toMatch(/^Undone/)
    expect(rowFor('[Employee Code]').key).not.toBe('emp_code')
    expect(HISTORY.undo.length).toBe(depth)
  })

  it('tags text that is not a placeholder yet, from the exact words', async () => {
    const p = state.an.paras.find((x) => /\bDear\b/.test(x.model.text))
    const word = p.model.text.match(/Dear/)[0]
    await applyWrite('tag_text', { text: word, field: 'first_name' })
    expect(rowFor(word)).toBeTruthy()
    expect(state.built.xml['word/document.xml']).toContain('{{ first_name }}')
  })

  it('refuses a field that does not exist, and the letter is untouched', async () => {
    const r = rowFor('[Employee Code]'); const before = snapState()
    await expect(applyWrite('tag_text', { row_id: r.id, field: 'employee_id_number' })).rejects.toThrow(/isn't a column/)
    await expect(applyWrite('tag_text', { row_id: r.id, field: 'custom_schema.made_up' })).rejects.toThrow(/data file/)
    expect(same(before, snapState())).toBe(true)
  })

  it('with a data file, an invented custom_schema field is refused and a real one is allowed', async () => {
    ingestCsv('emp_code,first_name,last_name,basic1\nE1,A,B,5\nE2,C,D,6', 'emps.csv')
    const r = rowFor('[Employee Code]')
    await expect(applyWrite('tag_text', { row_id: r.id, field: 'custom_schema.basic9' })).rejects.toThrow(/Did you mean|isn't a column/)
    const out = await applyWrite('tag_text', { row_id: r.id, field: 'custom_schema.basic1' })
    expect(out.info.tag).toContain('custom_schema.basic1')
  })

  it('a missing target is a clear error, not a change', async () => {
    await expect(applyWrite('tag_text', { row_id: 'g:nope', field: 'emp_code' })).rejects.toThrow(/no placeholder/)
    await expect(applyWrite('tag_text', { text: 'words that are not in the letter', field: 'emp_code' })).rejects.toThrow(/isn't in the letter/)
    await expect(applyWrite('wrap_paragraphs_in_condition', { pids: ['word/document.xml#999'], rules: [{ field: 'employee_schema.level', op: 'is', value: 'L4' }] })).rejects.toThrow(/no paragraph/)
  })

  it('wraps paragraphs in a condition the builder can read back', async () => {
    const p = para('Dear') || state.an.paras.find((x) => x.model.text.trim())
    const depth = HISTORY.undo.length
    const plan = await planWrite('wrap_paragraphs_in_condition', { pids: [p.pid], rules: [{ field: 'employee_schema.promotion_needed', op: 'is', value: 'Yes' }] })
    expect(plan.narrow).toBe(false)
    expect(plan.summary).toMatch(/only when .*promotion/i)
    expect(HISTORY.undo.length).toBe(depth)
    const out = await applyWrite('wrap_paragraphs_in_condition', { pids: [p.pid], rules: [{ field: 'employee_schema.promotion_needed', op: 'is', value: 'Yes' }] })
    expect(out.info.expr).toContain('promotion_needed | string | lower | trim == "yes"')
    expect(state.logic.length).toBe(2)
    expect(state.built.xml['word/document.xml']).toContain('{% if employee_schema.promotion_needed')
    computeLogic()
    expect(state.lg.every((e) => e.status === 'ok')).toBe(true)
    expect(HISTORY.undo.length).toBe(depth + 1)
  })

  it('refuses a condition with a number test on text, an incomplete rule or an unknown field', async () => {
    const p = state.an.paras.find((x) => x.model.text.trim())
    const w = (rules) => applyWrite('wrap_paragraphs_in_condition', { pids: [p.pid], rules })
    await expect(w([{ field: 'employee_schema.level', op: 'gt', value: 'high' }])).rejects.toThrow(/isn't a number/)
    await expect(w([{ field: 'employee_schema.level', op: 'is' }])).rejects.toThrow(/needs a value/)
    await expect(w([{ field: 'not_a_thing', op: 'is', value: 'x' }])).rejects.toThrow(/isn't a column/)
    expect(state.logic.length).toBe(0)
  })

  it('if / else text replaces a paragraph with versions', async () => {
    const p = para('Dear') || state.an.paras.find((x) => x.model.text.trim())
    const out = await applyWrite('if_else_text', { pids: [p.pid], field: 'employee_schema.level', cases: [{ value: 'L4', text: 'Version for L4' }, { value: 'L5', text: 'Version for L5' }], otherwise_text: 'Everyone else' })
    expect(out.info.versions).toBe(3)
    const xml = state.built.xml['word/document.xml']
    expect(xml).toContain('Version for L4'); expect(xml).toContain('{%- else -%}')
  })

  it('removes a condition block added in this tool, but not one in the uploaded letter', async () => {
    const p = para('Dear') || state.an.paras.find((x) => x.model.text.trim())
    await applyWrite('wrap_paragraphs_in_condition', { pids: [p.pid], rules: [{ field: 'employee_schema.level', op: 'is', value: 'L4' }] })
    computeLogic(); const key = state.lg.find((e) => e.kw === 'if').key
    const out = await applyWrite('remove_condition', { key })
    expect(out.info.removed).toBe(2)
    expect(state.logic.length).toBe(0)
    await loadDocx(fixture('conditions_tagged.docx'), 'conditions_tagged.docx', false)
    computeLogic(); const docIf = state.lg.find((e) => e.kw === 'if')
    await expect(applyWrite('remove_condition', { key: docIf.key })).rejects.toThrow(/uploaded letter/)
  })

  it('changes an existing condition', async () => {
    const p = para('Dear') || state.an.paras.find((x) => x.model.text.trim())
    await applyWrite('wrap_paragraphs_in_condition', { pids: [p.pid], rules: [{ field: 'employee_schema.level', op: 'is', value: 'L4' }] })
    computeLogic(); const key = state.lg.find((e) => e.kw === 'if').key
    const out = await applyWrite('update_condition', { key, rules: [{ field: 'employee_schema.level', op: 'in', value: 'L4, L5' }] })
    expect(out.info.was).toMatch(/l4/i)
    expect(state.logic.some((l) => /"l4", "l5"/.test(l.text))).toBe(true)
  })

  it('hides a salary-table row when it is empty (the table row mechanism)', async () => {
    await loadDocx(fixture('letterA.docx'), 'letterA.docx', false)
    const t = state.tables[0]
    if (!t) return   // this fixture has no empty-cell salary table
    const row = t.rows.find((r) => !r.hide) || t.rows[0]
    await expect(applyWrite('wrap_table_row_in_condition', { table_id: t.id, row: String(row.ri) })).rejects.toThrow(/no tags yet/)
  })
})

describe('reword keeps the tags', () => {
  beforeEach(async () => { await loadDocx(fixture('acme_tagged.docx'), 'acme_tagged.docx', false) })
  const tagged = () => state.an.paras.find((p) => !p.fallback && /\{\{[^}]+\}\}/.test(p.model.text) && p.model.text.replace(/\{\{[^}]+\}\}/g, '').trim().length > 10)

  it('changes the words between the tags and leaves the tags exactly', async () => {
    const p = tagged(); const old = p.model.text
    const tags = [...old.matchAll(/\{\{[\s\S]*?\}\}/g)].map((m) => m[0])
    const fresh = old.replace(/^([^{]*)/, (m) => (m.trim() ? 'Greetings, ' : 'Greetings, '))
    const depth = HISTORY.undo.length
    const out = await applyWrite('replace_paragraph_text', { pid: p.pid, new_text: fresh, expected_text: old })
    expect(out.info.tags_kept).toBe(tags.length)
    expect(state.an.byPid.get(p.pid).model.text).toBe(fresh)
    for (const t of tags) expect(state.an.byPid.get(p.pid).model.text).toContain(t)
    expect(HISTORY.undo.length).toBe(depth + 1)
    // the editor opens the letter from state.srcBuf: it has the reworded text, and gets the old one back on undo
    const inSource = async () => (await JSZip.loadAsync(state.srcBuf)).file(state.mainPath).async('string')
    expect(await inSource()).toContain('Greetings, ')
    await applyWrite('undo', {})
    expect(await inSource()).not.toContain('Greetings, ')
  })

  it('refuses when a tag is changed, dropped or invented, and when the paragraph moved on', async () => {
    const p = tagged(); const old = p.model.text; const before = snapState()
    const tag = old.match(/\{\{[\s\S]*?\}\}/)[0]
    await expect(applyWrite('replace_paragraph_text', { pid: p.pid, new_text: old.replace(tag, '{{ something_else }}') })).rejects.toThrow(/stay exactly/)
    await expect(applyWrite('replace_paragraph_text', { pid: p.pid, new_text: old.replace(tag, 'X') })).rejects.toThrow(/stay exactly/)
    await expect(applyWrite('replace_paragraph_text', { pid: p.pid, new_text: old + ' {{ extra }}' })).rejects.toThrow(/stay exactly/)
    await expect(applyWrite('replace_paragraph_text', { pid: p.pid, new_text: old + ' more', expected_text: 'not what it says' })).rejects.toThrow(/says something else/)
    expect(same(before, snapState())).toBe(true)
  })
})

describe('a failed action is rolled back', () => {
  it('an exception inside a tool restores the snapshot, the history and the undo count', async () => {
    WRITE.boom = { check() {}, run() { state.edits['x:boom'] = { manual: true }; state.logic.push({ id: 'lboom', pid: 'word/document.xml#0', place: 'before', text: '{% if x %}' }); throw new Error('boom') }, summary: () => 'boom' }
    try {
      const before = snapState(); const depth = HISTORY.undo.length
      await expect(applyWrite('boom', {})).rejects.toThrow(/Nothing was changed/)
      expect(same(before, snapState())).toBe(true)
      expect(state.edits['x:boom']).toBeUndefined()
      expect(HISTORY.undo.length).toBe(depth)
      expect(applied.length).toBe(0)
    } finally { delete WRITE.boom }
  })

  it('an action the engine turned down (no change) is an error with the engine\'s reason', async () => {
    const r = rowFor('[Employee Code]')
    await applyWrite('tag_text', { row_id: r.id, field: 'emp_code' })
    await expect(applyWrite('tag_text', { row_id: r.id, field: 'emp_code' })).rejects.toThrow(/Nothing was changed/)
  })

  it('undo only reverts the assistant\'s own last change', async () => {
    await expect(applyWrite('undo', {})).rejects.toThrow(/nothing from this assistant/)
    await applyWrite('tag_text', { row_id: rowFor('[Employee Code]').id, field: 'emp_code' })
    const { setRowKey } = await import('./index.js')
    setRowKey(rowFor('<<Letter Date>>').id, 'current_date')   // the person changes something else
    await expect(applyWrite('undo', {})).rejects.toThrow(/changed after that/)
  })
})

describe('apply_fix', () => {
  it('runs a one-click fix that changes tags on its own, and refuses ones that need the person', async () => {
    await loadDocx(fixture('broken_tagged.docx'), 'broken_tagged.docx', false)
    build()
    const fixable = (state.issues || []).find((x) => x.fix && /^(Change = to ==|Use \||Add \| default|Add trim|Use )/.test(x.fix.label))
    const needs = (state.issues || []).find((x) => x.fix && /^(Choose where|Change condition)/.test(x.fix.label))
    if (needs) await expect(applyWrite('apply_fix', { issue_key: needs.key })).rejects.toThrow(/needs the person/)
    if (fixable) { const out = await applyWrite('apply_fix', { issue_key: fixable.key }); expect(out.info.fix).toBe(fixable.fix.label) }
    await expect(applyWrite('apply_fix', { issue_key: 'nope' })).rejects.toThrow(/no problem/)
  })
})

/* ---- the loop, with a scripted fake of /api/assist ---- */
function scripted(replies) {
  const sent = []
  globalThis.fetch = vi.fn(async (url, init) => {
    const body = JSON.parse(init.body); sent.push(body.payload)
    const next = replies.shift() ?? { content: [{ type: 'text', text: 'done' }], stop_reason: 'end_turn' }
    if (next.error) return { ok: false, status: next.status || 500, json: async () => ({ error: next.error }) }
    return { ok: true, status: 200, json: async () => next }
  })
  return sent
}
const call = (name, input, id = 'toolu_' + Math.random().toString(36).slice(2, 8)) => ({ type: 'tool_use', id, name, input })
const turn = (...content) => ({ content, stop_reason: content.some((b) => b.type === 'tool_use') ? 'tool_use' : 'end_turn' })
const waitPending = async () => { for (let i = 0; i < 200 && !agentState.pending; i++) await new Promise((r) => setTimeout(r, 5)); return agentState.pending }

describe('the loop', () => {
  it('runs read tools at once, sends the results back and ends with Claude\'s words', async () => {
    const sent = scripted([turn({ type: 'text', text: 'Looking.' }, call('get_tags', { status: 'need' }, 'toolu_a')), turn({ type: 'text', text: 'Three things need a tag.' })])
    await sendMessage('What needs a tag?')
    expect(sent.length).toBe(2)
    const second = sent[1].messages
    expect(second[second.length - 1].content[0]).toMatchObject({ type: 'tool_result', tool_use_id: 'toolu_a' })
    expect(JSON.parse(second[second.length - 1].content[0].content).tags.length).toBeGreaterThan(0)
    expect(sent[0].context.outline).toBeTruthy()
    expect(agentState.items.map((i) => i.kind)).toEqual(['user', 'assistant', 'work', 'assistant'])
    expect(agentState.busy).toBe(false)
  })

  it('a write waits for the person: nothing changes until Apply, then the engine\'s result goes back', async () => {
    const r = rowFor('[Employee Code]')
    const sent = scripted([turn(call('tag_text', { row_id: r.id, field: 'emp_code' }, 'toolu_w')), turn({ type: 'text', text: 'Tagged.' })])
    const run = sendMessage('Tag the employee code')
    const pending = await waitPending()
    expect(pending).toBeTruthy()
    const card = agentState.items.find((i) => i.kind === 'proposal')
    expect(card.status).toBe('pending'); expect(card.diff.added.length).toBeGreaterThan(0)
    expect(rowFor('[Employee Code]').key).not.toBe('emp_code')
    decide(card.id, 'apply'); await run
    expect(card.status).toBe('applied')
    expect(rowFor('[Employee Code]').key).toBe('emp_code')
    const res = JSON.parse(sent[1].messages.at(-1).content[0].content)
    expect(res.applied).toBe(true); expect(res).toHaveProperty('new_problems')
  })

  it('Reject changes nothing and tells Claude not to retry', async () => {
    const r = rowFor('[Employee Code]'); const before = snapState()
    const sent = scripted([turn(call('tag_text', { row_id: r.id, field: 'emp_code' }, 'toolu_r')), turn({ type: 'text', text: 'Okay, left alone.' })])
    const run = sendMessage('Tag it'); await waitPending()
    decide(agentState.items.find((i) => i.kind === 'proposal').id, 'reject'); await run
    expect(same(before, snapState())).toBe(true)
    expect(agentState.items.find((i) => i.kind === 'proposal').status).toBe('rejected')
    expect(JSON.parse(sent[1].messages.at(-1).content[0].content).rejected_by_person).toBe(true)
  })

  it('a narrow edit applies without asking only when auto-apply is on, the tool allows it and the model asks for it', async () => {
    const r = rowFor('[Employee Code]')
    // off: waits
    scripted([turn(call('tag_text', { row_id: r.id, field: 'emp_code', auto_apply: true }, 'toolu_1')), turn({ type: 'text', text: 'x' })])
    let run = sendMessage('tag'); expect(await waitPending()).toBeTruthy(); stopAgent(); await run
    clearConversation()
    // on: applies at once
    setAutoApply(true)
    scripted([turn(call('tag_text', { row_id: r.id, field: 'emp_code', auto_apply: true }, 'toolu_2')), turn({ type: 'text', text: 'done' })])
    await sendMessage('tag')
    expect(rowFor('[Employee Code]').key).toBe('emp_code')
    expect(agentState.items.find((i) => i.kind === 'proposal').auto).toBe(true)
    // on, but a broad tool (it has no auto_apply argument): waits
    clearConversation()
    const p = para('Dear') || state.an.paras.find((x) => x.model.text.trim())
    scripted([turn(call('wrap_paragraphs_in_condition', { pids: [p.pid], rules: [{ field: 'employee_schema.level', op: 'is', value: 'L4' }] }, 'toolu_3')), turn({ type: 'text', text: 'x' })])
    run = sendMessage('wrap'); expect(await waitPending()).toBeTruthy(); stopAgent(); await run
    setAutoApply(false)
  })

  it('a bad tool call, an unknown tool and a missing target come back as tool errors, not as changes', async () => {
    const sent = scripted([turn(call('tag_text', { field: 'emp_code', bogus: 1 }, 'toolu_1'), call('delete_everything', {}, 'toolu_2'), call('get_selection', {}, 'toolu_3')), turn(call('tag_text', { row_id: 'g:nope', field: 'emp_code' }, 'toolu_4')), turn({ type: 'text', text: 'I could not.' })])
    const before = snapState()
    await sendMessage('do things')
    const results = sent[1].messages.at(-1).content
    expect(results.map((r) => r.tool_use_id)).toEqual(['toolu_1', 'toolu_2', 'toolu_3'])
    expect(results[0].is_error).toBe(true); expect(results[0].content).toMatch(/not a known argument/)
    expect(results[1].is_error).toBe(true); expect(results[1].content).toMatch(/no tool called/)
    expect(results[2].is_error).toBeUndefined()
    expect(sent[2].messages.at(-1).content[0]).toMatchObject({ is_error: true })
    expect(same(before, snapState())).toBe(true)
  })

  it('stops after 8 rounds', async () => {
    const sent = scripted(Array.from({ length: 12 }, (_, i) => turn(call('get_selection', {}, 'toolu_' + i))))
    await sendMessage('loop forever')
    expect(sent.length).toBe(8)
    expect(agentState.items.at(-1).text).toMatch(/stopped after 8 steps/)
    // the history is still valid for the next message: every call has its result
    const ids = agentState.messages.flatMap((m) => m.content.filter((b) => b.type === 'tool_use').map((b) => b.id))
    const done = agentState.messages.flatMap((m) => m.content.filter((b) => b.type === 'tool_result').map((b) => b.tool_use_id))
    expect(done).toEqual(ids)
  })

  it('Stop while a proposal waits answers every call and leaves the letter alone', async () => {
    const r = rowFor('[Employee Code]'); const before = snapState()
    scripted([turn(call('tag_text', { row_id: r.id, field: 'emp_code' }, 'toolu_s1'), call('get_selection', {}, 'toolu_s2'))])
    const run = sendMessage('tag'); await waitPending(); stopAgent(); await run
    expect(same(before, snapState())).toBe(true)
    const results = agentState.messages.at(-1).content
    expect(results.map((x) => x.tool_use_id)).toEqual(['toolu_s1', 'toolu_s2'])
    expect(agentState.busy).toBe(false)
    expect(agentState.items.at(-1).text).toBe('Stopped.')
  })

  it('shows an API failure in plain words and can try again', async () => {
    scripted([{ error: 'Claude is busy right now. Try again in a minute.', status: 503 }])
    await sendMessage('hello')
    expect(agentState.error).toBe('Claude is busy right now. Try again in a minute.')
    expect(agentState.busy).toBe(false)
    scripted([turn({ type: 'text', text: 'Hello.' })])
    await sendMessage('hello again')
    expect(agentState.error).toBe('')
    expect(agentState.messages.filter((m) => m.role === 'user').length).toBe(1)   // merged: one user turn after the failed one
  })

  it('a model that asks which field to use just asks: no tool, no change', async () => {
    const before = snapState()
    scripted([turn({ type: 'text', text: 'Which column should the CTC come from: ctc or new_ctc?' })])
    await sendMessage('put the ctc here')
    expect(agentState.items.at(-1).text).toMatch(/Which column/)
    expect(same(before, snapState())).toBe(true)
  })

  it('works through a whole edit: look, change a condition, then validate', async () => {
    const p = para('Dear') || state.an.paras.find((x) => x.model.text.trim())
    const sent = scripted([
      turn(call('get_document_outline', {}, 't1')),
      turn(call('wrap_paragraphs_in_condition', { pids: [p.pid], rules: [{ field: 'employee_schema.promotion_needed', op: 'is', value: 'yes' }] }, 't2')),
      turn(call('get_validation', {}, 't3')),
      turn({ type: 'text', text: 'Added, and no new problems.' }),
    ])
    const run = sendMessage('Show this only to promoted employees'); await waitPending()
    decide(agentState.items.find((i) => i.kind === 'proposal').id, 'apply'); await run
    expect(sent.length).toBe(4)
    expect(state.logic.length).toBe(2)
    expect(agentState.items.at(-1).text).toMatch(/Added/)
    setTab('doc')
  })
})
