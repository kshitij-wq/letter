import { useEffect, useMemo, useRef, useState } from 'react'
import { Badge, Button, SearchInput } from '@/ui'
import { previewValues, resetPreviewOverrides, setPreviewOverride, state } from '../../engine'

type Row = { id: string; value: string; source: 'changed' | 'data' | 'sample' | 'notset' | 'set' }
const SRC = { changed: ['Changed', 'info'], data: ['Data', 'ok'], sample: ['Sample', 'warn'], notset: ['Not set', 'err'], set: ['Set', 'neutral'] } as const

/**
 * One field's value. It keeps its own text while you type and hands it to the engine when you leave the box or press Enter
 * (Esc puts the old value back), so the box is never replaced under the cursor.
 */
function ValueRow({ row }: { row: Row }) {
  const [draft, setDraft] = useState<string | null>(null)
  const ref = useRef<HTMLInputElement>(null)
  const text = draft ?? row.value
  // once the engine has the new value (or a reset changed it), show the engine's value again, unless the person is still in the box
  useEffect(() => { if (draft !== null && document.activeElement !== ref.current) setDraft(null) }, [row.value, row.source]) // eslint-disable-line react-hooks/exhaustive-deps
  const commit = () => {
    if (draft === null) return
    if (draft !== row.value) setPreviewOverride(row.id, draft); else setDraft(null)
  }
  const [label, tone] = SRC[row.source]
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 @[420px]:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_4.5rem]">
      <code className="truncate font-mono text-xs text-muted" title={row.id}>{row.id}</code>
      <span className="@[420px]:order-3 @[420px]:text-right"><Badge tone={tone}>{label}</Badge></span>
      <input ref={ref} value={text} placeholder="not set" spellCheck={false} aria-label={`Value of ${row.id}`} data-id={row.id}
        onChange={(e) => setDraft(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit() } else if (e.key === 'Escape' && draft !== null) { e.stopPropagation(); setDraft(null) } }}
        className="col-span-2 h-10 w-full rounded-control border border-hairline bg-panel px-2.5 font-mono text-sm text-ink transition-colors duration-150 placeholder:text-muted hover:border-muted/50 focus-visible:border-accent focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-accent @[420px]:order-2 @[420px]:col-span-1" />
    </li>
  )
}

/** The values behind the employee preview: one line per field the template uses, where it comes from, and a box to change it. */
export function PreviewValues({ rev }: { rev: number }) {
  // the list is read again whenever the engine says something changed
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const rows = useMemo(() => previewValues().rows as Row[], [rev])
  const [q, setQ] = useState('')
  const changed = Object.keys(state.previewOverrides || {}).length
  const shown = q.trim() ? rows.filter((r) => r.id.toLowerCase().includes(q.trim().toLowerCase())) : rows
  if (!rows.length) return <p className="text-sm text-muted">There are no tags in the template yet.</p>
  return (
    <div className="@container grid gap-3">
      <p className="text-sm text-muted">Change a value to test a condition, such as setting a promotion field to yes. A changed value stays until you reset it.</p>
      {rows.length > 12 && <SearchInput value={q} onChange={setQ} placeholder="Find a field" />}
      <ul className="grid gap-3">{shown.map((r) => <ValueRow key={r.id} row={r} />)}</ul>
      {!shown.length && <p className="text-sm text-muted">No field matches “{q.trim()}”.</p>}
      {changed > 0 && <div><Button size="sm" onClick={resetPreviewOverrides}>Reset changed values</Button></div>}
    </div>
  )
}
