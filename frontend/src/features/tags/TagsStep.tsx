import { es, useEngineRev } from '@/hooks/useEngine'
import { useUi } from '@/store'
import { Badge, EmptyState, VirtualList, cn } from '@/ui'
import { ST_INFO, finalTag, flashRow, rowStatus } from '../../engine'

const TONE = { tagged: 'ok', check: 'warn', need: 'err', off: 'neutral' } as const

/** R1 placeholder for Tags & fields: the placeholders found in the letter (virtualised), click one to open it. R2 replaces this file. */
export function TagsStep() {
  useEngineRev()
  const open = useUi((s) => s.inspector)
  const rows = (es.rows as any[]).filter((r) => r.count)
  if (!rows.length) return <EmptyState title="No placeholders found">Select words in the letter to turn them into placeholders.</EmptyState>
  return (
    <VirtualList label="Placeholders in the letter" items={rows} estimateSize={52} className="-mx-2 max-h-[calc(100dvh-230px)]" getKey={(r) => r.id}
      renderItem={(r) => {
        const st = rowStatus(r) as keyof typeof TONE
        const tag: string = finalTag(r)
        const selected = open?.kind === 'tag' && open.args.id === r.id
        return (
          <button type="button" onClick={() => flashRow(r.id)}
            className={cn('flex w-full items-center gap-3 rounded-control px-2 py-2 text-left transition-colors duration-150 hover:bg-hairline-soft', selected && 'bg-accent-wash hover:bg-accent-wash')}>
            <Badge tone={TONE[st]} className="w-[84px] justify-center">{ST_INFO[st]?.label}</Badge>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-serif text-lg">{r.find}</span>
              <span className="block truncate font-mono text-xs text-muted">{tag || 'No tag yet'}</span>
            </span>
            <span className="tnum text-sm text-muted">{r.count}×</span>
          </button>
        )
      }} />
  )
}
