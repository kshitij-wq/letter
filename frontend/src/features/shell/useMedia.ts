import { useSyncExternalStore } from 'react'

/** True while the media query matches (re-renders on change). */
function useMedia(query: string): boolean {
  const sub = (cb: () => void) => { const m = window.matchMedia(query); m.addEventListener('change', cb); return () => m.removeEventListener('change', cb) }
  return useSyncExternalStore(sub, () => window.matchMedia(query).matches, () => false)
}

/** At 980px and below the step panel is a drawer. */
export const useIsNarrow = () => useMedia('(max-width: 980px)')
/** At 1280px and below the inspector floats over the right edge. */
export const useIsCompact = () => useMedia('(max-width: 1280px)')

export const isNarrowNow = () => window.matchMedia('(max-width: 980px)').matches
