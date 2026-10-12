import type { HTMLAttributes } from 'react'
import { cn } from './cn'

/** A grey block that stands in for content while it loads (use instead of a spinner in the middle of a list). Size it with className. */
export function Skeleton({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden className={cn('animate-pulse rounded-control bg-hairline-soft', className)} {...rest} />
}
