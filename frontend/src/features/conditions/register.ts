import { createElement } from 'react'
import { GitBranch, Layers } from 'lucide-react'
import { es } from '@/hooks/useEngine'
import {
  cancelCondEdit, cancelPicking, cancelSwitch, clearSelection, condEnglish, lgInfo, on, setTab, setView, startClosing, startCondEdit,
} from '../../engine'
import { setPaperHandler } from '../paper/paperEvents'
import { registerCommands, registerInspector, registerStep, type Command } from '../shell/registry'
import './conditions.css'
import { LogicStep } from './LogicStep'
import { SelectionInspector } from './SelectionInspector'
import { selectionTitle } from './selection'

registerStep('logic', { Panel: LogicStep, hint: 'Show a paragraph or a few words only to some employees.' })
// closing the panel ends whatever was in progress: the selection, "pick where it ends", "place this tag", a switch, a condition edit
registerInspector('selection', {
  title: () => selectionTitle(), Panel: SelectionInspector,
  onClose: () => { cancelPicking(); cancelSwitch(); cancelCondEdit(); clearSelection() },
})
// the words picked in the letter are cleared with the selection
on('clearSelection', () => { window.getSelection()?.removeAllRanges() })

/** Scroll the Conditions list to a tag and flash it (after the step has drawn). */
export function flashLogicItem(key: string) {
  const base = String(key).replace(/#\d+$/, '')
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const li = [...document.querySelectorAll<HTMLElement>('.lg-item')].find((x) => x.dataset.lgKey === key || x.dataset.lgKey === base)
    if (!li) return
    li.scrollIntoView({ block: 'nearest', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
    li.classList.remove('flash'); void li.offsetWidth; li.classList.add('flash')
    setTimeout(() => li.classList.remove('flash'), 1500)
  }))
}

// a click on a condition line in the letter: go to Conditions, flash the item and, for an if / else if, open it for changing
setPaperHandler('logic', ({ key }) => {
  setTab('logic', { open: true })
  const base = String(key).replace(/#\d+$/, '')
  const e = (es.lg as any[]).find((x) => x.key === key) || (es.lg as any[]).find((x) => x.key === base)
  if (e && (e.kw === 'if' || e.kw === 'elif')) startCondEdit(e.key)
  flashLogicItem(key)
})

registerCommands(() => {
  if (!es.an) return []
  const out: Command[] = []
  const lg = (es.lg || []) as any[]
  for (const e of lg.filter((x) => x.status === 'open')) {
    out.push({ id: `lg.close.${e.key}`, group: 'Conditions', label: `Choose where “${e.text.slice(0, 40)}” ends`, keywords: ['close', 'end if', 'open'], icon: createElement(GitBranch, { 'aria-hidden': true }), run: () => startClosing(e.key) })
  }
  for (const e of lg.filter((x) => (x.kw === 'if' || x.kw === 'elif') && x.src !== undefined).slice(0, 25)) {
    const en = condEnglish(e.expr) as string
    out.push({ id: `lg.edit.${e.key}`, group: 'Conditions', label: `Change condition: ${en || e.expr.slice(0, 50)}`, keywords: ['condition', 'if', 'edit', lgInfo(e).en || ''], icon: createElement(GitBranch, { 'aria-hidden': true }),
      run: () => { setTab('logic', { open: true }); startCondEdit(e.key); flashLogicItem(e.key) } })
  }
  out.push({ id: 'lg.merge', group: 'Conditions', label: 'Combine two versions of the letter…', keywords: ['merge', 'letter b', 'compare'], icon: createElement(Layers, { 'aria-hidden': true }),
    run: () => { setTab('logic', { open: true }); requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-dropzone][aria-label^="Letter B"]')?.scrollIntoView({ block: 'center' })) } })
  if (es.view !== 'source') out.push({ id: 'lg.letter', group: 'View', label: 'Show the client letter to add a condition', keywords: ['conditions'], run: () => setView('source') })
  return out
})
