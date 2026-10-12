import { es } from '@/hooks/useEngine'
import { cancelCondEdit, cancelPicking, cancelSwitch, clearSelection, setTab, startCondEdit } from '../../engine'
import { setPaperHandler } from '../paper/paperEvents'
import { registerInspector, registerStep } from '../shell/registry'
import { LogicStep } from './LogicStep'
import { SelectionInspector } from './SelectionInspector'

registerStep('logic', { Panel: LogicStep, hint: 'Show a paragraph or a few words only to some employees.' })
// closing the panel ends whatever was in progress: the selection, "pick where it ends", "place this tag", a switch, a condition edit
registerInspector('selection', {
  title: 'Selection', Panel: SelectionInspector,
  onClose: () => { cancelPicking(); cancelSwitch(); cancelCondEdit(); clearSelection() },
})

// a click on a condition line in the letter: go to Conditions and, for an if / else if, open it for editing
setPaperHandler('logic', ({ key }) => {
  setTab('logic', { open: true })
  const base = String(key).replace(/#\d+$/, '')
  const e = (es.lg as any[]).find((x) => x.key === key) || (es.lg as any[]).find((x) => x.key === base)
  if (e && (e.kw === 'if' || e.kw === 'elif')) startCondEdit(e.key)
})
