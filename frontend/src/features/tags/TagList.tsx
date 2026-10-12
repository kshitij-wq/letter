import { useVirtualizer } from '@tanstack/react-virtual'
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useUi } from '@/store'
import { cn } from '@/ui'
import { ST_INFO } from '../../engine'
import { STATUS_ICON } from './TagInspector'
import { pickRow, registerListScroller } from './locate'

type Item = { id: string; find: string; status: string; field: { label: string; key: string; same: boolean } | null; custom: boolean; kindShown: string; kindTitle: string; count: number; inLetter: boolean }

const MARK_TONE = { tagged: 'text-ok', check: 'text-warn', need: 'text-err', off: 'text-muted' } as const
/** More rows than this and the list draws only the ones in view. */
export const VIRTUAL_FROM = 80
const ROW = 54

function Summary({ it }: { it: Item }) {
  if (it.status === 'off') return <span>Skipped, left as typed</span>
  const f = it.field
  if (!f) return <span className={it.custom ? '' : 'text-warn'}>{it.custom ? 'Custom tag' : 'Not mapped'}</span>
  return f.same
    ? <code className="truncate font-mono text-xs">{f.key}</code>
    : <><span className="truncate">{f.label}</span><code className="min-w-0 truncate font-mono text-xs opacity-80">{f.key}</code></>
}

function Row({ it, selected, tabbable, onFocus }: { it: Item; selected: boolean; tabbable: boolean; onFocus: () => void }) {
  const st = it.status as keyof typeof STATUS_ICON
  const Mark = STATUS_ICON[st]
  return (
    <button type="button" data-row-id={it.id} aria-current={selected || undefined} tabIndex={tabbable ? 0 : -1} onFocus={onFocus}
      onClick={(e) => pickRow(it.id, e.detail === 0)}
      className={cn('flex w-full items-start gap-2.5 rounded-control px-2 py-2 text-left transition-colors duration-150 hover:bg-hairline-soft focus-visible:-outline-offset-2', selected && 'bg-accent-wash hover:bg-accent-wash')}>
      <span title={ST_INFO[st].label} className={cn('mt-[3px] shrink-0', MARK_TONE[st])}><Mark aria-hidden /><span className="sr-only">{ST_INFO[st].label}. </span></span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-serif text-lg leading-snug">{it.find}</span>
        <span className="mt-px flex min-w-0 items-baseline gap-1.5 text-sm text-muted"><Summary it={it} /></span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-px pt-0.5 text-xs text-muted">
        <span title={it.kindTitle}>{it.kindShown}</span>
        {!it.inLetter ? <span>Not in letter</span> : it.count > 1 ? <span className="tnum" title={`${it.count} times in the letter`}>×{it.count}<span className="sr-only"> times in the letter</span></span> : null}
      </span>
    </button>
  )
}

/** The nearest ancestor that scrolls. */
function scrollParent(el: HTMLElement | null): HTMLElement | null {
  for (let p = el?.parentElement; p; p = p.parentElement) { const o = getComputedStyle(p).overflowY; if (o === 'auto' || o === 'scroll') return p }
  return null
}

/**
 * One compact line per placeholder: status mark, the text from the letter, its field, kind and how many times it appears.
 * Arrow keys move between rows (Home and End jump); Enter opens one. A long list draws only the rows in view.
 */
export function TagList({ items }: { items: Item[] }) {
  const sel = useUi((s) => (s.inspector?.kind === 'tag' ? String(s.inspector.args.id) : null))
  const [focusId, setFocusId] = useState<string | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const virtual = items.length > VIRTUAL_FROM
  const v = useVirtualizer({ count: virtual ? items.length : 0, getScrollElement: () => box.current, estimateSize: () => ROW, overscan: 8, getItemKey: (i) => items[i].id })

  const idx = (id: string) => items.findIndex((x) => x.id === id)
  const focusRow = useCallback((i: number) => {
    const id = items[i]?.id; if (!id) return
    setFocusId(id)
    if (virtual) v.scrollToIndex(i, { align: 'auto' })
    requestAnimationFrame(() => requestAnimationFrame(() => box.current?.querySelector<HTMLElement>(`[data-row-id="${CSS.escape(id)}"]`)?.focus()))
  }, [items, virtual, v])

  // the letter, the review buttons or the palette picked a row: bring it into view
  useEffect(() => {
    registerListScroller((id) => {
      const i = idx(id); if (i < 0) return
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
    focusRow(e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : Math.max(0, Math.min(items.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1))))
  }

  // one row is in the tab order: the one that has focus, else the open one, else the first
  const tabId = focusId && idx(focusId) >= 0 ? focusId : sel && idx(sel) >= 0 ? sel : items[0]?.id

  if (!virtual) {
    return (
      <div ref={box} role="list" aria-label="Placeholders" className="-mx-2 flex flex-col" onKeyDown={onKey}>
        {items.map((it, i) => <div role="listitem" key={it.id}><Row it={it} selected={sel === it.id} tabbable={tabId === it.id} onFocus={() => setFocusId(it.id)} /></div>)}
      </div>
    )
  }
  return (
    <div ref={box} role="list" aria-label="Placeholders" onKeyDown={onKey} className="-mx-2 max-h-[min(560px,62dvh)] min-h-0 overflow-y-auto overscroll-contain">
      <div style={{ height: v.getTotalSize(), position: 'relative', width: '100%' }}>
        {v.getVirtualItems().map((row) => {
          const it = items[row.index]
          return (
            <div key={row.key} role="listitem" ref={v.measureElement} data-index={row.index} style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${row.start}px)` }}>
              <Row it={it} selected={sel === it.id} tabbable={tabId === it.id} onFocus={() => setFocusId(it.id)} />
            </div>
          )
        })}
      </div>
    </div>
  )
}
