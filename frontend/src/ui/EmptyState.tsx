import type { ReactNode } from 'react'
import { cn } from './cn'

/** Says what is missing and what to do about it: an icon, a title, one line and (optionally) the action. */
export function EmptyState({ icon, title, children, action, className }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center gap-1.5 px-4 py-8 text-center', className)}>
      {icon && <div className="mb-1 text-muted [&_svg]:size-6 [&_svg]:stroke-[1.25]">{icon}</div>}
      <p className="text-base font-semibold text-ink">{title}</p>
      {children && <p className="max-w-[34ch] text-sm text-muted">{children}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
