import type { ReactNode } from 'react'
import { Tooltip as T } from 'radix-ui'

/** Mount once near the root: tooltips wait 150ms, and moving between controls skips the wait. */
export function TooltipProvider({ children }: { children: ReactNode }) {
  return <T.Provider delayDuration={150} skipDelayDuration={300}>{children}</T.Provider>
}

/** Short text on hover and keyboard focus. The trigger keeps its own accessible name; this is a hint. */
export function Tooltip({ content, children, side = 'bottom', align = 'center' }: { content: ReactNode; children: ReactNode; side?: 'top' | 'bottom' | 'left' | 'right'; align?: 'start' | 'center' | 'end' }) {
  if (!content) return <>{children}</>
  return (
    <T.Root>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content side={side} align={align} sideOffset={6} collisionPadding={8}
          className="anim-pop z-[80] max-w-64 rounded-control bg-ink px-2 py-1 text-sm font-medium text-panel shadow-pop">
          {content}
        </T.Content>
      </T.Portal>
    </T.Root>
  )
}
