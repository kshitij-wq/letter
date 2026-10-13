import { useSyncExternalStore } from 'react'
import { es } from '@/hooks/useEngine'
import { useUi } from '@/store'
import { backFromInline, cancelCondEdit, cancelSwitch, clearFilters, clearSelection, listRows, placeAt, rowPlaces } from '../../engine'
import { locatePlaceholder } from '../paper/navigate'
import { isNarrowNow } from '../shell/useMedia'

/*
 * Showing one placeholder: it opens in the inspector and the letter scrolls to it. These are the shared moves of the list,
 * the letter, the review buttons and the command palette.
 */

/* ---- where the letter was last scrolled to: "Showing 2 of 3" ---- */
export type Place = { pid: string; s: number }
type Pos = { id: string; index: number; count: number; place: Place | null } | null
let pos: Pos = null
const subs = new Set<() => void>()
const setPos = (p: Pos) => { pos = p; subs.forEach((f) => f()) }
export const usePos = (id: string): Pos => useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f) } }, () => (pos && pos.id === id ? pos : null), () => null)

/** The spot of a placeholder that a `.ph` element in the letter shows. */
export function placeOfSpan(id: string, sp: HTMLElement | undefined): Place | null {
  const p = sp?.closest<HTMLElement>('p.lp'), o = sp?.querySelector<HTMLElement>('.tx')?.dataset.o
  if (!p || o == null) return null
  const pl = placeAt(id, p.dataset.pid as string, +o)
  return pl ? { pid: pl.pid, s: pl.s } : null
}
/** The person clicked this spot in the letter: it is the one being looked at ("Showing 2 of 2"). */
export function markPlace(id: string, place: Place) {
  const all = rowPlaces(id) as Place[]
  setPos({ id, index: Math.max(0, all.findIndex((x) => x.pid === place.pid && x.s === place.s)), count: all.length, place })
}

/** Scroll the letter to the placeholder; asking again for the same one (advance) moves on to its next place. */
export function locateRow(id: string, advance = false) {
  const wasSource = es.view === 'source'
  const r = locatePlaceholder(id, advance)
  const spans = () => [...document.querySelectorAll<HTMLElement>('#paper .ph')].filter((x) => x.dataset.row === id)
  if (r) setPos({ id, index: r.index, count: r.count, place: placeOfSpan(id, spans()[r.index]) })
  else if (!wasSource) setTimeout(() => setPos({ id, index: 0, count: spans().length, place: placeOfSpan(id, spans()[0]) }), 150)
  else setPos(null)
}

/* ---- the list scrolls to a row when something else picked it ---- */
let scroller: ((id: string) => void) | null = null
export const registerListScroller = (fn: ((id: string) => void) | null) => { scroller = fn }

/** Words, a paragraph or a condition being edited give way to the placeholder panel (the old page cleared them). */
function endSelection() {
  const s = es.sel
  if (!(s.pids.length || s.text || es.switchUi || es.inlineUi || es.condEdit)) return
  cancelSwitch(); cancelCondEdit(); backFromInline(); clearSelection()
}

/** The list is showing this placeholder (the filters and the search leave it in). */
export const isListed = (id: string) => listRows().some((r: any) => r.id === id)

/**
 * Open a placeholder in the inspector. If the filters hide it they are cleared; the list scrolls to it. `focus` puts the cursor
 * in the field picker (opened from the keyboard, or a new one with no field yet). Does nothing while the inspector is busy
 * asking where a tag goes. Returns whether it opened.
 */
export function showRow(id: string, opts: { focus?: boolean; place?: Place } = {}): boolean {
  if (!(es.rows as any[]).some((r) => r.id === id)) return false
  if (es.placing || es.closing) return false
  if (!isListed(id)) clearFilters()
  endSelection()
  useUi.getState().openInspector('tag', { id, focus: !!opts.focus, ...(opts.place ? { place: opts.place } : {}) })
  if (isNarrowNow()) useUi.getState().setDrawerOpen(false)
  requestAnimationFrame(() => scroller?.(id))
  return true
}

/** A click or Enter on a list row: open it and show it in the letter (a second click moves to its next place). */
export function pickRow(id: string, byKeyboard: boolean) {
  const cur = useUi.getState().inspector
  const was = cur?.kind === 'tag' && cur.args.id === id
  if (showRow(id, { focus: byKeyboard })) locateRow(id, was)
}
