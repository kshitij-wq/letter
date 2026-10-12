// The Letter Assistant's loop: send the conversation, run the tools Claude asks for, send the results back, until Claude answers in words.
// No DOM. The tool list and its argument schemas are the server's own file (renderer/agent_tools.json), so the page checks every call
// against exactly what Claude was shown. READ tools run at once; WRITE tools become a proposal the person applies or rejects.
import TOOLDEFS from '../../../renderer/agent_tools.json'
import { ToolError, READ, applyWrite, applied, planWrite, undoApplied } from './agentTools.js'
import { columnsForClaude, postAssist } from './claude.js'
import { ckPlain } from './checks.js'
import { flushEditor } from './editor.js'
import { notify } from './events.js'
import { lsGet, lsSet } from './helpers.js'
import { pageLabel, computeLogic, logicRows } from './logic.js'
import { state } from './state.js'
import { HISTORY } from './undo.js'
import { comboOptions, rowStatus } from './rows.js'

export const MAX_ROUNDS = 8
export const MAX_HISTORY_CHARS = 150000
export const TOOLS = TOOLDEFS.tools
export const TOOL_BY_NAME = Object.fromEntries(TOOLS.map((t) => [t.name, t]))

/* ---- argument check: the part of JSON Schema the tool definitions use ---- */
export function validateArgs(schema, value, path = 'arguments') {
  const errs = []
  const t = schema.type
  const typeOk = (v) => t === 'string' ? typeof v === 'string' : t === 'boolean' ? typeof v === 'boolean' : t === 'integer' ? Number.isInteger(v) : t === 'number' ? typeof v === 'number' && Number.isFinite(v)
    : t === 'array' ? Array.isArray(v) : t === 'object' ? !!v && typeof v === 'object' && !Array.isArray(v) : true
  if (t && !typeOk(value)) return [`${path} must be ${t === 'integer' ? 'a whole number' : 'a ' + t}`]
  if (schema.enum && !schema.enum.includes(value)) errs.push(`${path} must be one of ${schema.enum.join(', ')}`)
  if (typeof value === 'string') {
    if (schema.minLength != null && value.length < schema.minLength) errs.push(`${path} is too short`)
    if (schema.maxLength != null && value.length > schema.maxLength) errs.push(`${path} is too long (at most ${schema.maxLength} characters)`)
  }
  if (typeof value === 'number') {
    if (schema.minimum != null && value < schema.minimum) errs.push(`${path} must be at least ${schema.minimum}`)
    if (schema.maximum != null && value > schema.maximum) errs.push(`${path} must be at most ${schema.maximum}`)
  }
  if (Array.isArray(value)) {
    if (schema.minItems != null && value.length < schema.minItems) errs.push(`${path} needs at least ${schema.minItems} item(s)`)
    if (schema.maxItems != null && value.length > schema.maxItems) errs.push(`${path} can have at most ${schema.maxItems} items`)
    if (schema.items) value.forEach((v, i) => errs.push(...validateArgs(schema.items, v, `${path}[${i}]`)))
  }
  if (t === 'object' && value && typeof value === 'object' && !Array.isArray(value)) {
    const props = schema.properties || {}
    for (const k of schema.required || []) if (value[k] === undefined) errs.push(`${path}.${k} is required`)
    for (const [k, v] of Object.entries(value)) {
      if (props[k]) errs.push(...validateArgs(props[k], v, `${path}.${k}`))
      else if (schema.additionalProperties === false) errs.push(`${path}.${k} is not a known argument`)
    }
  }
  return errs
}

/* ---- the conversation ---- */
export const agentState = {
  items: [],            // what the panel shows: {id, kind:'user'|'assistant'|'work'|'proposal'|'note'|'error', ...}
  messages: [],         // what the API sees (Messages API shape)
  busy: false, round: 0, error: '', notes: [],
  autoApply: !!lsGet('lt.agent.auto', false),
  abort: null, pending: null, seq: 0,
}
const nextId = () => 'a' + (++agentState.seq)
const push = (item) => { const it = { id: nextId(), ...item }; agentState.items.push(it); notify(); return it }
export function setAutoApply(on) { agentState.autoApply = !!on; lsSet('lt.agent.auto', !!on); notify() }

const WORK = {
  get_document_outline: 'Looked through the letter', find_text: 'Searched the letter', get_selection: 'Checked what is selected', get_fields: 'Looked at the fields',
  get_tags: 'Looked at the tags', get_conditions: 'Looked at the conditions', get_validation: 'Ran the checks', preview_for_employee: 'Filled the letter with sample values',
}
const errResult = (call, text) => ({ type: 'tool_result', tool_use_id: call.id, content: text, is_error: true })
const okResult = (call, obj) => { let s = JSON.stringify(obj); if (s.length > 30000) s = s.slice(0, 30000) + '…(cut off)'; return { type: 'tool_result', tool_use_id: call.id, content: s } }

/* ---- what Claude is told about the letter (only what CLAUDE.md allows: letter text, tags, column names, few-category values) ---- */
export function buildAgentContext() {
  const an = state.an; if (!an) return {}
  const lines = []
  for (const p of an.paras) {
    if (p.fallback) continue; const t = (p.model.text || '').replace(/\s+/g, ' ').trim(); if (!t) continue
    lines.push(`[${p.pid}]${pageLabel(p) ? ' ' + pageLabel(p) : ''}${p.kind !== 'body' ? ' (' + p.kind + ')' : ''}: ${t.slice(0, 160)}`)
    if (lines.join('\n').length > 14000) { lines.push('…(more paragraphs: call get_document_outline)'); break }
  }
  const s = state.sel; let selection = 'nothing selected'
  if (s.pids && s.pids.length) selection = 'paragraphs ' + s.pids.join(', ')
  else if (s.text) selection = `words “${s.text.slice(0, 120)}”${s.range ? ' in paragraph ' + s.range.pid : ''}`
  const rows = state.rows.filter((r) => r.count); const by = (st) => rows.filter((r) => rowStatus(r) === st)
  const tags = { placeholders: rows.length, need_a_tag: by('need').length, to_check: by('check').length, tagged: by('tagged').length,
    open: [...by('need'), ...by('check')].slice(0, 30).map((r) => ({ row_id: r.id, text: r.find.slice(0, 60), field: r.key || null })) }
  computeLogic()
  const conditions = logicRows().filter((e) => e.kw === 'if' || e.kw === 'elif').slice(0, 30).map((e) => ({ key: e.key, tag: e.text.slice(0, 120), pid: e.pid }))
  const iss = (state.issues || []).filter((x) => x.level === 'error' || x.level === 'warn')
  const validation = { errors: iss.filter((x) => x.level === 'error').length, warnings: iss.filter((x) => x.level === 'warn').length, first: iss.slice(0, 12).map((x) => `${x.level}: ${ckPlain(x.html).slice(0, 160)}`) }
  const fields = { data_columns: columnsForClaude().slice(0, 80), compup_tags: comboOptions().filter((o) => /^CompUp/.test(o.g)).map((o) => o.v).slice(0, 80) }
  return { letter_name: state.fileName, step: state.tab, view: state.view, outline: lines.join('\n'), selection, tags, conditions, fields, validation }
}

/** Keep the conversation under the size the server accepts: drop the oldest whole turns, never half a tool exchange. */
export function trimHistory(messages, max = MAX_HISTORY_CHARS, maxMessages = 70) {
  let list = messages.slice()
  const size = () => JSON.stringify(list).length
  const startsTurn = (m) => m.role === 'user' && !m.content.some((b) => b.type === 'tool_result')
  while ((size() > max || list.length > maxMessages) && list.length > 1) {
    let i = 1; while (i < list.length && !startsTurn(list[i])) i++
    if (i >= list.length) break
    list = list.slice(i)
  }
  return list
}

function addUserText(text) {
  const note = agentState.notes.splice(0).join(' ')
  const blocks = [{ type: 'text', text: note ? `${text}\n\n(${note})` : text }]
  const last = agentState.messages[agentState.messages.length - 1]
  if (last && last.role === 'user') last.content.push(...blocks)   // after a stopped turn: one user message, results first
  else agentState.messages.push({ role: 'user', content: blocks })
}

/* ---- running one tool call ---- */
function decisionFor(item) {
  return new Promise((resolve) => { agentState.pending = { id: item.id, resolve } })
}
/** The person's answer to a proposal card. */
export function decide(id, what) {
  const p = agentState.pending
  if (!p || p.id !== id) return false
  agentState.pending = null; p.resolve(what); return true
}

async function runCall(call, signal) {
  const def = TOOL_BY_NAME[call.name]
  if (!def) return errResult(call, `There is no tool called “${call.name}”. The tools are: ${TOOLS.map((t) => t.name).join(', ')}.`)
  const args = call.input && typeof call.input === 'object' ? call.input : {}
  const bad = validateArgs(def.input_schema, args)
  if (bad.length) { push({ kind: 'work', text: `${WORK[call.name] || 'Tried a change'} (the request was not valid)`, failed: true }); return errResult(call, `Invalid arguments: ${bad.join('; ')}.`) }
  if (!state.an) return errResult(call, 'No letter is open.')
  if (def.kind === 'read') {
    try { await flushEditor(); const out = await READ[call.name](args); push({ kind: 'work', text: WORK[call.name] }); return okResult(call, out) }
    catch (e) { return toolFailure(call, e) }
  }
  // a write: show what it would do first (it is run and put back), then wait for the person unless it is narrow and auto-apply is on
  let plan
  try { plan = await planWrite(call.name, args) } catch (e) { return toolFailure(call, e) }
  const auto = agentState.autoApply && def.allow_auto === true && args.auto_apply === true && plan.narrow === true
  const card = push({ kind: 'proposal', tool: call.name, summary: plan.summary, diff: plan.diff, problems: plan.new_problems || [], status: auto ? 'applying' : 'pending', auto })
  let answer = 'apply'
  if (!auto) answer = await decisionFor(card)
  if (signal.aborted || answer === 'stop') { card.status = 'rejected'; notify(); return errResult(call, 'The person stopped the assistant before this was decided. Nothing was changed.') }
  if (answer === 'reject') { card.status = 'rejected'; notify(); return okResult(call, { applied: false, rejected_by_person: true, note: 'The person rejected this change. Nothing was changed. Do not try it again unless they ask.' }) }
  try {
    const out = await applyWrite(call.name, args)
    card.status = call.name === 'undo' ? 'undone' : 'applied'; card.depth = HISTORY.undo.length; card.summary = out.summary || card.summary; card.diff = out.diff || card.diff; card.problems = out.new_problems || []; card.real = out.real_jinja || ''; notify()
    return okResult(call, { applied: true, ...out, note: 'This is what the engine confirmed. Paragraph ids may have changed: call get_document_outline before the next change.' })
  } catch (e) { card.status = 'failed'; card.error = e instanceof ToolError ? e.message : 'Something went wrong. Nothing was changed.'; notify(); return toolFailure(call, e, true) }
}
function toolFailure(call, e, quiet) {
  if (e instanceof ToolError) { if (!quiet) push({ kind: 'work', text: `Could not do that: ${e.message}`, failed: true }); return errResult(call, e.message) }
  console.warn(e); if (!quiet) push({ kind: 'work', text: 'A tool failed.', failed: true })
  return errResult(call, 'The tool failed unexpectedly. Nothing was changed.')
}

/* ---- the loop ---- */
async function loop() {
  const ac = new AbortController(); agentState.abort = ac; agentState.busy = true; agentState.error = ''; notify()
  try {
    for (let round = 0; round < MAX_ROUNDS; round++) {
      agentState.round = round + 1; notify()
      await flushEditor()
      const resp = await postAssist('agent', { messages: trimHistory(agentState.messages), context: buildAgentContext() }, { signal: ac.signal })
      const content = Array.isArray(resp.content) ? resp.content : []
      if (!content.length) { agentState.error = 'Claude sent back an empty answer. Try again.'; return }
      agentState.messages.push({ role: 'assistant', content })
      for (const b of content) if (b.type === 'text' && String(b.text).trim()) push({ kind: 'assistant', text: b.text })
      const calls = content.filter((b) => b.type === 'tool_use')
      if (!calls.length) return
      const results = []
      for (const call of calls) results.push(ac.signal.aborted ? errResult(call, 'The person stopped the assistant.') : await runCall(call, ac.signal))
      agentState.messages.push({ role: 'user', content: results })
      if (ac.signal.aborted) { push({ kind: 'note', text: 'Stopped.' }); return }
      if (round === MAX_ROUNDS - 1) push({ kind: 'note', text: `I stopped after ${MAX_ROUNDS} steps. Say “continue” if you want me to go on.` })
    }
  } catch (e) {
    if (ac.signal.aborted || (e && e.name === 'AbortError')) push({ kind: 'note', text: 'Stopped.' })
    else agentState.error = (e && e.message) || 'Something went wrong.'
  } finally { agentState.busy = false; agentState.abort = null; agentState.pending = null; notify() }
}

export async function sendMessage(text) {
  text = String(text || '').trim()
  if (!text || agentState.busy) return false
  if (!state.an) { agentState.error = 'Open a letter first.'; notify(); return false }
  push({ kind: 'user', text }); addUserText(text)
  await loop()
  return true
}
/** The Stop button: cancels the request in flight and any proposal waiting for an answer. */
export function stopAgent() {
  if (agentState.abort) agentState.abort.abort()
  if (agentState.pending) decide(agentState.pending.id, 'stop')
}
export function clearConversation() {
  stopAgent(); agentState.items = []; agentState.messages = []; agentState.error = ''; agentState.notes = []; applied.length = 0; notify()
}
/** "Undo" on an applied card: only while nothing else has been changed since. The model hears about it with the next message. */
export async function undoCard(id) {
  const card = agentState.items.find((i) => i.id === id); if (!card || card.status !== 'applied') return false
  const top = applied[applied.length - 1]
  if (!top || top.depth !== HISTORY.undo.length) return false
  const r = await undoApplied(); card.status = 'undone'; agentState.notes.push(`The person undid your last change (${top.summary}).`); notify(); return !!r
}
/** Can this applied card still be undone from here? */
export function canUndoCard(card) { const top = applied[applied.length - 1]; return !!top && card.status === 'applied' && top.depth === HISTORY.undo.length && top.summary === card.summary }
