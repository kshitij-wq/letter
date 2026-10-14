import { useEffect } from 'react'
import { es } from '@/hooks/useEngine'
import { useUi } from '@/store'
import { toast } from '@/ui'
import { on, redo, undo } from '../../engine'
import { showPid } from '../paper/navigate'
import { plainLine } from '../validate/plain'
import { closeInspector, openInspector } from './inspector'
import { isNarrowNow } from './useMedia'
import { revealSide } from './StepBar'

const inField = (t: EventTarget | null) => t instanceof HTMLElement && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)
const sideIsOpen = () => { const ui = useUi.getState(); return isNarrowNow() ? ui.drawerOpen : !ui.sideCollapsed }

/**
 * Wires the engine's one-off events and the page-wide keys to the interface. Renders nothing.
 *   toast -> a toast; error -> inline on the first-run page / Document step (and a toast when that is not on screen);
 *   show -> scroll the letter to a paragraph; reveal -> open the selection panel; tab -> open the step panel when asked;
 *   loaded -> forget the inspector and the drawer.
 * Keys: Ctrl/Cmd+K palette, Ctrl/Cmd+Z undo, Ctrl/Cmd+Shift+Z (or Y) redo, Esc closes the inspector, then the drawer.
 * A file dropped outside a drop zone must not make the browser open it and leave the page.
 */
export function EngineEvents() {
  useEffect(() => {
    const offs = [
      on('toast', (m: string) => toast(plainLine(String(m)))),
      on('error', (e: { message: string; scope?: string }) => {
        useUi.getState().setError({ id: Date.now(), message: e.message, scope: e.scope })
        if (es.an && !(es.tab === 'doc' && sideIsOpen())) toast.error(plainLine(e.message))
      }),
      on('show', (e: { pid: string }) => showPid(e.pid)),
      on('reveal', (e: { panel?: string }) => { if (e.panel === 'selTools') openInspector('selection') }),
      on('tab', (e: { tab: string; changed: boolean; open: boolean }) => {
        if (e.open && !sideIsOpen()) revealSide(isNarrowNow())
        const ui = useUi.getState()
        ui.setVisited({ ...ui.visited, [e.tab]: true })
        // leaving Tags & fields closes the placeholder panel, as before
        if (e.changed && e.tab !== 'tags' && ui.inspector?.kind === 'tag') ui.dismissInspector()
      }),
      on('loaded', () => { const ui = useUi.getState(); ui.setVisited({ [es.tab]: true }); ui.dismissInspector(); ui.setDrawerOpen(false); ui.setError(null) }),
    ]

    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      const k = (e.key || '').toLowerCase()
      if (mod && k === 'k') { e.preventDefault(); const ui = useUi.getState(); ui.setPaletteOpen(!ui.paletteOpen); return }
      if (mod && !inField(document.activeElement) && (k === 'z' || k === 'y')) {
        if (!es.an) return
        e.preventDefault()
        if (k === 'z' && !e.shiftKey) undo(); else redo()
      }
    }
    // capture phase: decide before anything else sees Esc, so an open menu, dialog or field list keeps its own Esc
    const onEsc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      if (document.querySelector('[role="dialog"],[role="menu"],[role="listbox"],[data-radix-popper-content-wrapper],[cmdk-root]')) return
      const t = e.target
      if (t instanceof HTMLInputElement && t.type === 'search' && t.value) return   // Esc clears the search first
      if (closeInspector()) return
      const ui = useUi.getState(); if (ui.drawerOpen) ui.setDrawerOpen(false)
    }
    const isFiles = (e: DragEvent) => !!e.dataTransfer && [...(e.dataTransfer.types || [])].includes('Files')
    const onDragOver = (e: DragEvent) => { if (isFiles(e)) e.preventDefault() }
    const onDrop = (e: DragEvent) => {
      if (!isFiles(e)) return
      e.preventDefault()
      if (e.target instanceof Element && e.target.closest('[data-dropzone]')) return
      toast('To open a file, use the Document step.')
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keydown', onEsc, true)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('drop', onDrop)
    return () => {
      offs.forEach((off) => off())
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keydown', onEsc, true)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('drop', onDrop)
    }
  }, [])
  return null
}
