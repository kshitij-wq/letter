import { Plus } from 'lucide-react'
import { useRef, useState } from 'react'
import { es, useEngineRev } from '@/hooks/useEngine'
import { Button, FieldPicker, Input, Select } from '@/ui'
import {
  applyInlineIf, applyInlineTag, backFromInline, setTab, cbExpr, cbFacts, cbNew, insertIntoText, startInlineIf, startInlineTag, startSwitchInline, tagSelectedWords,
} from '../../engine'
import { InspectorBody, InspectorFoot } from '../shell/Inspector'
import { openInspector } from '../shell/inspector'
import { ConditionBuilder, ConditionResult, type Cb } from './ConditionBuilder'
import { ActionRow, Part, SelSummary } from './parts'
import { focusSoon, useBump, useFieldGroups } from './hooks'

const where = (s: string) => `“${s.slice(0, 48)}${s.length > 48 ? '…' : ''}”`
const WHERE = [
  { value: 'before', label: 'Before the words' },
  { value: 'after', label: 'After the words' },
  { value: 'replace', label: 'Instead of the words' },
]

/** "Tag this text": the words become a placeholder row and its tag editor opens (the row id is 'g:' + the words). */
export function tagWords() {
  const id = 'g:' + es.sel.text
  tagSelectedWords()
  if ((es.rows as any[]).some((r) => r.id === id)) { setTab('tags'); openInspector('tag', { id }) }
}

/** Words selected in the letter: what to do with them. */
export function WordsActions({ close }: { close: () => void }) {
  useEngineRev()
  const s = es.sel
  return (
    <>
      <InspectorBody>
        <SelSummary title="Selected words" quote={<>“{s.text}”</>} />
        <div className="-mx-1 grid gap-0.5">
          <ActionRow id="selTag" title="Tag this text" onClick={tagWords}>Replace these words with a field from your data, such as a name or an amount.</ActionRow>
          {s.range && (
            <>
              <ActionRow id="selIf" title="Show only when…" onClick={() => { startInlineIf(); focusSoon('#cbf-0') }}>Show these words only for employees who match a condition.</ActionRow>
              <ActionRow id="selSwitch" title="Text by value…" onClick={() => { startSwitchInline(); focusSoon('#swField') }}>Show different words depending on a field, such as rating.</ActionRow>
              <ActionRow id="selInsert" title="Insert a tag here…" onClick={() => { startInlineTag(); focusSoon('#inTag') }}>Add any tag before, after or instead of these words.</ActionRow>
            </>
          )}
        </div>
      </InspectorBody>
      <InspectorFoot><Button variant="ghost" onClick={close}>Cancel</Button></InspectorFoot>
    </>
  )
}

/** "Show these words only when …" inside a sentence. */
export function InlineIfForm() {
  useEngineRev()
  const bump = useBump()
  const [other, setOther] = useState<string>(es.inlineUi?.other || '')
  if (!es.cb) es.cb = cbNew(es.inlineUi?.cond || '')
  const cb = es.cb as Cb
  const facts = cbFacts(cb)
  const add = () => {
    const had = !!cbExpr(cb)
    const ok = applyInlineIf(other)
    if (!ok && !had) focusSoon('.cb-code textarea, #cbf-0')
  }
  return (
    <>
      <InspectorBody>
        <SelSummary title={<b className="font-semibold">Selected words</b>} quote={<>{where(es.sel.text)}</>}
          ctx="The words stay in the sentence for employees who match. The tool adds the if and end if around them." />
        <Part title="Show these words only when"><ConditionBuilder cb={cb} change={bump} facts={facts} /></Part>
        <Part title="Otherwise show (optional)" htmlFor="inOther">
          <Input id="inOther" value={other} placeholder="Leave empty to show nothing" onChange={(e) => setOther(e.target.value)} />
        </Part>
        <ConditionResult cb={cb} facts={facts} />
      </InspectorBody>
      <InspectorFoot>
        <Button variant="primary" icon={<Plus aria-hidden />} onClick={add}>Add condition</Button>
        <Button variant="ghost" onClick={backFromInline}>Back</Button>
      </InspectorFoot>
    </>
  )
}

/** "Insert a tag here…": any tag before, after or instead of the selected words. */
export function InlineTagForm() {
  useEngineRev()
  const [tag, setTag] = useState<string>(es.inlineUi?.tag || '')
  const [at, setAt] = useState('before')
  const input = useRef<HTMLInputElement>(null)
  const groups = useFieldGroups(false)
  const insert = () => { if (!applyInlineTag(tag, at)) focusSoon('#inTag') }
  return (
    <>
      <InspectorBody>
        <SelSummary title={<><b className="font-semibold">Insert a tag</b> at</>} quote={<>{where(es.sel.text)}</>} ctx="Any tag, such as {{ first_name }} or {% if x %}." />
        <Part title="Tag" htmlFor="inTag">
          <Input ref={input} id="inTag" mono value={tag} placeholder="{{ tag }}" spellCheck={false} onChange={(e) => setTag(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); insert() } }} />
        </Part>
        <Part title="Or pick a field" htmlFor="inField">
          <FieldPicker id="inField" value="" groups={groups} placeholder="Insert a field…"
            onChange={(v) => { const el = input.current; setTag(insertIntoText(tag, v, el?.selectionStart ?? undefined, el?.selectionEnd ?? undefined) as string); focusSoon('#inTag') }} />
        </Part>
        <Part title="Where it goes" htmlFor="inWhere">
          <Select id="inWhere" value={at} options={WHERE} onValueChange={setAt} />
        </Part>
      </InspectorBody>
      <InspectorFoot>
        <Button variant="primary" onClick={insert}>Insert</Button>
        <Button variant="ghost" onClick={backFromInline}>Back</Button>
      </InspectorFoot>
    </>
  )
}
