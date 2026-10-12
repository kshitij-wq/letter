import { LocateFixed } from 'lucide-react'
import { es, useEngineRev } from '@/hooks/useEngine'
import { Badge, Button } from '@/ui'
import { ST_INFO, finalTag, rowStatus } from '../../engine'
import { locatePlaceholder } from '../paper/navigate'
import { InspectorBody, InspectorFoot } from '../shell/Inspector'
import type { InspectorPanelProps } from '../shell/registry'

const TONE = { tagged: 'ok', check: 'warn', need: 'err', off: 'neutral' } as const

/** R1 placeholder for the placeholder inspector: the quote, its tag and where it is. R2 replaces this file. */
export function TagInspector({ args, close }: InspectorPanelProps) {
  useEngineRev()
  const r = (es.rows as any[]).find((x) => x.id === args.id)
  if (!r) return <InspectorBody><p className="text-muted">This placeholder is no longer in the letter.</p></InspectorBody>
  const st = rowStatus(r) as keyof typeof TONE
  const tag: string = finalTag(r)
  return (
    <>
      <InspectorBody>
        <p className="text-xs font-semibold text-muted">Text in the letter</p>
        <p className="-mt-3 font-serif text-xl leading-snug">{r.find}</p>
        <div className="flex items-center gap-2"><Badge tone={TONE[st]}>{ST_INFO[st]?.label}</Badge><span className="tnum text-sm text-muted">Appears {r.count} time{r.count === 1 ? '' : 's'}</span></div>
        <p className="text-xs font-semibold text-muted">Tag</p>
        <code className="-mt-3 block break-words rounded-control bg-tag-bg px-2.5 py-2 font-mono text-sm text-tag">{tag || 'Needs a tag'}</code>
      </InspectorBody>
      <InspectorFoot>
        <Button icon={<LocateFixed aria-hidden />} onClick={() => locatePlaceholder(r.id, true)}>Find in the letter</Button>
        <Button variant="primary" className="ml-auto" onClick={close}>Done</Button>
      </InspectorFoot>
    </>
  )
}
