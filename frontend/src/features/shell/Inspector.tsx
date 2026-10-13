import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { useUi } from '@/store'
import { IconButton, cn } from '@/ui'
import { closeInspector } from './inspector'
import { getInspector } from './registry'
import { useIsCompact } from './useMedia'

/** The scrolling body of an inspector panel (16px padding, 16px gaps). */
export function InspectorBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto overscroll-contain px-6 py-5', className)}>{children}</div>
}
/** A sticky foot for an inspector panel: the primary action sits here. */
export function InspectorFoot({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex shrink-0 items-center gap-2 border-t border-hairline-soft bg-panel px-6 py-4', className)}>{children}</div>
}

/**
 * The right column. It exists only while something is selected (a placeholder, a condition, the letter selection, an issue):
 * one panel at a time, picked from the registry by `kind`. At 1280px and below it floats over the right edge.
 */
export function Inspector() {
  const cur = useUi((s) => s.inspector)
  const compact = useIsCompact()
  const def = cur ? getInspector(cur.kind) : undefined
  if (!cur || !def) return null
  const Panel = def.Panel
  const title = typeof def.title === 'function' ? def.title(cur.args) : def.title
  return (
    <aside id="inspector" aria-label={title} data-kind={cur.kind}
      className={cn('enter-right flex shrink-0 flex-col bg-panel', compact
        ? 'absolute inset-y-0 right-0 z-30 w-[min(420px,100%)] shadow-pop'
        : 'w-[420px] border-l border-hairline-soft')}>
      <div className="flex h-14 shrink-0 items-center gap-2 pl-6 pr-3">
        <h2 className="min-w-0 flex-1 truncate text-lg font-semibold">{title}</h2>
        <IconButton label="Close" shortcut="Esc" size="sm" onClick={closeInspector}><X aria-hidden /></IconButton>
      </div>
      <Panel args={cur.args} close={closeInspector} />
    </aside>
  )
}
