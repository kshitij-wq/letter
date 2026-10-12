import { useSyncExternalStore } from 'react'

/*
 * "Values" in the preview bar means: go to Preview & export, unfold "Values in this preview" and scroll to it. The bar and
 * the step are far apart in the tree (and the step may not be mounted yet), so the request is a tiny shared flag.
 */
let wanted = false
const subs = new Set<() => void>()
const emit = () => subs.forEach((f) => f())

export function requestValues() { wanted = true; emit() }
/** Reads and clears the request. */
export function takeValuesRequest(): boolean { const w = wanted; if (w) { wanted = false; emit() } return w }
export function useValuesRequest(): boolean {
  return useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f) } }, () => wanted, () => false)
}
