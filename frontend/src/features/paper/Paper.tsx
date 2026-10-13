import { useRef, type KeyboardEvent, type MouseEvent } from 'react'
import { es, useEngineRev } from '@/hooks/useEngine'
import { clickParagraph, closeBlockAt, paperHtml, placeUnplacedAt, selectWords } from '../../engine'
import './paper.css'
import { MarginFlags } from './MarginFlags'
import { firePaper, getFlags } from './paperEvents'
import { selRange } from './selRange'
import { useParagraphAccess } from '../conditions/paragraphAccess'

const closestIn = (target: EventTarget | null, selector: string): HTMLElement | null => (target instanceof Element ? target.closest<HTMLElement>(selector) : null)

/**
 * The letter. The engine draws it as an HTML string (paperHtml); this puts it on the page and turns clicks into engine
 * actions: words selected in one paragraph, a paragraph (shift extends to a range), "pick where it ends", "place this tag".
 * Clicks on placeholders, table-cell ghosts, condition lines and margin flags go to the handlers features register
 * (paperEvents.ts). The inspector follows the selection (features/shell/useInspectorSync).
 */
export function Paper() {
  useEngineRev()
  const sheet = useRef<HTMLElement>(null)
  const body = useRef<HTMLDivElement>(null)
  const view = es.view
  const html = paperHtml(view)
  const flags = view === 'source' ? getFlags() : []
  useParagraphAccess(body, html)   // body paragraphs get tabindex + keyboard (features/conditions)

  // Conditions: shift-click picks the paragraphs between two clicks. Without this the browser extends its own text selection
  // across the paragraphs on shift-click, and that selection would be read as "words" and ignored.
  const onMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    if (e.shiftKey && es.view === 'source' && es.tab === 'logic' && closestIn(e.target, 'p.lp.body')) e.preventDefault()
  }

  const onMouseUp = (e: MouseEvent<HTMLDivElement>) => {
    if (es.view !== 'source') return
    const sel = window.getSelection()
    const txt = sel ? sel.toString().replace(/\s+/g, ' ').trim() : ''
    if (sel && txt && txt.length <= 300 && !es.closing && !es.placing) {
      const para = (n: Node | null) => (n ? closestIn(n.nodeType === 1 ? (n as Element) : n.parentElement, 'p.lp') : null)
      const a = para(sel.anchorNode), b = para(sel.focusNode)
      if (a && a === b) { selectWords(txt, selRange(sel, a)); return }
    }
    if (txt) return
    const p = closestIn(e.target, 'p.lp.body')
    if (es.placing) { if (p) placeUnplacedAt(p.dataset.pid as string); return }
    if (es.closing) { if (p) closeBlockAt(p.dataset.pid as string); return }
    const ghost = closestIn(e.target, '.cell-ghost')
    if (ghost) { firePaper('cell', { t: ghost.dataset.t as string, ri: ghost.dataset.ri as string, ci: ghost.dataset.ci as string, el: ghost }); return }
    const ph = closestIn(e.target, '.ph')
    if (ph) {
      const pp = closestIn(ph, 'p.lp'), po = ph.querySelector<HTMLElement>('.tx')?.dataset.o
      firePaper('placeholder', { id: ph.dataset.row as string, el: ph, pid: pp?.dataset.pid, offset: po != null ? +po : undefined })
      return
    }
    const lg = closestIn(e.target, '[data-key]')
    if (lg) { firePaper('logic', { key: lg.dataset.key as string, el: lg }); return }
    // a tag the letter already had: outside Conditions a click opens it in the Tags list (it is not words to tag)
    const tg = es.tab !== 'logic' && es.view === 'source' ? closestIn(e.target, '.tg:not(.lg-chip)') : null
    const tp = tg ? closestIn(tg, 'p.lp') : null
    const to = tg?.querySelector<HTMLElement>('.tx')?.dataset.o
    if (tg && tp && to != null) { firePaper('tag', { pid: tp.dataset.pid as string, offset: +to, el: tg }); return }
    if (!p) return
    // outside the Conditions step a click picks the word under the pointer (to tag it); in Conditions it picks the paragraph
    if (es.tab !== 'logic' && !e.shiftKey && selectWordAt(e.clientX, e.clientY, p)) return
    clickParagraph(p.dataset.pid as string, e.shiftKey)
  }

  // select the whole word at a point and hand it to the engine, as if the user had dragged over it
  const selectWordAt = (x: number, y: number, p: HTMLElement) => {
    const r = document.caretRangeFromPoint?.(x, y)
    const node = r?.startContainer
    if (!r || !node || node.nodeType !== 3 || !p.contains(node)) return false
    const t = node.textContent || ''
    const isW = (c: string) => /[\p{L}\p{N}_'’&.-]/u.test(c)
    let s = r.startOffset, en = r.startOffset
    while (s > 0 && isW(t[s - 1])) s--
    while (en < t.length && isW(t[en])) en++
    while (en > s && /[.'’-]/.test(t[en - 1])) en--
    if (en <= s) return false
    const sel = window.getSelection(); if (!sel) return false
    const range = document.createRange(); range.setStart(node, s); range.setEnd(node, en)
    sel.removeAllRanges(); sel.addRange(range)
    const txt = sel.toString().trim(); if (!txt) return false
    selectWords(txt, selRange(sel, p))
    return true
  }

  // condition lines are buttons in the markup: Enter and Space open them
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    const ln = closestIn(e.target, '.lg-line')
    if (!ln) return
    e.preventDefault()
    firePaper('logic', { key: ln.dataset.key as string, el: ln })
  }

  return (
    <article id="paper" ref={sheet} tabIndex={-1} aria-label="Letter" className="paper" data-view={view} data-picking={es.closing || es.placing ? '' : undefined}>
      <div ref={body} className="paper-body" onMouseDown={onMouseDown} onMouseUp={onMouseUp} onKeyDown={onKeyDown} dangerouslySetInnerHTML={{ __html: html }} />
      {flags.length > 0 && (
        <MarginFlags paper={sheet} flags={flags} dep={html.length}
          onSelect={(f, el) => firePaper('flag', { index: f.index, el })} />
      )}
    </article>
  )
}
