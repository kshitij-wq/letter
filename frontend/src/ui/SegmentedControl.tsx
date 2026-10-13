import type { ReactNode } from 'react'
import { ToggleGroup } from 'radix-ui'
import { cn } from './cn'

export type Segment<T extends string> = { value: T; label: ReactNode; icon?: ReactNode; ariaLabel?: string }

/** A short either-or switch (the three views of the letter). Exactly one segment is always on; arrow keys move. */
export function SegmentedControl<T extends string>({ value, onValueChange, items, label, size = 'md', className }: { value: T; onValueChange: (v: T) => void; items: Segment<T>[]; label: string; size?: 'sm' | 'md'; className?: string }) {
  return (
    <ToggleGroup.Root type="single" value={value} onValueChange={(v) => { if (v) onValueChange(v as T) }} aria-label={label} loop
      className={cn('inline-flex rounded-control bg-hairline-soft p-0.5', className)}>
      {items.map((it) => (
        <ToggleGroup.Item key={it.value} value={it.value} aria-label={it.ariaLabel} data-testid={`seg-${it.value}`}
          className={cn('inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-[4px] font-medium text-muted transition-colors duration-150 hover:text-ink data-[state=on]:bg-panel data-[state=on]:text-ink data-[state=on]:shadow-key',
            size === 'sm' ? 'h-8 px-3 text-sm' : 'h-9 px-4 text-base max-[480px]:px-2.5 max-[480px]:text-sm')}>
          {it.icon}{it.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  )
}
