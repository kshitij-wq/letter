import { ChevronDown } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Collapsible } from 'radix-ui'

/** A titled block that folds: title, an optional count and action, and a chevron. Spacing, not a box. */
export function Section({ title, count, summary, actions, defaultOpen = true, open: openProp, onOpenChange, children, className, id }: {
  title: ReactNode; count?: number | string; /** one quiet line under the title that stays visible when folded */ summary?: ReactNode; actions?: ReactNode; defaultOpen?: boolean; open?: boolean; onOpenChange?: (o: boolean) => void; children: ReactNode; className?: string; id?: string
}) {
  const [inner, setInner] = useState(defaultOpen)
  const open = openProp ?? inner
  return (
    <Collapsible.Root open={open} onOpenChange={(o) => { setInner(o); onOpenChange?.(o) }} className={className} id={id}>
      <div className="flex items-center gap-2">
        <Collapsible.Trigger className="group/trigger -ml-2 flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-control px-2 py-2 text-left transition-colors duration-150 hover:bg-hairline-soft">
          <ChevronDown aria-hidden className="shrink-0 text-muted transition-transform duration-150 group-data-[state=closed]/trigger:-rotate-90" />
          <span className="min-w-0 flex-1">
            <span className="flex items-baseline gap-2"><span className="truncate text-base font-semibold text-ink">{title}</span>
              {count !== undefined && count !== '' && <span className="tnum shrink-0 text-sm font-medium text-muted">{count}</span>}</span>
            {summary && <span className="mt-0.5 block text-sm font-normal text-muted">{summary}</span>}
          </span>
        </Collapsible.Trigger>
        {actions}
      </div>
      <Collapsible.Content className="pt-3">{children}</Collapsible.Content>
    </Collapsible.Root>
  )
}
