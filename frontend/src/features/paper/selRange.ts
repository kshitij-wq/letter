import { es } from '@/hooks/useEngine'

/**
 * The words selected inside ONE paragraph of the letter, as offsets into that paragraph's text
 * ({pid, s, e, text}), or null when the selection is not clean (spans paragraphs, touches a chip, is empty).
 * Moved from the old page's selRange(); it reads the data-o offsets the engine puts on each text span.
 */
export function selRange(sel: Selection, pEl: HTMLElement) {
  if (!sel.rangeCount) return null
  const r = sel.getRangeAt(0)
  const pid = pEl.dataset.pid as string
  const info = es.an.byPid.get(pid)
  if (!info) return null
  const pos = (node: Node, off: number, isEnd: boolean): number | null => {
    if (node.nodeType === 3) {
      const tx = node.parentElement && node.parentElement.closest<HTMLElement>('[data-o]')
      if (!tx || !pEl.contains(tx)) return null
      return +(tx.dataset.o as string) + off
    }
    const kids = node.childNodes
    if (!isEnd) {
      for (let k = off; k < kids.length; k++) {
        const c = kids[k]
        const t = c.nodeType === 1 ? ((c as HTMLElement).matches('[data-o]') ? (c as HTMLElement) : (c as HTMLElement).querySelector<HTMLElement>('[data-o]')) : null
        if (t) return +(t.dataset.o as string)
      }
      return null
    }
    for (let k = off - 1; k >= 0; k--) {
      const c = kids[k]
      if (c.nodeType !== 1) continue
      const el = c as HTMLElement
      const all = [...(el.matches('[data-o]') ? [el] : []), ...el.querySelectorAll<HTMLElement>('[data-o]')]
      if (all.length) { const t = all[all.length - 1]; return +(t.dataset.o as string) + (t.textContent || '').length }
    }
    return null
  }
  let a = pos(r.startContainer, r.startOffset, false)
  let b = pos(r.endContainer, r.endOffset, true)
  if (a == null || b == null || b <= a) return null
  const t: string = info.model.text
  while (a < b && /\s/.test(t[a])) a++
  while (b > a && /\s/.test(t[b - 1])) b--
  if (b <= a) return null
  return { pid, s: a, e: b, text: t.slice(a, b) }
}
