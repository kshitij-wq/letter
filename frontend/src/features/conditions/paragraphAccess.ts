import { useEffect, useLayoutEffect, type RefObject } from 'react'
import { es } from '@/hooks/useEngine'
import { clickParagraph, closeBlockAt, placeUnplacedAt } from '../../engine'

/*
 * Paragraphs of the letter reachable with the keyboard, without changing the engine's HTML: after each draw the body
 * paragraphs get tabindex (one stop in the Tab order, arrows move between paragraphs). Enter / Space does what a click does
 * (Shift extends the selection to a range); Shift+Arrow moves and extends. The letter is redrawn when the selection changes,
 * so focus is put back on the same paragraph afterwards.
 */
const SEL = 'p.lp.body'
let current: string | null = null           // the paragraph that holds the Tab stop
let refocus: { pid: string; at: number } | null = null

const paras = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>(SEL)]
const find = (root: HTMLElement, pid: string) => paras(root).find((p) => p.dataset.pid === pid) || null

function rove(root: HTMLElement) {
  const all = paras(root)
  const keep = all.find((p) => p.dataset.pid === current) || all[0]
  for (const p of all) p.tabIndex = p === keep ? 0 : -1
}

/** What a click on a paragraph does, in the mode the letter is in (picking where a block ends, placing a tag, selecting). */
function activateParagraph(pid: string, shift: boolean) {
  if (es.placing) placeUnplacedAt(pid)
  else if (es.closing) closeBlockAt(pid)
  else clickParagraph(pid, shift)
}

function onKeyDown(root: HTMLElement, e: KeyboardEvent) {
  if (es.view !== 'source') return
  const p = e.target instanceof HTMLElement && e.target.matches(SEL) ? e.target : null
  if (!p || e.ctrlKey || e.metaKey || e.altKey) return
  const pid = p.dataset.pid as string
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    refocus = { pid, at: Date.now() }
    activateParagraph(pid, e.shiftKey)
    return
  }
  const all = paras(root)
  const i = all.indexOf(p)
  const to = e.key === 'ArrowDown' ? i + 1 : e.key === 'ArrowUp' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? all.length - 1 : -2
  if (to === -2) return
  e.preventDefault()
  const next = all[Math.max(0, Math.min(all.length - 1, to))]
  if (!next || next === p) return
  if (e.shiftKey && !es.placing && !es.closing) {
    if (!es.sel.anchor) clickParagraph(pid, false)
    refocus = { pid: next.dataset.pid as string, at: Date.now() }
    clickParagraph(next.dataset.pid as string, true)
  }
  current = next.dataset.pid as string
  rove(root)
  next.focus({ preventScroll: true })
  next.scrollIntoView({ block: 'nearest' })
}

/** Call from the Paper with the element that holds the letter's HTML and that HTML (it changes when the letter is redrawn). */
export function useParagraphAccess(root: RefObject<HTMLElement | null>, html: string) {
  useLayoutEffect(() => {
    const el = root.current
    if (!el) return
    if (es.view !== 'source') return
    rove(el)
    if (refocus && Date.now() - refocus.at < 600) {
      const p = find(el, refocus.pid)
      if (p && !el.contains(document.activeElement)) { current = refocus.pid; rove(el); p.focus({ preventScroll: true }) }
    }
    refocus = null
  }, [root, html])
  useEffect(() => {
    const el = root.current
    if (!el) return
    const key = (e: KeyboardEvent) => onKeyDown(el, e)
    const focus = (e: FocusEvent) => { if (e.target instanceof HTMLElement && e.target.matches(SEL)) { current = e.target.dataset.pid || null; rove(el) } }
    el.addEventListener('keydown', key)
    el.addEventListener('focusin', focus)
    return () => { el.removeEventListener('keydown', key); el.removeEventListener('focusin', focus) }
  }, [root])
}
