import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import App from './App'
import { initTeam, probeServer, setIconRenderer } from './engine'
import './features/register'
import { setFlagProvider, setPaperHandler } from './features/paper/paperEvents'
import { closeInspector, openInspector } from './features/shell/inspector'
import { useUi } from './store'

// Same start-up as the old page: the team library (claude.ai only) and the Letter Studio back-end probe
// (only when window.claude is absent), both behind the engine.
initTeam()
probeServer()

// The few icons the engine puts inside the letter's HTML (a margin line's problem marker): drawn inline, in the page's stroke.
const ICONS: Record<string, string> = {
  'alert-circle': '<circle cx="8" cy="8" r="6"/><path d="M8 5v3.5M8 10.75v.01"/>',
}
setIconRenderer((name: string, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 16 16" aria-hidden="true" focusable="false">${ICONS[name] ?? ''}</svg>`)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Test hook, next to the engine's window.__lt: the UI store and the extension points, for the browser tests and the screenshots.
;(window as unknown as { __ltUi: unknown }).__ltUi = { useUi, openInspector, closeInspector, setFlagProvider, setPaperHandler }
