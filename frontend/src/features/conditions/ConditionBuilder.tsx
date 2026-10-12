import { Check, CircleAlert, Plus, Sparkles, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { es, useEngineRev } from '@/hooks/useEngine'
import { Badge, Button, FieldPicker, FilterChip, IconButton, Input, Notice, SegmentedControl, Select, cn, type PickerGroup } from '@/ui'
import {
  CB_NOVAL, CB_NUM, CB_OPS, COND_PRESETS, aiCondition, aiReady, cbAddRule, cbHl, cbList, cbLive, cbNew, cbPickValue, cbRemoveRule,
  cbRestart, cbSetField, cbToBuilder, cbToJinja, cbValues, dataKey,
} from '../../engine'
import { focusSoon, useFieldGroups, useSyncedText } from './hooks'

export type Rule = { field: string; op: string; value: string }
export type Cb = { rules: Rule[]; join: string; raw: string | null }
export type Facts = { raw: boolean; expr: string; en: string; why: string; handOk: boolean }

const OPS = (CB_OPS as Array<[string, string]>).map(([value, label]) => ({ value, label }))
const PRESETS = (COND_PRESETS as Array<{ id: string; label: string; expr: string }>).filter((p) => p.expr).map((p) => ({ value: p.id, label: p.label }))
const JOIN = [{ value: 'and', label: 'and' }, { value: 'or', label: 'or' }]

/** Whether the "Show Jinja" disclosure is open stays as the person left it. */
let jinjaOpen = false

/* ------------------------------------------------------------------------------------------------ one rule: field, test, value */
function RuleRow({ cb, k, change, groups }: { cb: Cb; k: number; change: () => void; groups: PickerGroup[] }) {
  const rev = useEngineRev()
  const r = cb.rules[k]
  const many = cb.rules.length > 1
  const noval = CB_NOVAL.has(r.op)
  const multi = r.op === 'in' || r.op === 'notin'
  const [val, setVal] = useSyncedText(r.value)
  const vals = useMemo(() => (noval ? [] : (cbValues(r.field) as Array<{ v: string; n: number }>)), [r.field, noval, rev])
  const hint = multi ? 'A, A+ (a comma between)' : CB_NUM[r.op as keyof typeof CB_NUM] ? 'a number, e.g. 3' : 'value, e.g. yes'
  const raw = String(r.value ?? '').trim().toLowerCase()
  const picked = new Set(multi ? cbList(r.value).map((x: string) => x.toLowerCase()) : raw ? [raw] : [])
  const sfx = many ? ` ${k + 1}` : ''

  return (
    <div className="grid gap-2">
      <div className="flex items-center gap-1.5">
        <div className="min-w-0 flex-1">
          <FieldPicker id={`cbf-${k}`} aria-label={`Field${sfx}`} value={r.field} groups={groups} allowCustom placeholder="Choose a field…" searchPlaceholder="Search fields"
            customLabel={(t) => `Use “${t}” as the field`}
            onChange={(v) => { cbSetField(cb, k, v); change(); if (!CB_NOVAL.has(cb.rules[k].op)) focusSoon(`#cbv-${k}`) }} />
        </div>
        {many && <IconButton label={`Remove rule ${k + 1}`} size="sm" onClick={() => { cbRemoveRule(cb, k); change() }}><X aria-hidden /></IconButton>}
      </div>
      <div className="flex items-center gap-1.5">
        <Select aria-label={`Test${sfx}`} id={`cbo-${k}`} value={r.op} options={OPS} className={noval ? '' : 'w-[44%] shrink-0'}
          onValueChange={(op) => { r.op = op; change(); if (!CB_NOVAL.has(op)) focusSoon(`#cbv-${k}`) }} />
        {!noval && (
          <Input id={`cbv-${k}`} aria-label={`Value${sfx}`} value={val} placeholder={hint} spellCheck={false} autoComplete="off" className="min-w-0 flex-1"
            onChange={(e) => { setVal(e.target.value); r.value = e.target.value; change() }} />
        )}
      </div>
      {vals.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Values in your data">
          <span className="text-xs text-muted">In your data</span>
          {vals.map((v) => {
            const on = picked.has(v.v.toLowerCase()) && (multi || raw !== '' || v.v === '')
            return (
              <FilterChip key={v.v || '(empty)'} pressed={on} count={v.n} onPressedChange={() => { cbPickValue(cb, k, v.v); change() }}>
                <span title={`${v.n} employee${v.n > 1 ? 's' : ''}`} className="inline-flex items-center gap-1">{on && <Check aria-hidden className="size-3" />}{v.v || '(empty)'}</span>
              </FilterChip>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------------------------------------ the Jinja editor */
function JinjaEditor({ cb, change, invalid }: { cb: Cb; change: () => void; invalid: boolean }) {
  const [val, setVal] = useSyncedText(cb.raw ?? '')
  return (
    <div className={cn('cb-code', invalid && 'bad')}>
      <div className="cb-hl" aria-hidden dangerouslySetInnerHTML={{ __html: cbHl(val) }} />
      <textarea className="cb-rawin" rows={3} spellCheck={false} autoComplete="off" aria-label="Condition written in Jinja" aria-invalid={invalid || undefined} aria-describedby={invalid ? 'cbInfo' : undefined}
        placeholder={'e.g. employee_schema.rating | lower == "a"'} value={val}
        onChange={(e) => { setVal(e.target.value); cb.raw = e.target.value; change() }} />
    </div>
  )
}

/* ------------------------------------------------------------------------------------------------ describe it in words (Claude) */
function AskClaude({ change }: { change: () => void }) {
  useEngineRev()
  const [ask, setAsk] = useState<string>(es.cbAsk || '')
  if (!aiReady()) return null
  const go = async () => { await aiCondition(ask); change() }
  return (
    <div className="flex items-center gap-1.5">
      <Input aria-label="Describe the condition" value={ask} placeholder="Or describe it, e.g. promoted employees whose PLI changed" className="min-w-0 flex-1"
        onChange={(e) => setAsk(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void go() } }} />
      <Button size="md" icon={<Sparkles aria-hidden />} loading={!!es.cbBusy} onClick={() => void go()}>{es.cbBusy ? 'Asking…' : 'Ask Claude'}</Button>
    </div>
  )
}

/* ------------------------------------------------------------------------------------------------ the builder */
/**
 * "Field, test, value" rules joined by and / or, or the condition written as Jinja: two views of one condition.
 * `cb` is the engine's state.cb, edited in place; `change` redraws the form that owns it.
 */
export function ConditionBuilder({ cb, change, facts }: { cb: Cb; change: () => void; facts: Facts }) {
  const groups = useFieldGroups(true)
  const raw = cb.raw != null
  const swap = (next: Cb) => { es.cb = next; change() }
  const setMode = (m: 'builder' | 'jinja') => {
    if (m === 'jinja' && !raw) { cbToJinja(cb); change(); focusSoon('.cb-code textarea') }
    else if (m === 'builder' && raw) { const next = cbToBuilder(cb); if (next) swap(next as Cb) }   // written by hand: the note below says what to do
  }
  return (
    <div className="grid gap-3">
      <SegmentedControl<'builder' | 'jinja'> label="Write the condition with" size="sm" value={raw ? 'jinja' : 'builder'} onValueChange={setMode}
        items={[{ value: 'builder', label: 'Builder' }, { value: 'jinja', label: 'Jinja' }]} className="w-fit" />
      {raw ? (
        <>
          <JinjaEditor cb={cb} change={change} invalid={!!facts.why} />
          {!facts.handOk && (
            <Notice action={<Button size="sm" onClick={() => { swap(cbRestart() as Cb); focusSoon('#cbf-0') }}>Start again with the builder</Button>}>
              Written by hand, so the builder can’t show it. Keep editing it here, or start again with the builder.
            </Notice>
          )}
        </>
      ) : (
        <>
          {cb.rules.map((_, k) => (
            <div key={k} className="grid gap-3">
              {k > 0 && (
                <div className="flex items-center gap-2 text-sm text-muted">
                  <span aria-hidden className="h-px flex-1 bg-hairline-soft" />
                  {k === 1
                    ? <Select size="sm" aria-label="And or or" value={cb.join} options={JOIN} className="w-[72px]" onValueChange={(j) => { cb.join = j; change() }} />
                    : <span>{cb.join}</span>}
                  <span aria-hidden className="h-px flex-1 bg-hairline-soft" />
                </div>
              )}
              <RuleRow cb={cb} k={k} change={change} groups={groups} />
            </div>
          ))}
          <div className="flex items-center justify-between gap-2">
            <Button size="sm" variant="ghost" icon={<Plus aria-hidden />} onClick={() => { const k = cbAddRule(cb); change(); focusSoon(`#cbf-${k}`) }}>Add a rule</Button>
            <Select size="sm" aria-label="Start from a common condition" value="" placeholder="Common conditions…" options={PRESETS} className="w-[190px]"
              onValueChange={(id) => { const pr = (COND_PRESETS as Array<{ id: string; expr: string }>).find((x) => x.id === id); if (pr) swap(cbNew(pr.expr) as Cb) }} />
          </div>
        </>
      )}
      <AskClaude change={change} />
    </div>
  )
}

/* ------------------------------------------------------------------------------------------------ the live result */
type Live = { hasRows: boolean; count: { n: number; total: number; more: boolean; error?: boolean } | null; emp: { who: string; shown?: boolean; error?: string }; made: string[]; sig: string }

/**
 * What the condition means and how it plays out: the words, a typing mistake if there is one, how many employees it is
 * true for, and whether it shows the letter to the employee being previewed (the same engine and the same test).
 */
export function ConditionResult({ cb, facts }: { cb: Cb; facts: Facts }) {
  useEngineRev()
  const { expr, why, en, raw } = facts
  const ok = !!expr && !why
  const sig = `${raw ? 'r' : 'b'}|${expr}|${es.pvIdx}|${dataKey()}`
  const [live, setLive] = useState<Live | null>(null)
  useEffect(() => {
    if (!ok) { setLive(null); return }
    let dead = false
    const t = setTimeout(async () => {
      try { const r = await cbLive(cb); if (!dead) setLive({ ...(r as Omit<Live, 'sig'>), sig }) } catch { if (!dead) setLive(null) }
    }, 200)
    return () => { dead = true; clearTimeout(t) }
    // eslint-disable-next-line
  }, [sig, ok])

  const note: string = es.cbNote || ''
  return (
    <div id="cbInfo" aria-live="polite" className="grid gap-2 rounded-panel bg-hairline-soft/70 p-3 text-base">
      {note && <p className="text-sm text-muted">{note}</p>}
      {!expr && <p className="text-sm text-muted">{raw ? 'Type a condition in Jinja, e.g. employee_schema.rating | lower == "a".' : 'Pick a field, a test and a value.'}</p>}
      {expr && !why && <p className="leading-snug">{en ? <>Shown when <b className="font-semibold">{en}</b>.</> : 'Written in Jinja, so there is no plain-English version.'}</p>}
      {why && <div className="flex items-start gap-2 text-err"><CircleAlert aria-hidden className="mt-0.5" /><span className="min-w-0 leading-snug">{why}</span></div>}
      {ok && !live && <p className="text-sm text-muted">Checking on your data…</p>}
      {ok && live && (
        <>
          <p className="leading-snug">
            {!live.hasRows ? <span className="text-sm text-muted">Load a data file to see how many employees this covers.</span>
              : !live.count || live.count.error ? <span className="text-sm text-muted">Can’t test this one on your data.</span>
              : <>True for <b className="tnum font-semibold">{live.count.n}</b> of {live.count.total} employee{live.count.total === 1 ? '' : 's'}{live.count.more ? ' (first 3,000)' : ''}{live.count.n === 0 ? '. Check the value' : live.count.n === live.count.total ? '. That is everyone' : ''}.</>}
          </p>
          <p className="flex flex-wrap items-center gap-2 leading-snug">
            {live.emp.error
              ? <span className="text-sm text-muted">Can’t test this condition on {live.emp.who}: {live.emp.error}</span>
              : <><span>For <b className="font-semibold">{live.emp.who}</b>:</span>{live.emp.shown ? <Badge tone="ok"><Check aria-hidden className="size-3" />Shown</Badge> : <Badge>Hidden</Badge>}</>}
          </p>
          {live.made.length > 0 && <p className="text-sm text-muted">{live.made.join(', ')} {live.made.length > 1 ? 'aren’t' : 'isn’t'} in your data file, so this used a made-up value{live.made.length > 1 ? 's' : ''}.</p>}
        </>
      )}
      {ok && !raw && (
        <details className="group text-sm" open={jinjaOpen} onToggle={(e) => { jinjaOpen = e.currentTarget.open }}>
          <summary className="cursor-pointer select-none rounded-control py-0.5 text-muted transition-colors hover:text-ink">Show Jinja</summary>
          <code className="mt-1.5 block overflow-x-auto rounded-tag border border-tag-line bg-tag-bg px-2 py-1 font-mono text-xs text-tag [overflow-wrap:anywhere]">{`{% if ${expr} %}`}</code>
        </details>
      )}
    </div>
  )
}
