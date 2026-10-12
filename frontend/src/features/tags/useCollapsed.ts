import { useState } from 'react'
import { lsGet, lsSet } from '../../engine'

/** A section that remembers whether it was folded (the same 'lt.collapsed' key the old page used). */
export function useCollapsed(id: string, defaultOpen: boolean): [boolean, (open: boolean) => void] {
  const [open, setOpen] = useState(() => { const c = lsGet('lt.collapsed', {}) as Record<string, boolean>; return id in c ? !c[id] : defaultOpen })
  return [open, (o: boolean) => { setOpen(o); const c = lsGet('lt.collapsed', {}) as Record<string, boolean>; c[id] = !o; lsSet('lt.collapsed', c) }]
}
