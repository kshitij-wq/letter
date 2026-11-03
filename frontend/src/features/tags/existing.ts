import { create } from 'zustand'
import { oldTagNames } from '../../engine'
import { inSource, scrollBehavior } from '../paper/navigate'

/*
 * The tags a letter already had ({{ first_name }} and the like), shown up front on Tags & fields. Shared state of the list:
 * which names are ticked (for "Add a prefix"), which name was opened from the letter, and where Locate last went.
 */
type Place = { pid: string; s: number; e: number; tag: string }

const useTags = create(() => ({
  picked: new Set<string>() as ReadonlySet<string>,
  /** The name opened from a click on a tag in the letter (its row is highlighted and scrolled into view; n counts the clicks). */
  open: null as { id: string; n: number } | null,
  /** Where Locate last went: "Showing 2 of 3". */
  pos: null as { id: string; index: number; count: number } | null,
}))

export const usePicked = () => useTags((s) => s.picked)
export const getPicked = () => useTags.getState().picked
export function setPicked(id: string, on: boolean) {
  const x = new Set(getPicked())
  if (on) x.add(id); else x.delete(id)
  useTags.setState({ picked: x })
}
export const useOpenTag = () => useTags((s) => s.open)
export const openTag = (id: string) => useTags.setState((s) => ({ open: { id, n: (s.open?.n ?? 0) + 1 } }))
export const useTagPos = (id: string) => useTags((s) => (s.pos && s.pos.id === id ? s.pos : null))

const LOC = { id: null as string | null, i: 0 }

/** The chip(s) of one tag in the letter: the `.tg` spans whose text starts inside [s, e) of the paragraph. */
function chipsOf(pid: string, s: number, e: number): HTMLElement[] {
  const p = [...document.querySelectorAll<HTMLElement>('#paper p.lp')].find((x) => x.dataset.pid === pid)
  if (!p) return []
  return [...p.querySelectorAll<HTMLElement>('.tg:not(.lg-chip)')].filter((c) => {
    const o = c.querySelector<HTMLElement>('.tx')?.dataset.o
    return o != null && +o >= s && +o < e
  })
}

/** Scroll the letter to the nth place of a tag name, and flash it. Asking again for the same name moves on to the next place. */
export function locateTag(id: string, advance = true): void {
  const info = oldTagNames()
  const places: Place[] = (info.names as any[]).find((n) => n.id === id)?.places ?? []
  if (!places.length) return
  const i = advance && LOC.id === id ? (LOC.i + 1) % places.length : 0
  LOC.id = id; LOC.i = i
  const go = () => {
    const pl = places[i]
    const chips = chipsOf(pl.pid, pl.s, pl.e)
    useTags.setState({ pos: { id, index: i, count: places.length } })
    if (!chips.length) return
    chips[0].scrollIntoView({ block: 'center', inline: 'nearest', behavior: scrollBehavior() })
    document.querySelectorAll('#paper .tg.flash').forEach((x) => x.classList.remove('flash'))
    chips.forEach((c) => c.classList.add('flash'))
    setTimeout(() => chips.forEach((c) => c.classList.remove('flash')), 1600)
  }
  inSource(go)
}

/** The tag name behind a click at `offset` in paragraph `pid` of the letter (null when it isn't in a tag). */
export function tagNameAt(pid: string, offset: number): string | null {
  for (const n of oldTagNames().names as any[]) if (n.places.some((p: Place) => p.pid === pid && offset >= p.s && offset < p.e)) return n.id
  return null
}
