import { es } from '@/hooks/useEngine'
import { setView } from '../../engine'
import { useUi } from '@/store'

/** Smooth scrolling unless the person asked for less motion. */
export const scrollBehavior = (): ScrollBehavior => (window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth')

export const paperEl = () => document.getElementById('paper')
export const paperScroller = () => document.getElementById('paper-scroll')

// the DOM is redrawn by React after setView(); wait for it
const afterPaint = (fn: () => void) => requestAnimationFrame(() => requestAnimationFrame(fn))

/** Scroll the letter to a paragraph and flash it. On a phone the step drawer covers the letter, so it closes first. */
export function showPid(pid: string) {
  useUi.getState().setDrawerOpen(false)
  const go = () => {
    const el = [...document.querySelectorAll<HTMLElement>('#paper [data-pid]')].find((x) => x.dataset.pid === pid)
    if (!el) return
    el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: scrollBehavior() })
    el.classList.remove('flash-p'); void el.offsetWidth; el.classList.add('flash-p')
    setTimeout(() => el.classList.remove('flash-p'), 1600)
  }
  if (es.view !== 'source') { setView('source'); afterPaint(go) } else go()
}

const LOC = { id: null as string | null, i: 0 }
/**
 * Scroll the letter to a placeholder and flash it. Asking again for the same one (advance) moves on to its next place.
 * Returns where it went ({index, count}) or null when the placeholder is not in the letter.
 */
export function locatePlaceholder(id: string, advance = false, block: ScrollLogicalPosition = 'center'): { index: number; count: number } | null {
  const run = () => {
    const spans = [...document.querySelectorAll<HTMLElement>('#paper .ph')].filter((x) => x.dataset.row === id)
    const n = spans.length
    if (!n) return null
    const i = advance && LOC.id === id ? (LOC.i + 1) % n : 0
    LOC.id = id; LOC.i = i
    const sp = spans[i]
    sp.scrollIntoView({ block, inline: 'nearest', behavior: scrollBehavior() })
    document.querySelectorAll('#paper .ph').forEach((x) => x.classList.toggle('flash', x === sp))
    setTimeout(() => sp.classList.remove('flash'), 1600)
    return { index: i, count: n }
  }
  if (es.view !== 'source') { setView('source'); afterPaint(run); return null }
  return run()
}
