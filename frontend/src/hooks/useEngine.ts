import { useSyncExternalStore } from 'react'
import { getRev, subscribe } from '../engine'

/** Re-render whenever the engine says something changed (it calls notify(), batched per microtask). */
export function useEngineRev(): number {
  return useSyncExternalStore(subscribe, getRev, getRev)
}
