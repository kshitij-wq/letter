import { paperEl } from '../paper/navigate'
import { useUi } from '@/store'
import { getInspector } from './registry'

/** Open the inspector on a registered panel: `openInspector('tag', { id })`. One panel at a time; it replaces the one open. */
export const openInspector = (kind: string, args: Record<string, unknown> = {}) => useUi.getState().openInspector(kind, args)

/**
 * Close the inspector the way the person would (the X or Esc): the panel's onClose runs first (forget the selection,
 * cancel picking ...), then it hides and focus returns to the letter. Returns false when nothing was open.
 */
export function closeInspector(): boolean {
  const { inspector, dismissInspector } = useUi.getState()
  if (!inspector) return false
  const hadFocus = !!document.activeElement && !!document.getElementById('inspector')?.contains(document.activeElement)
  getInspector(inspector.kind)?.onClose?.(inspector.args)
  dismissInspector()
  if (hadFocus) paperEl()?.focus({ preventScroll: true })
  return true
}
