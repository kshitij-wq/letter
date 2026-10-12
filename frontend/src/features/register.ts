// Loads every feature's registration. Each feature folder owns a register.ts (or .tsx) that calls registerStep /
// registerInspector / registerCommands / setPaperHandler / setFlagProvider / registerCanvasSlot. Add a folder and its
// register.ts is picked up here: nothing to edit in this file.
import './shell/commands'
import.meta.glob('./*/register.{ts,tsx}', { eager: true })
