import { create } from 'zustand'
import { lsGet, lsSet } from './engine'

/*
 * UI-only state: what the engine does not need to know. The current STEP (`state.tab`) and VIEW (`state.view`) live in the
 * engine because the preview and the checks read them; read them with useEngineRev() and change them with setTab / setView.
 *
 * Inspector: one panel at a time. A feature registers a panel for a `kind` (features/shell/registry.ts), then opens it
 * with `useUi.getState().openInspector('tag', { id })`.
 */
export type Theme = 'system' | 'light' | 'dark'
type InspectorState = { kind: string; args: Record<string, unknown> } | null
type DocxState = 'idle' | 'busy' | 'done'
type LoadError = { id: number; message: string; scope?: string } | null

export const SIDE_MIN = 300
export const SIDE_MAX = 640

// The host page (claude.ai) may set data-theme itself: "System" then means "whatever the host says".
const HOST_THEME = typeof document !== 'undefined' ? document.documentElement.getAttribute('data-theme') : null
function applyTheme(m: Theme) {
  const el = document.documentElement
  if (m === 'light' || m === 'dark') el.setAttribute('data-theme', m)
  else if (HOST_THEME) el.setAttribute('data-theme', HOST_THEME)
  else el.removeAttribute('data-theme')
}
const savedTheme = lsGet('lt.theme', 'system') as Theme
const initialTheme: Theme = ['system', 'light', 'dark'].includes(savedTheme) ? savedTheme : 'system'
applyTheme(initialTheme)

const clampSide = (px: number) => Math.max(SIDE_MIN, Math.min(SIDE_MAX, Math.round(px)))

type UiState = {
  theme: Theme
  setTheme: (t: Theme) => void
  /** Wide screens: the step panel is folded away (remembered). */
  sideCollapsed: boolean
  setSideCollapsed: (c: boolean) => void
  sideW: number
  setSideW: (px: number, persist?: boolean) => void
  /** Narrow screens: the step panel is a drawer. */
  drawerOpen: boolean
  setDrawerOpen: (o: boolean) => void
  inspector: InspectorState
  openInspector: (kind: string, args?: Record<string, unknown>) => void
  /** Closes without running the panel's onClose (see registerInspector); use closeInspector() from features/shell/Inspector for the full close. */
  dismissInspector: () => void
  /** The Assistant column on the right (remembered). */
  assistantOpen: boolean
  setAssistantOpen: (o: boolean) => void
  paletteOpen: boolean
  setPaletteOpen: (o: boolean) => void
  /** The Download tagged .docx button: Building…, then a 2 second Downloaded. */
  docx: DocxState
  setDocx: (d: DocxState) => void
  /** The last file or data error the engine reported (the first-run screen and the Document step show it inline). */
  error: LoadError
  setError: (e: LoadError) => void
  /** Steps the person has opened with this letter: a step tick is only green for a step that was looked at. */
  visited: Record<string, true>
  setVisited: (v: Record<string, true>) => void
  /** "Values" in the preview bar asks the Export step to unfold and show its values. */
  valuesWanted: boolean
  setValuesWanted: (w: boolean) => void
}

export const useUi = create<UiState>((set) => ({
  theme: initialTheme,
  setTheme: (theme) => { lsSet('lt.theme', theme); applyTheme(theme); set({ theme }) },
  sideCollapsed: !!lsGet('lt.sideOff', false),
  setSideCollapsed: (sideCollapsed) => { lsSet('lt.sideOff', sideCollapsed); set({ sideCollapsed }) },
  sideW: clampSide(+lsGet('lt.sideW', 400) || 400),
  setSideW: (px, persist) => { const sideW = clampSide(px); if (persist) lsSet('lt.sideW', sideW); set({ sideW }) },
  drawerOpen: false,
  setDrawerOpen: (drawerOpen) => set({ drawerOpen }),
  inspector: null,
  openInspector: (kind, args = {}) => set({ inspector: { kind, args } }),
  dismissInspector: () => set({ inspector: null }),
  assistantOpen: !!lsGet('lt.assistant', false),
  setAssistantOpen: (assistantOpen) => { lsSet('lt.assistant', assistantOpen); set({ assistantOpen }) },
  paletteOpen: false,
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  docx: 'idle',
  setDocx: (docx) => set({ docx }),
  error: null,
  setError: (error) => set({ error }),
  visited: {},
  setVisited: (visited) => set({ visited }),
  valuesWanted: false,
  setValuesWanted: (valuesWanted) => set({ valuesWanted }),
}))
