import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import App from './App'
import { initTeam, probeServer } from './engine'

// Same start-up as the old page: the team library (claude.ai only) and the Letter Studio back-end probe
// (only when window.claude is absent), both behind the engine.
initTeam()
probeServer()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
