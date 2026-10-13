import { Ellipsis, GitBranch, Tag } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { es, useEngineRev } from '@/hooks/useEngine'
import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, IconButton } from '@/ui'
import { startInlineIf, startInlineTag, startSwitchInline } from '../../engine'
import { focusSoon } from '../conditions/hooks'
import { tagWords } from '../conditions/WordsForms'

type Pos = { left: number; top: number } | null

/**
 * A small toolbar next to the words selected in the letter, so the action is where the eye is: "Tag this text" (primary),
 * "Show only when…", and "More" for the rest. The inspector shows the same choices with explanations.
 * The browser selection is kept alive by cancelling mousedown on the bar.
 */
export function SelectionToolbar() {
  useEngineRev()
  const bar = useRef<HTMLDivElement>(null)
  const last = useRef<DOMRect | null>(null)
  const [pos, setPos] = useState<Pos>(null)
  const [tick, setTick] = useState(0)
  const s = es.sel
  const show = !!es.an && es.view === 'source' && !!s.text && !es.inlineUi && !es.switchUi && !es.condEdit && !es.placing && !es.closing

  useEffect(() => {
    if (!show) return
    const again = () => setTick((n) => n + 1)
    window.addEventListener('scroll', again, true); window.addEventListener('resize', again)
    return () => { window.removeEventListener('scroll', again, true); window.removeEventListener('resize', again) }
  }, [show])

  useLayoutEffect(() => {
    if (!show) { last.current = null; setPos(null); return }
    const sel = window.getSelection()
    const r = sel && sel.rangeCount && !sel.isCollapsed ? sel.getRangeAt(0).getBoundingClientRect() : last.current
    if (!r || (!r.width && !r.height)) { setPos(null); return }
    last.current = r
    const w = bar.current?.offsetWidth ?? 300, h = bar.current?.offsetHeight ?? 48
    if (r.bottom < 60 || r.top > window.innerHeight) { setPos(null); return }
    let top = r.top - h - 10
    if (top < 70) top = r.bottom + 10
    const left = Math.max(8 + w / 2, Math.min(window.innerWidth - 8 - w / 2, r.left + r.width / 2))
    setPos((p) => (p && Math.abs(p.left - left) < 1 && Math.abs(p.top - top) < 1 ? p : { left, top }))
  }, [show, s.text, tick])

  if (!show) return null
  return createPortal(
    <div ref={bar} role="toolbar" aria-label="Selected words" data-testid="sel-toolbar" onMouseDown={(e) => e.preventDefault()}
      style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999, transform: 'translateX(-50%)' }}
      className="enter-fade fixed z-[60] flex items-center gap-1 rounded-panel border border-hairline bg-panel p-1.5 shadow-pop">
      <Button variant="primary" icon={<Tag aria-hidden />} onClick={tagWords} data-testid="sel-tag">Tag this text</Button>
      {s.range && (
        <>
          <Button variant="ghost" icon={<GitBranch aria-hidden />} onClick={() => { startInlineIf(); focusSoon('#cbf-0') }} data-testid="sel-if">Show only when…</Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><IconButton label="More" side="bottom"><Ellipsis aria-hidden /></IconButton></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => { startSwitchInline(); focusSoon('#swField') }}>Text by value…</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => { startInlineTag(); focusSoon('#inTag') }}>Insert a tag here…</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      )}
    </div>,
    document.body,
  )
}
