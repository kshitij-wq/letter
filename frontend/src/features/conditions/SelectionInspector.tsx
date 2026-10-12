import { es, useEngineRev } from '@/hooks/useEngine'
import { Button } from '@/ui'
import { InspectorBody, InspectorFoot } from '../shell/Inspector'
import type { InspectorPanelProps } from '../shell/registry'

/**
 * R1 placeholder for the selection panel (what you can do with the paragraphs or words selected in the letter).
 * It says what is selected, or which picking mode is on. R2 (conditions) replaces this file.
 */
export function SelectionInspector({ close }: InspectorPanelProps) {
  useEngineRev()
  const n = es.sel.pids.length
  const text = es.sel.text
  const mode = es.closing ? 'Click the paragraph where this condition should end.' : es.placing ? 'Click the paragraph where this tag goes.' : ''
  return (
    <>
      <InspectorBody>
        {mode && <p>{mode}</p>}
        {!mode && n > 0 && <p>{n} paragraph{n === 1 ? '' : 's'} selected. Shift-click another paragraph to extend the selection.</p>}
        {!mode && text && <blockquote className="font-serif text-lg leading-snug">“{text}”</blockquote>}
      </InspectorBody>
      <InspectorFoot><Button className="ml-auto" onClick={close}>{mode ? 'Cancel' : 'Clear selection'}</Button></InspectorFoot>
    </>
  )
}
