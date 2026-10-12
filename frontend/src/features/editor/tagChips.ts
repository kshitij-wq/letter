/**
 * Tag chips over the editor: {{ }} yellow (custom_schema.* labelled "custom"), {% %} indigo, a tag with a problem red.
 * SuperDoc draws the letter itself as lines of text (not as ProseMirror nodes), so its decoration API has nothing to hang a
 * style on. The chips are a see-through layer laid over the painted lines: it reads where each tag's text is on screen
 * (DOM ranges) and draws a box there. It never touches the document, so what is saved is exactly what was typed.
 */
export type ChipKind = 'var' | 'custom' | 'block' | 'bad'
export type Chip = { tag: string; kind: ChipKind; title: string; rects: DOMRect[] }

const RX = /\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\}/g
const squash = (s: string) => s.replace(/\s+/g, ' ').trim()

export type ChipHooks = {
  /** What kind of chip this tag is, and the hover text. */
  classify: (tag: string) => { kind: ChipKind; title: string }
  /** A click on a chip (the caret is not selecting text). */
  onChip: (tag: string, el: HTMLElement, occurrence: number) => void
}

export function installTagChips(host: HTMLElement, hooks: ChipHooks): { refresh: () => void; chips: () => Chip[]; stop: () => void } {
  let layer: HTMLDivElement | null = null
  let all: Chip[] = []
  let raf = 0
  let stopped = false

  const viewport = () => host.querySelector<HTMLElement>('.presentation-editor__viewport')

  function ensureLayer(vp: HTMLElement) {
    if (layer && layer.parentElement === vp) return layer
    layer?.remove()
    layer = document.createElement('div')
    layer.className = 'tag-chips'
    layer.setAttribute('aria-hidden', 'true')
    layer.setAttribute('data-testid', 'tag-chips')
    vp.appendChild(layer)
    return layer
  }

  /** Text nodes of one paragraph's lines, with the offset where each starts in the joined text. */
  function textOf(lines: HTMLElement[]) {
    const nodes: { n: Text; at: number }[] = []
    let text = ''
    for (const line of lines) {
      const w = document.createTreeWalker(line, NodeFilter.SHOW_TEXT)
      for (let n = w.nextNode() as Text | null; n; n = w.nextNode() as Text | null) { nodes.push({ n, at: text.length }); text += n.data }
    }
    return { nodes, text }
  }

  function locate(nodes: { n: Text; at: number }[], off: number, end: boolean) {
    for (let i = nodes.length - 1; i >= 0; i--) {
      const { n, at } = nodes[i]
      if (off > at || (off === at && !end)) { if (off - at <= n.data.length) return { n, o: off - at } }
    }
    return null
  }

  function compute() {
    raf = 0
    if (stopped) return
    const vp = viewport()
    if (!vp) return
    const L = ensureLayer(vp)
    const box = vp.getBoundingClientRect()
    const scale = vp.offsetWidth ? box.width / vp.offsetWidth : 1
    const groups = new Map<Element, HTMLElement[]>()
    for (const line of vp.querySelectorAll<HTMLElement>('.superdoc-line')) {
      const p = line.parentElement; if (!p) continue
      ;(groups.get(p) ?? groups.set(p, []).get(p)!).push(line)
    }
    const next: Chip[] = []
    const seen = new Map<string, number>()
    for (const lines of groups.values()) {
      const { nodes, text } = textOf(lines)
      if (!text.includes('{')) continue
      for (const m of text.matchAll(RX)) {
        const a = locate(nodes, m.index!, false), b = locate(nodes, m.index! + m[0].length, true)
        if (!a || !b) continue
        const r = document.createRange()
        try { r.setStart(a.n, a.o); r.setEnd(b.n, b.o) } catch { continue }
        const rects: DOMRect[] = []
        for (const q of r.getClientRects()) {
          if (q.width < 1) continue
          const last = rects[rects.length - 1]
          if (last && Math.abs(last.top - q.top) < 3 && Math.abs(last.bottom - q.bottom) < 3) rects[rects.length - 1] = new DOMRect(Math.min(last.left, q.left), Math.min(last.top, q.top), Math.max(last.right, q.right) - Math.min(last.left, q.left), Math.max(last.bottom, q.bottom) - Math.min(last.top, q.top))
          else rects.push(new DOMRect(q.left, q.top, q.width, q.height))
        }
        if (!rects.length) continue
        const tag = squash(m[0])
        const c = hooks.classify(tag)
        const occ = seen.get(tag) ?? 0; seen.set(tag, occ + 1)
        next.push({ tag, kind: c.kind, title: c.title, rects })
      }
    }
    all = next
    const frag = document.createDocumentFragment()
    for (const c of next) {
      c.rects.forEach((q, i) => {
        const d = document.createElement('div')
        d.className = `tag-chip tag-chip-${c.kind}`
        d.style.cssText = `left:${(q.left - box.left) / scale - 2}px;top:${(q.top - box.top) / scale}px;width:${q.width / scale + 4}px;height:${q.height / scale}px`
        d.dataset.tag = c.tag
        if (i === 0 && c.kind === 'custom') { const l = document.createElement('span'); l.className = 'tag-chip-label'; l.textContent = 'custom'; d.appendChild(l) }
        frag.appendChild(d)
      })
    }
    L.replaceChildren(frag)
  }

  const refresh = () => { if (!raf && !stopped) raf = requestAnimationFrame(compute) }
  const mo = new MutationObserver((list) => { if (list.some((m) => !(m.target as Node).parentElement?.closest('.tag-chips') && !(m.target as Element).classList?.contains('tag-chips'))) refresh() })
  mo.observe(host, { childList: true, subtree: true, characterData: true })
  const ro = new ResizeObserver(refresh); ro.observe(host)
  host.addEventListener('scroll', refresh, true)
  window.addEventListener('resize', refresh)

  const click = (e: MouseEvent) => {
    const sel = window.getSelection()
    const ed = (window as unknown as { __sd?: { activeEditor?: { state?: { selection?: { from: number; to: number } } } } }).__sd?.activeEditor?.state?.selection
    if ((sel && !sel.isCollapsed) || (ed && ed.from !== ed.to)) return
    const hit = all.find((c) => c.rects.some((q) => e.clientX >= q.left - 2 && e.clientX <= q.right + 2 && e.clientY >= q.top && e.clientY <= q.bottom))
    if (!hit) return
    const el = [...(layer?.querySelectorAll<HTMLElement>('.tag-chip') ?? [])].find((d) => d.dataset.tag === hit.tag) ?? host
    hooks.onChip(hit.tag, el, all.filter((c) => c.tag === hit.tag).indexOf(hit))
  }
  host.addEventListener('click', click)
  refresh()

  return {
    refresh,
    chips: () => all,
    stop: () => { stopped = true; cancelAnimationFrame(raf); mo.disconnect(); ro.disconnect(); host.removeEventListener('scroll', refresh, true); window.removeEventListener('resize', refresh); host.removeEventListener('click', click); layer?.remove(); layer = null },
  }
}
