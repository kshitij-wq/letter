import type { ReactNode } from 'react'
import { Toggle } from 'radix-ui'
import { cn } from './cn'

/** A filter chip you switch on and off (aria-pressed). `count` is a quiet number after the label. */
export function FilterChip({ pressed, onPressedChange, count, children, className }: { pressed: boolean; onPressedChange: (on: boolean) => void; count?: number | string; children: ReactNode; className?: string }) {
  return (
    <Toggle.Root pressed={pressed} onPressedChange={onPressedChange}
      className={cn('inline-flex h-7 items-center gap-1.5 rounded-control border border-hairline bg-panel px-2.5 text-sm font-medium text-ink transition-colors duration-150 hover:bg-hairline-soft data-[state=on]:border-accent data-[state=on]:bg-accent-wash data-[state=on]:text-accent', className)}>
      {children}
      {count !== undefined && count !== '' && <span className="tnum text-xs font-semibold opacity-70">{count}</span>}
    </Toggle.Root>
  )
}

/** A small read-only pill (a field name, a value). Mono for tags and keys. */
export function Chip({ children, mono, className }: { children: ReactNode; mono?: boolean; className?: string }) {
  return <span className={cn('inline-flex h-6 items-center rounded-control bg-hairline-soft px-2 text-sm text-ink', mono && 'font-mono text-xs', className)}>{children}</span>
}
