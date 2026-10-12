import { Flag } from 'lucide-react'
import { useEffect } from 'react'
import { es, useEngineRev } from '@/hooks/useEngine'
import { Button, Notice } from '@/ui'
import { cancelPicking, pickingInfo, setView } from '../../engine'
import { InspectorBody, InspectorFoot } from '../shell/Inspector'
import type { InspectorPanelProps } from '../shell/registry'
import { CondEditForm } from './CondEditForm'
import { ParagraphForm } from './ParagraphForm'
import { Code } from './parts'
import { SwitchForm } from './SwitchForm'
import { InlineIfForm, InlineTagForm, WordsActions } from './WordsForms'
import { selectionSignature } from './selection'

/** "Click the paragraph where … should go / end": the letter shows a crosshair; on a phone this panel sits under it. */
function PickNotice() {
  const p = pickingInfo()
  useEffect(() => {
    const el = document.getElementById('inspector')
    el?.setAttribute('data-picking', '')
    return () => el?.removeAttribute('data-picking')
  }, [])
  if (!p) return null
  return (
    <>
      <InspectorBody>
        <Notice tone="warn" action={<Button size="sm" id={p.kind === 'place' ? 'placeCancel' : 'closeCancel'} onClick={cancelPicking}>Cancel</Button>}>
          {p.kind === 'place'
            ? <>Click the paragraph where <Code>{p.code}</Code> should go{p.note}.</>
            : <>Click the paragraph where <Code>{p.code}</Code> should end. The end {p.word} goes on a new line after it.</>}
        </Notice>
        <p className="flex items-center gap-2 text-sm text-muted"><Flag aria-hidden />Esc cancels.</p>
      </InspectorBody>
    </>
  )
}

/**
 * What you can do with what is selected in the letter (the shell opens this panel when something is selected):
 * paragraphs -> show them only when a condition holds; words -> tag them, show only when, text by value, insert a tag;
 * also "pick where it ends", "place this tag", changing a condition that is already there, and text by value.
 */
export function SelectionInspector({ close }: InspectorPanelProps) {
  useEngineRev()
  const pick = pickingInfo()
  const sig = selectionSignature() || ''
  if (es.view !== 'source' && !pick) {
    return (
      <InspectorBody>
        <Notice action={<Button size="sm" onClick={() => setView('source')}>Show the client letter</Button>}>Conditions are added in the client letter.</Notice>
      </InspectorBody>
    )
  }
  if (pick) return <PickNotice key="pick" />
  // a new selection ends the change of an existing condition
  if (es.condEdit && (es.sel.text || es.sel.pids.length)) es.condEdit = null
  if (es.condEdit) return <CondEditForm key={sig} />
  if (es.switchUi) return <SwitchForm key={sig} />
  if (es.sel.text) {
    if (es.inlineUi && es.sel.range) return es.inlineUi.kind === 'if' ? <InlineIfForm key={sig} /> : <InlineTagForm key={sig} />
    return <WordsActions key={sig} close={close} />
  }
  if (es.sel.pids.length) return <ParagraphForm key={sig} close={close} />
  return null
}
