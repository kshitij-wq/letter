import { cva, type VariantProps } from 'class-variance-authority'
import type { HTMLAttributes } from 'react'
import { cn } from './cn'

const badge = cva('tnum inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-xs font-semibold leading-[1.5]', {
  variants: {
    tone: {
      neutral: 'bg-hairline-soft text-muted',
      ok: 'bg-ok-wash text-ok ring-1 ring-inset ring-ok-line',
      warn: 'bg-warn-wash text-warn ring-1 ring-inset ring-warn-line',
      err: 'bg-err-wash text-err ring-1 ring-inset ring-err-line',
      info: 'bg-info-wash text-info ring-1 ring-inset ring-info-line',
      cond: 'bg-cond-wash text-cond ring-1 ring-inset ring-cond-line',
    },
    shape: { badge: 'rounded-badge px-1.5', pill: 'min-w-[18px] justify-center rounded-full px-1.5' },
  },
  defaultVariants: { tone: 'neutral', shape: 'badge' },
})

/** A short status word or a count. Tone = the flag colour (ok tagged, warn to check, err error, info note, cond condition). */
export function Badge({ tone, shape, className, ...rest }: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badge>) {
  return <span className={cn(badge({ tone, shape }), className)} {...rest} />
}
