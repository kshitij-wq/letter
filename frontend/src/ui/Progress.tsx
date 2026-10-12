import { Progress as P } from 'radix-ui'
import { cn } from './cn'

/** A thin determinate bar (for "testing 12 of 40"). */
export function Progress({ value, label, className }: { value: number; label: string; className?: string }) {
  const v = Math.max(0, Math.min(100, value))
  return (
    <P.Root value={v} aria-label={label} className={cn('h-1.5 w-full overflow-hidden rounded-full bg-hairline', className)}>
      <P.Indicator className="h-full rounded-full bg-accent transition-[width] duration-200" style={{ width: `${v}%` }} />
    </P.Root>
  )
}
