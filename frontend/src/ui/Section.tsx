import { ChevronDown } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Collapsible } from 'radix-ui'
import { cn } from './cn'

/** A titled block that folds: title, an optional count and action, and a chevron. Spacing, not a box. */
export function Section({ title, count, actions, defaultOpen = true, open: openProp, onOpenChange, children, className }: {
  title: ReactNode; count?: number | string; actions?: ReactNode; defaultOpen?: boolean; open?: boolean; onOpenChange?: (o: boolean) => void; children: ReactNode; className?: string
}) {
  const [inner, setInner] = useState(defaultOpen)
  const open = openProp ?? inner
  return (
    <Collapsible.Root open={open} onOpenChange={(o) => { setInner(o); onOpenChange?.(o) }} className={className}>
      <div className="flex items-center gap-2">
        <Collapsible.Trigger className="group/trigger -ml-1 flex min-w-0 flex-1 items-center gap-1.5 rounded-control px-1 py-1 text-left text-base font-semibold text-ink transition-colors duration-150 hover:bg-hairline-soft">
          <ChevronDown aria-hidden className="text-muted transition-transform duration-150 group-data-[state=closed]/trigger:-rotate-90" />
          <span className="truncate">{title}</span>
          {count !== undefined && count !== '' && <span className="tnum text-sm font-medium text-muted">{count}</span>}
        </Collapsible.Trigger>
        {actions}
      </div>
      <Collapsible.Content className="pt-2">{children}</Collapsible.Content>
    </Collapsible.Root>
  )
}
