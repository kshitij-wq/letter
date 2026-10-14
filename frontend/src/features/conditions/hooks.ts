import { useCallback, useMemo, useReducer, useRef, useState } from 'react'
import { useEngineRev } from '@/hooks/useEngine'
import type { PickerGroup, PickerOption } from '@/ui'
import { comboOptions } from '../../engine'

/** A counter that redraws the component: the builder and the forms edit engine objects (state.cb, state.switchUi) in place. */
export function useBump(): () => void {
  const [, bump] = useReducer((n: number) => n + 1, 0)
  return bump
}

/**
 * Text that is typed into a field and written to an engine object at once. The field keeps its own copy so the cursor
 * stays where it is; when the engine changes the text itself (a chip, a preset, Claude), the field follows.
 */
export function useSyncedText(external: string): [string, (v: string) => void] {
  const [v, setV] = useState(external)
  const last = useRef(external)
  if (external !== last.current) {
    last.current = external
    if (external !== v) setV(external)
  }
  const set = useCallback((x: string) => { last.current = x; setV(x) }, [])
  return [v, set]
}

/** Focus an element after React has drawn (an id, or a selector). */
export function focusSoon(selector: string) {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const el = document.querySelector<HTMLElement>(selector)
    if (!el) return
    el.focus()
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) { try { el.setSelectionRange(el.value.length, el.value.length) } catch { /* not a text field */ } }
  }))
}

/** The choices for a field picker: CSV columns first, then the team library, then CompUp's tags (the old page's comboOptions). */
function buildFieldGroups(noFx?: boolean): PickerGroup[] {
  const seen = new Set<string>()
  const groups = new Map<string, PickerOption[]>()
  for (const o of comboOptions() as Array<{ v: string; l: string; g: string }>) {
    if (noFx && o.v.startsWith('fx:')) continue
    if (seen.has(o.v)) continue
    seen.add(o.v)
    const list = groups.get(o.g) || []
    list.push({ value: o.v, label: o.l || o.v, hint: o.l ? o.v : undefined })
    groups.set(o.g, list)
  }
  return [...groups.entries()].map(([heading, options]) => ({ heading, options }))
}
export function useFieldGroups(noFx?: boolean): PickerGroup[] {
  const rev = useEngineRev()
  return useMemo(() => buildFieldGroups(noFx), [rev, noFx])
}
