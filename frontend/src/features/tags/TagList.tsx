import { useVirtualizer } from '@tanstack/react-virtual'
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useEngineRev } from '@/hooks/useEngine'
import { useUi } from '@/store'
import { cn } from '@/ui'
import { Button, FieldPicker, IconButton, type PickerGroup } from '@/ui'
import { X } from 'lucide-react'
import { ST_INFO, fieldPickerGroups, removeRow, restoreRow, setRowKey } from '../../engine'
import { STATUS_ICON } from './TagInspector'
import { locateRow, pickRow, registerListScroller, showRow } from './locate'

type Item = { id: string; find: string; here?: string; removed?: boolean; status: string; field: { label: string; key: string; same: boolean } | null; custom: boolean; kindShown: string; kindTitle: string; count: number; inLetter: boolean }
type Entry = { type: 'head'; key: string; label: string; n: number; first: boolean } | { type: 'row'; key: string; it: Item }

const MARK_TONE = { tagged: 'text-ok', check: 'text-warn', need: 'text-err', off: 'text-muted', removed: 'text-muted' } as const
/** More rows than this and the list draws only the ones in view. */
const VIRTUAL_FROM = 80
const ROW = 64
const GROUPS: [string, string][] = [['need', 'Needs a tag'], ['check', 'To check'], ['tagged', 'Tagged'], ['off', 'Skipped, left as typed'], ['gone', 'Not in the letter'], ['removed', 'Removed, plain text again']]

/** The list as headed groups: what needs a tag first, then what to check, then what is done. */
function groupItems(items: Item[]): Entry[] {
  const group = (it: Item) => (it.removed ? 'removed' : !it.inLetter ? 'gone' : it.status)
  const out: Entry[] = []
  for (const [g, label] of GROUPS) {
    const rows = items.filter((it) => group(it) === g)
    if (!rows.length) continue
    out.push({ type: 'head', key: `h:${g}`, label, n: rows.length, first: out.length === 0 })
    for (const it of rows) out.push({ type: 'row', key: it.id, it })
  }
  return out
}

function Summary({ it }: { it: Item }) {
  if (it.removed) return <span>Plain text in the letter</span>
  if (it.status === 'off') return <span>Skipped, left as typed</span>
  const f = it.field
  if (!f) return <span className={it.custom ? '' : 'text-warn'}>{it.custom ? 'Custom tag' : 'Not mapped yet'}</span>
  return f.same
    ? <code className="truncate font-mono text-sm">{f.key}</code>
    : <><span className="max-w-[55%] shrink-0 truncate">{f.label}</span><code className="min-w-0 truncate font-mono text-sm opacity-80">{f.key}</code></>
}

function Row({ it, selected, tabbable, onFocus, groups }: { it: Item; selected: boolean; tabbable: boolean; onFocus: () => void; groups: PickerGroup[] }) {
  const st = (it.removed ? 'off' : it.status) as keyof typeof STATUS_ICON
  const Mark = STATUS_ICON[st]
  const pickable = st === 'need' && it.inLetter && !it.removed
  return (
    <div className={cn('relative flex w-full items-center gap-1 rounded-control transition-colors duration-150 hover:bg-hairline-soft', selected && 'bg-accent-wash hover:bg-accent-wash')}>
      <button type="button" data-row-id={it.id} aria-current={selected || undefined} tabIndex={tabbable ? 0 : -1} onFocus={onFocus}
        onClick={(e) => { if (it.removed) restoreRow(it.id); else pickRow(it.id, e.detail === 0) }}
        className="flex min-h-[60px] min-w-0 flex-1 items-start gap-3 rounded-control px-3 py-2.5 text-left focus-visible:-outline-offset-2">
        <span title={ST_INFO[st].label} className={cn('mt-1 shrink-0', MARK_TONE[st])}><Mark aria-hidden /><span className="sr-only">{ST_INFO[st].label}. </span></span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-serif text-lg leading-snug">{it.here ? <>{it.find}<span className="font-sans text-sm text-muted"> — {it.here} · only here</span></> : it.find}</span>
          <span className="mt-0.5 flex min-w-0 items-baseline gap-1.5 text-sm text-muted"><Summary it={it} /></span>
        </span>
        {!pickable && (
          <span className="flex shrink-0 flex-col items-end gap-px pt-0.5 text-sm text-muted">
            <span title={it.kindTitle}>{it.kindShown}</span>
            {!it.inLetter ? <span>Not in letter</span> : it.count > 1 ? <span className="tnum" title={`${it.count} times in the letter`}>×{it.count}<span className="sr-only"> times in the letter</span></span> : null}
          </span>
        )}
      </button>
      {it.removed && <span className="shrink-0 pr-3"><Button size="sm" onClick={() => restoreRow(it.id)} aria-label={`Put ${it.find} back in the list`}>Put back</Button></span>}
      {!it.removed && it.inLetter && (
        <IconButton label={`Not a placeholder: ${it.find}`} size="sm" className={cn('shrink-0', !pickable && 'mr-2')} onClick={() => removeRow(it.id)} data-testid={`remove-${it.id}`}><X aria-hidden /></IconButton>
      )}
      {pickable && (
        <span className="shrink-0 pr-3">
          <FieldPicker variant="button" aria-label={`Pick a field for ${it.find}`} value="" groups={groups} allowCustom placeholder="Pick field" searchPlaceholder="Search fields or type a name"
            customLabel={(t) => `Use “${t}” as the field`} emptyText="No field matches. Keep typing to use your own name." onChange={(v) => { setRowKey(it.id, v); if (showRow(it.id)) locateRow(it.id, false) }} />
        </span>
      )}
    </div>
  )
}

function Head({ label, n, first }: { label: string; n: number; first: boolean }) {
  return <h3 className={cn('flex items-baseline gap-2 px-3 pb-1.5 text-sm font-semibold text-ink', first ? 'pt-1' : 'pt-6')}>{label}<span className="tnum font-medium text-muted">{n}</span></h3>
}

/** The nearest ancestor that scrolls. */
function scrollParent(el: HTMLElement | null): HTMLElement | null {
  for (let p = el?.parentElement; p; p = p.parentElement) { const o = getComputedStyle(p).overflowY; if (o === 'auto' || o === 'scroll') return p }
  return null
}

/**
 * The placeholders in headed groups (needs a tag, to check, tagged ...): status mark, the text from the letter, its field, kind and
 * how many times it appears, and a "Pick field" button on the ones with no tag. Arrow keys move between rows (Home and End jump);
 * Enter opens one. A long list draws only the rows in view.
 */
export function TagList({ items }: { items: Item[] }) {
  const rev = useEngineRev()
  const groups = useMemo(() => fieldPickerGroups(), [rev])
  const sel = useUi((s) => (s.inspector?.kind === 'tag' ? String(s.inspector.args.id) : null))
  const [focusId, setFocusId] = useState<string | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const entries = useMemo(() => groupItems(items), [items])
  const rows = useMemo(() => entries.flatMap((e) => (e.type === 'row' ? [e.it] : [])), [entries])
  const virtual = items.length > VIRTUAL_FROM
  const v = useVirtualizer({ count: virtual ? entries.length : 0, getScrollElement: () => box.current, estimateSize: (i) => (entries[i].type === 'head' ? 40 : ROW), overscan: 8, getItemKey: (i) => entries[i].key })

  const idx = (id: string) => rows.findIndex((x) => x.id === id)
  const entryIdx = (id: string) => entries.findIndex((e) => e.key === id)
  const focusRow = useCallback((i: number) => {
    const id = rows[i]?.id; if (!id) return
    setFocusId(id)
    if (virtual) v.scrollToIndex(entries.findIndex((e) => e.key === id), { align: 'auto' })
    requestAnimationFrame(() => requestAnimationFrame(() => box.current?.querySelector<HTMLElement>(`[data-row-id="${CSS.escape(id)}"]`)?.focus()))
  }, [rows, entries, virtual, v])

  // the letter, the review buttons or the palette picked a row: bring it into view
  useEffect(() => {
    registerListScroller((id) => {
      const i = entryIdx(id); if (i < 0) return
      if (virtual) v.scrollToIndex(i, { align: 'auto' })
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const el = box.current?.querySelector<HTMLElement>(`[data-row-id="${CSS.escape(id)}"]`); if (!el) return
        const sp = scrollParent(el)
        if (sp) {
          const a = el.getBoundingClientRect(), b = sp.getBoundingClientRect()
          if (a.top < b.top || a.bottom > b.bottom) el.scrollIntoView({ block: 'nearest', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
        }
        el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash')
      }))
    })
    return () => registerListScroller(null)
  })

  const onKey = (e: KeyboardEvent) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return
    const cur = (e.target as HTMLElement).closest<HTMLElement>('[data-row-id]'); if (!cur) return
    e.preventDefault()
    const i = idx(cur.dataset.rowId as string)
    focusRow(e.key === 'Home' ? 0 : e.key === 'End' ? rows.length - 1 : Math.max(0, Math.min(rows.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1))))
  }

  // one row is in the tab order: the one that has focus, else the open one, else the first
  const tabId = focusId && idx(focusId) >= 0 ? focusId : sel && idx(sel) >= 0 ? sel : rows[0]?.id
  const draw = (e: Entry) => (e.type === 'head'
    ? <Head label={e.label} n={e.n} first={e.first} />
    : <Row it={e.it} selected={sel === e.it.id} tabbable={tabId === e.it.id} onFocus={() => setFocusId(e.it.id)} groups={groups} />)

  if (!virtual) {
    return (
      <div ref={box} role="list" aria-label="Placeholders" className="-mx-3 flex flex-col" onKeyDown={onKey}>
        {entries.map((e) => <div role="listitem" key={e.key}>{draw(e)}</div>)}
      </div>
    )
  }
  return (
    <div ref={box} role="list" aria-label="Placeholders" onKeyDown={onKey} className="-mx-3 max-h-[min(640px,66dvh)] min-h-0 overflow-y-auto overscroll-contain">
      <div style={{ height: v.getTotalSize(), position: 'relative', width: '100%' }}>
        {v.getVirtualItems().map((row) => (
          <div key={row.key} role="listitem" ref={v.measureElement} data-index={row.index} style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${row.start}px)` }}>
            {draw(entries[row.index])}
          </div>
        ))}
      </div>
    </div>
  )
}
