import type { ComponentType, ReactNode } from 'react'

/*
 * Extension points. Each R2 feature folder has a register.ts (auto-loaded by features/register.ts) that calls these.
 * Registering the same id twice replaces the earlier one, so a feature always wins over the R1 placeholder it replaces.
 */

/* ---- step panels (the left column) ---- */
export type StepId = 'doc' | 'tags' | 'logic' | 'check' | 'export'
export type StepDef = {
  /** The panel body. It is rendered inside a padded, scrolling column; use <Section> and spacing, not cards. */
  Panel: ComponentType
  /** Optional one-line help under the step name in the panel head. */
  hint?: string
}
const steps = new Map<StepId, StepDef>()
export const registerStep = (id: StepId, def: StepDef) => { steps.set(id, def) }
export const getStep = (id: StepId) => steps.get(id)

/* ---- inspector panels (the right column, one at a time) ---- */
export type InspectorArgs = Record<string, any>
export type InspectorPanelProps = { args: InspectorArgs; close: () => void }
export type InspectorDef = {
  /** The title in the inspector head. */
  title: string | ((args: InspectorArgs) => string)
  /** The panel. Render <InspectorBody> (scrolls) and optionally <InspectorFoot> (sticky) from features/shell/Inspector. */
  Panel: ComponentType<InspectorPanelProps>
  /** Runs when the person closes the inspector (the X, Esc) before it hides: forget the selection, cancel picking, ... */
  onClose?: (args: InspectorArgs) => void
}
const inspectors = new Map<string, InspectorDef>()
export const registerInspector = (kind: string, def: InspectorDef) => { inspectors.set(kind, def) }
export const getInspector = (kind: string) => inspectors.get(kind)

/* ---- command palette (Ctrl/Cmd+K) ---- */
export type Command = {
  id: string
  label: string
  /** The group heading: 'Go to', 'View', 'Check', 'Download', 'Letter', 'Placeholders' ... */
  group: string
  hint?: string
  keywords?: string[]
  icon?: ReactNode
  shortcut?: string
  run: () => void
}
const providers: Array<() => Command[]> = []
/** `provider` runs each time the palette opens: return only the commands that are available right now. */
export const registerCommands = (provider: () => Command[]) => { providers.push(provider) }
export const collectCommands = (): Command[] => providers.flatMap((p) => { try { return p() } catch (e) { console.error(e); return [] } })

/* ---- canvas slots: small areas around the letter ---- */
export type CanvasSlots = {
  /** Under the view switch when the view is "Employee preview": who is being previewed (the old pvBar). */
  previewBar?: ComponentType
}
export const canvasSlots: CanvasSlots = {}
export const registerCanvasSlot = <K extends keyof CanvasSlots>(name: K, c: CanvasSlots[K]) => { canvasSlots[name] = c }
