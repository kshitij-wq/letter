import { es } from '@/hooks/useEngine'

/**
 * Whether the letter has a selection (or a picking / editing mode) that the 'selection' inspector should show, and a
 * signature that changes whenever the selection does. null = nothing selected. The shell opens the inspector when the
 * signature changes (features/shell/useInspectorSync), so selecting something while a placeholder panel is open swaps it.
 */
export function selectionSignature(): string | null {
  const s = es.sel
  const on = (s.pids && s.pids.length) || s.text || es.closing || es.placing || es.switchUi || es.condEdit || es.inlineUi
  if (!on) return null
  const r = s.range
  return JSON.stringify([s.pids, s.text, r ? [r.pid, r.s, r.e] : null, es.closing, !!es.placing, !!es.switchUi, !!es.condEdit, !!es.inlineUi])
}

/** The inspector's title for what is going on (the old selToolsTitle). */
export function selectionTitle(): string {
  const s = es.sel
  if (es.placing || es.closing) return 'Pick a place'
  if (es.condEdit && !(s.text || s.pids.length)) return 'Change condition'
  if (es.switchUi) return 'Text by value'
  if (s.text) return es.inlineUi && s.range ? (es.inlineUi.kind === 'if' ? 'Condition' : 'Insert a tag') : 'Selected text'
  return 'Condition'
}
