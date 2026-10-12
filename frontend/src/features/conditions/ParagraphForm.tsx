import { Plus } from 'lucide-react'
import { useRef, useState } from 'react'
import { es, useEngineRev } from '@/hooks/useEngine'
import { Button, FieldPicker, FilterChip, Input, Section, Select, Textarea } from '@/ui'
import {
  COND_PRESETS, LOGIC_QUICK, PLACES, applyParaCondition, cbExpr, cbFacts, cbNew, insertLogicTag, lgInsertAtCursor, lgTextForKw, lgTextWithExpr, logicTpl,
  paraSelection, pageLabel, snippet, startSwitchParagraphs,
} from '../../engine'
import { InspectorBody, InspectorFoot } from '../shell/Inspector'
import { ConditionBuilder, ConditionResult, type Cb } from './ConditionBuilder'
import { Code, Part, SelSummary } from './parts'
import { focusSoon, useBump, useFieldGroups } from './hooks'

const PLACE_OPTIONS = (PLACES as Array<[string, string]>).map(([value, label]) => ({ value, label }))
const PRESETS = (COND_PRESETS as Array<{ id: string; label: string; expr: string }>).filter((p) => p.expr).map((p) => ({ value: p.id, label: p.label }))

type ParaSel = NonNullable<ReturnType<typeof paraSelection>>

/** Advanced: one logic tag typed by hand (else if, else, end if, set ...), before or after the selected paragraphs. */
function AdvancedTag({ sel }: { sel: ParaSel }) {
  const { openTop, kw0, place0 } = sel
  const [kw, setKw] = useState<string>(kw0)
  const [text, setText] = useState<string>(logicTpl(kw0, ''))
  const [place, setPlace] = useState<string>(place0)
  const input = useRef<HTMLInputElement>(null)
  const groups = useFieldGroups(true)

  // put the cursor on CONDITION so the next thing typed replaces it
  const aim = (value: string) => requestAnimationFrame(() => {
    const el = input.current; if (!el) return
    el.focus()
    const i = value.indexOf('CONDITION'); if (i >= 0) el.setSelectionRange(i, i + 9)
  })
  const chooseKw = (k: string) => {
    const next = lgTextForKw(text, k) as string
    setKw(k); setText(next); setPlace(k === 'endif' || k === 'endfor' ? 'after' : 'before'); aim(next)
  }
  const insert = () => insertLogicTag(text, place)

  return (
    <Section defaultOpen={!!openTop} className="border-t border-hairline-soft pt-3"
      title={openTop ? <>Advanced: close the open <Code>{openTop.text.slice(0, 40)}</Code> here, or insert another single tag</> : 'Advanced: insert a single logic tag'}>
      <div className="grid gap-3">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Tag type">
          {(LOGIC_QUICK as Array<{ k: string; label: string }>).map((q) => (
            <FilterChip key={q.k} pressed={kw === q.k} onPressedChange={(on) => { if (on) chooseKw(q.k) }}>
              {q.label}{openTop && q.k === kw0 ? ` · closes ${openTop.expr.slice(0, 24)}` : ''}
            </FilterChip>
          ))}
        </div>
        <Input ref={input} mono aria-label="Tag text" value={text} spellCheck={false} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); insert() } }} />
        <div className="grid grid-cols-2 gap-1.5">
          <Select aria-label="Condition" value="" placeholder="Condition…" options={PRESETS}
            onValueChange={(id) => {
              const pr = (COND_PRESETS as Array<{ id: string; expr: string }>).find((x) => x.id === id); if (!pr) return
              const r = lgTextWithExpr(text, pr.expr) as { kw: string; text: string }
              setText(r.text); setKw(r.kw)
            }} />
          <FieldPicker aria-label="Insert a field" value="" groups={groups} placeholder="Insert a field…"
            onChange={(v) => { const el = input.current; const next = lgInsertAtCursor(text, v, el?.selectionStart ?? undefined, el?.selectionEnd ?? undefined) as string; setText(next); focusSoon('input[aria-label="Tag text"]') }} />
          <Select aria-label="Where" value={place} options={PLACE_OPTIONS} className="col-span-2" onValueChange={setPlace} />
        </div>
        <div className="flex items-center gap-3">
          <Button variant="primary" onClick={insert}>Insert tag</Button>
          <span className="text-sm text-muted">Type any tag, e.g. <code className="font-mono text-xs">{'{%- elif x == "y" -%}'}</code>.</span>
        </div>
      </div>
    </Section>
  )
}

/** Paragraph(s) selected: show them only when a condition holds. */
export function ParagraphForm({ close }: { close: () => void }) {
  useEngineRev()
  const bump = useBump()
  const [other, setOther] = useState('')
  const sel = paraSelection()
  if (!sel) return null
  if (!es.cb) es.cb = cbNew('')
  const cb = es.cb as Cb
  const facts = cbFacts(cb)
  const { ps, first, stack, top } = sel
  const n = ps.length
  const what = n > 1 ? `these ${n} paragraphs` : 'this paragraph'

  const add = () => {
    const had = !!cbExpr(cb)
    applyParaCondition(other)
    if (!had) focusSoon('.cb-code textarea, #cbf-0')
  }

  return (
    <>
      <InspectorBody>
        <SelSummary
          title={n > 1 ? <><b className="font-semibold">{n} paragraphs</b> {sel.onPage}</> : <b className="font-semibold">Paragraph {sel.onPage}</b>}
          quote={<>“{snippet(first, 70)}”</>}
          ctx={stack.length ? <>Inside <Code>{top.text.slice(0, 70)}</Code>{pageLabel(top.p) ? ` from ${pageLabel(top.p)}` : ''}</> : 'Not inside any condition'} />
        <Part title={`Show ${what} only when`}>
          <ConditionBuilder cb={cb} change={bump} facts={facts} />
        </Part>
        <Part title="Otherwise (alternative text, optional)" htmlFor="cbOther">
          <Textarea id="cbOther" rows={2} value={other} placeholder="Leave empty to show nothing. One paragraph per line." onChange={(e) => setOther(e.target.value)} />
        </Part>
        <ConditionResult cb={cb} facts={facts} />
        <p className="text-sm text-muted">The tool puts the if before {n > 1 ? 'the first paragraph' : 'it'} and the end if after {n > 1 ? 'the last' : 'it'}, so nothing is left open.</p>
        <div>
          <Button variant="secondary" size="sm" onClick={() => { startSwitchParagraphs(); focusSoon('#swField') }}>Different text by value…</Button>
        </div>
        <AdvancedTag sel={sel} />
      </InspectorBody>
      <InspectorFoot>
        <Button variant="primary" icon={<Plus aria-hidden />} onClick={add}>Add condition</Button>
        <Button variant="ghost" onClick={close}>Cancel</Button>
      </InspectorFoot>
    </>
  )
}
