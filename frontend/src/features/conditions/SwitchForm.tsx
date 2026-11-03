import { Plus, X } from 'lucide-react'
import { es, useEngineRev } from '@/hooks/useEngine'
import { Button, FieldPicker, IconButton, Input, Select, Textarea } from '@/ui'
import { applySwitch, cancelSwitch, switchPreview } from '../../engine'
import { InspectorBody, InspectorFoot } from '../shell/Inspector'
import { Part, SelSummary } from './parts'
import { focusSoon, useBump, useFieldGroups, useSyncedText } from './hooks'

type Case = { v: string; t: string }
const MATCH = [{ value: 'text', label: 'Match text (ignores case)' }, { value: 'number', label: 'Match numbers' }]

function CaseRow({ sw, k, inline, change }: { sw: any; k: number; inline: boolean; change: () => void }) {
  const c: Case = sw.cases[k]
  const [v, setV] = useSyncedText(c.v)
  const [t, setT] = useSyncedText(c.t)
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center gap-1.5">
        <Input id={`swv-${k}`} mono aria-label={`Value ${k + 1}`} value={v} placeholder={k === 0 ? 'Value, e.g. A' : 'e.g. B'} spellCheck={false} className="min-w-0 flex-1"
          onChange={(e) => { setV(e.target.value); c.v = e.target.value; change() }} />
        {k > 0 && <IconButton label={`Remove value ${k + 1}`} size="sm" onClick={() => { sw.cases.splice(k, 1); change() }}><X aria-hidden /></IconButton>}
      </div>
      {inline && k === 0
        ? <p title="The selected words" className="rounded-control bg-hairline-soft px-2.5 py-1.5 font-serif text-base">{c.t}</p>
        : <Textarea id={`swt-${k}`} rows={2} aria-label={`Text for value ${k + 1}`} placeholder="Text for this value" value={t}
            onChange={(e) => { setT(e.target.value); c.t = e.target.value; change() }} />}
    </div>
  )
}

/** "Text by value": a different version of a paragraph (or of some words) depending on a field such as rating or band. */
export function SwitchForm() {
  useEngineRev()
  const bump = useBump()
  const groups = useFieldGroups(false)
  const sw = es.switchUi
  const [other, setOther] = useSyncedText(sw?.other ?? '')
  if (!sw) return null
  const inline = sw.mode === 'inline'
  const preview = switchPreview(sw) as string
  return (
    <>
      <InspectorBody>
        <SelSummary title={<b className="font-semibold">Text by value</b>}
          ctx={inline ? 'Changes the selected words depending on a field.' : 'Shows a different version of the paragraph depending on a field, such as rating or band.'} />
        <Part title="Field" htmlFor="swField">
          <FieldPicker id="swField" value={sw.field} groups={groups} allowCustom placeholder="Field, e.g. employee_schema.rating" searchPlaceholder="Search fields"
            onChange={(v) => { sw.field = v; bump() }} />
          <Select aria-label="How to compare" value={sw.match} options={MATCH} onValueChange={(m) => { sw.match = m; bump() }} />
        </Part>
        <Part title="Text for each value" hint="Values can share a text: A, A+">
          <div className="grid gap-3">
            {sw.cases.map((_: Case, k: number) => <CaseRow key={k} sw={sw} k={k} inline={inline} change={bump} />)}
          </div>
          <div>
            <Button size="sm" variant="ghost" icon={<Plus aria-hidden />} onClick={() => { sw.cases.push({ v: '', t: '' }); bump(); focusSoon(`#swv-${sw.cases.length - 1}`) }}>Add a value</Button>
          </div>
        </Part>
        <Part title="Any other value (optional)" htmlFor="swOther">
          <Textarea id="swOther" rows={2} placeholder="Leave empty to show nothing" value={other} onChange={(e) => { setOther(e.target.value); sw.other = e.target.value; bump() }} />
        </Part>
        {sw.mode === 'para' && (
          <Part title="Where it goes" htmlFor="swWhere">
            <Select id="swWhere" value={sw.where} onValueChange={(w) => { sw.where = w; bump() }}
              options={[
                { value: 'replace', label: `Replace the selected paragraph${sw.pids.length > 1 ? 's' : ''} with these versions` },
                { value: 'after', label: 'Add these versions after it, keep the original for everyone' },
              ]} />
          </Part>
        )}
        <Part title="What the tool writes">
          <p id="swPrev" className="rounded-control bg-tag-bg px-2.5 py-2 font-mono text-xs text-tag [overflow-wrap:anywhere]">{preview || <span className="text-muted">Pick a field and a value to see the tags.</span>}</p>
        </Part>
      </InspectorBody>
      <InspectorFoot>
        <Button variant="primary" onClick={() => applySwitch()}>Insert</Button>
        <Button variant="ghost" onClick={cancelSwitch}>Cancel</Button>
      </InspectorFoot>
    </>
  )
}
