import { useSyncExternalStore } from 'react'
import { getRev, state, subscribe } from '../engine'

/** Re-render whenever the engine says something changed (it calls notify(), batched per microtask). */
export function useEngineRev(): number {
  return useSyncExternalStore(subscribe, getRev, getRev)
}

/**
 * The engine's state, typed for the parts the UI reads. It is the live object (not a copy): call useEngineRev() in the
 * component so it re-renders, then read `es.<field>`. Fields not listed here are still reachable (it is open-ended).
 */
export type EngineState = {
  fileName: string
  isSample: boolean
  an: any
  rows: any[]
  tables: any[]
  lg: any[]
  logic: any[]
  issues?: any[]
  tab: 'doc' | 'tags' | 'logic' | 'check' | 'export'
  view: 'edit' | 'source' | 'tagged' | 'filled'
  filter: string
  q?: string
  sel: { pids: string[]; anchor: string | null; text: string; range?: any }
  closing: string | null
  placing: any
  switchUi: any
  inlineUi: any
  condEdit?: any
  pendingRestore: any
  lastAutosave: number | null
  autosaveFailed: boolean
  csv: any
  built: any
  batch: any
  pv: any
  [k: string]: any
}
export const es = state as unknown as EngineState
