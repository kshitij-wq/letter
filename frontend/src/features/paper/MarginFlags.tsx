import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { Tooltip } from '@/ui'
import { cn } from '@/ui'
import type { MarginFlag } from './paperEvents'

type Slot = { left: number; top: number }

/**
 * Where each flag goes: level with its paragraph, in the paper's left margin; as many per row as fit (keeping a gap),
 * more stack downward. Positions are measured from the DOM and recomputed when the paper resizes or the fonts load.
 * Returns a map flag key -> {left, top} in paper coordinates.
 */
function useFlagSlots(paper: RefObject<HTMLElement | null>, flags: MarginFlag[], dep: unknown): { slots: Map<string, Slot>; size: number } {
  const [state, setState] = useState<{ slots: Map<string, Slot>; size: number }>({ slots: new Map(), size: 20 })
  const key = useRef('')
  const flagsRef = useRef(flags)
  flagsRef.current = flags
  const sig = flags.map((f) => f.key + '>' + f.pid).join('|')

  const measure = useCallback(() => {
    const el = paper.current
    const flags = flagsRef.current
    if (!el || !flags.length) { if (key.current) { key.current = ''; setState({ slots: new Map(), size: 20 }) } return }
    const paras = new Map<string, HTMLElement>()
    el.querySelectorAll<HTMLElement>('p[data-pid]').forEach((p) => { if (!paras.has(p.dataset.pid as string)) paras.set(p.dataset.pid as string, p) })
    const count = new Map<string, number>()
    for (const f of flags) if (paras.has(f.pid)) count.set(f.pid, (count.get(f.pid) || 0) + 1)
    const pr = el.getBoundingClientRect()
    const padL = parseFloat(getComputedStyle(el).paddingLeft) || 0
    const narrow = padL <= 28
    const size = narrow ? 16 : 20
    const pitch = size + 4
    const cap = Math.max(1, Math.floor((padL - 6 + 4) / pitch))
    const rects = new Map<string, DOMRect>()
    for (const [pid, p] of paras) if (count.has(pid)) rects.set(pid, p.getBoundingClientRect())
    const groups = [...count.keys()].filter((pid) => rects.has(pid)).sort((a, b) => (rects.get(a) as DOMRect).top - (rects.get(b) as DOMRect).top)
    const place = new Map<string, { top0: number; used: number }>()
    let free = -1e9
    for (const pid of groups) {
      const n = count.get(pid) as number
      const want = Math.round((rects.get(pid) as DOMRect).top - pr.top + (narrow ? 1 : 2))
      const top0 = Math.max(want, free)
      place.set(pid, { top0, used: Math.min(n, cap) })
      free = top0 + Math.ceil(n / cap) * (size + 3) + 1
    }
    const used = new Map<string, number>()
    const slots = new Map<string, Slot>()
    for (const f of flags) {
      const g = place.get(f.pid)
      if (!g) continue
      const k = used.get(f.pid) || 0
      used.set(f.pid, k + 1)
      slots.set(f.key, { left: Math.max(2, padL - 4 - (g.used * pitch - 4)) + (k % cap) * pitch, top: g.top0 + Math.floor(k / cap) * (size + 3) })
    }
    const layoutSig = size + '|' + [...slots].map(([k, v]) => `${k}:${v.left},${v.top}`).join(';')
    if (layoutSig !== key.current) { key.current = layoutSig; setState({ slots, size }) }
  }, [paper])

  useLayoutEffect(() => { measure() }, [measure, dep, sig])
  useEffect(() => {
    const el = paper.current
    if (!el) return
    const ro = new ResizeObserver(() => measure())
    ro.observe(el)
    const onFonts = () => measure()
    document.fonts?.ready.then(onFonts)
    document.fonts?.addEventListener?.('loadingdone', onFonts)
    window.addEventListener('resize', onFonts)
    return () => { ro.disconnect(); document.fonts?.removeEventListener?.('loadingdone', onFonts); window.removeEventListener('resize', onFonts) }
  }, [paper, measure])
  return state
}

/**
 * The margin-flag layer: lettered pennants in the paper's margin. Give it the paper element and the flags
 * (see setFlagProvider in paperEvents.ts); it measures where they go and draws them. `onSelect` runs on click.
 * Hover or focus outlines the paragraph in the flag colour.
 */
export function MarginFlags({ paper, flags, dep, onSelect }: { paper: RefObject<HTMLElement | null>; flags: MarginFlag[]; dep?: unknown; onSelect: (f: MarginFlag, el: HTMLElement) => void }) {
  const { slots, size } = useFlagSlots(paper, flags, dep)
  const [hover, setHover] = useState<string | null>(null)
  const hot = hover ? flags.find((f) => f.key === hover) : null
  let outline: { left: number; top: number; width: number; height: number } | null = null
  if (hot && paper.current) {
    const p = [...paper.current.querySelectorAll<HTMLElement>('p[data-pid]')].find((q) => q.dataset.pid === hot.pid)
    if (p) { const r = p.getBoundingClientRect(); const pr = paper.current.getBoundingClientRect(); outline = { left: r.left - pr.left - 2, top: r.top - pr.top - 2, width: r.width + 4, height: r.height + 4 } }
  }
  return (
    <div className="flag-layer" data-flag-size={size}>
      {outline && hot && <div className={cn('flag-outline show', hot.level === 'error' ? 'lvl-error' : 'lvl-warn')} style={outline} />}
      {flags.map((f) => {
        const s = slots.get(f.key)
        if (!s) return null
        return (
          <Tooltip key={f.key} content={f.label} side="top">
            <button type="button" aria-label={`Issue ${f.letter}: ${f.label}`} data-fk={f.key}
              className={cn('mflag', `lvl-${f.level}`, f.selected && 'on')} style={{ left: s.left, top: s.top }}
              onClick={(e) => { e.stopPropagation(); onSelect(f, e.currentTarget) }}
              onMouseEnter={() => setHover(f.key)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(f.key)} onBlur={() => setHover(null)}>
              <span className="fl" aria-hidden>{f.letter}</span>
            </button>
          </Tooltip>
        )
      })}
    </div>
  )
}
