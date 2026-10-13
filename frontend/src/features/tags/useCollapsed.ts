import { useEffect, useState } from 'react'
import { lsGet, lsSet } from '../../engine'

const OPEN_EVENT = 'lt-open-section'
/** Unfold a section from outside (a click on a table cell in the letter needs its table on screen). */
export function openSection(id: string) { window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: id })) }

/** A section that remembers whether it was folded (the same 'lt.collapsed' key the old page used). */
export function useCollapsed(id: string, defaultOpen: boolean): [boolean, (open: boolean) => void] {
  const [open, setOpenState] = useState(() => { const c = lsGet('lt.collapsed', {}) as Record<string, boolean>; return id in c ? !c[id] : defaultOpen })
  const set = (o: boolean) => { setOpenState(o); const c = lsGet('lt.collapsed', {}) as Record<string, boolean>; c[id] = !o; lsSet('lt.collapsed', c) }
  useEffect(() => {
    const on = (e: Event) => { if ((e as CustomEvent).detail === id) setOpenState(true) }
    window.addEventListener(OPEN_EVENT, on)
    return () => window.removeEventListener(OPEN_EVENT, on)
  }, [id])
  return [open, set]
}
