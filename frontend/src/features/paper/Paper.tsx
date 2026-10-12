import { useRef, type KeyboardEvent, type MouseEvent } from 'react'
import { es, useEngineRev } from '@/hooks/useEngine'
import { clickParagraph, closeBlockAt, paperHtml, placeUnplacedAt, selectWords } from '../../engine'
import './paper.css'
import { MarginFlags } from './MarginFlags'
import { firePaper, getFlags } from './paperEvents'
import { selRange } from './selRange'

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
  const view = es.view
  const html = paperHtml(view)
  const flags = view === 'source' ? getFlags() : []

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
    if (ph) { firePaper('placeholder', { id: ph.dataset.row as string, el: ph }); return }
    const lg = closestIn(e.target, '[data-key]')
    if (lg) { firePaper('logic', { key: lg.dataset.key as string, el: lg }); return }
    if (p) clickParagraph(p.dataset.pid as string, e.shiftKey)
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
      <div className="paper-body" onMouseUp={onMouseUp} onKeyDown={onKeyDown} dangerouslySetInnerHTML={{ __html: html }} />
      {flags.length > 0 && (
        <MarginFlags paper={sheet} flags={flags} dep={html.length}
          onSelect={(f, el) => firePaper('flag', { index: f.index, el })} />
      )}
    </article>
  )
}
