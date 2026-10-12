import { create } from 'zustand'

// UI-only state (what the engine does not need to know). R1/R2 add the step, view, selection and inspector here.
type Theme = 'system' | 'light' | 'dark'
type UiState = { theme: Theme; setTheme: (t: Theme) => void }

export const useUi = create<UiState>((set) => ({
  theme: 'system',
  setTheme: (theme) => set({ theme }),
}))
