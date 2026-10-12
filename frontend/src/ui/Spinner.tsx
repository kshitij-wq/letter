import { LoaderCircle } from 'lucide-react'
import { cn } from './cn'

/** A small spinning mark for a busy button or a short wait. Decorative: the busy control says so with aria-busy. */
export function Spinner({ className }: { className?: string }) {
  return <LoaderCircle aria-hidden className={cn('animate-spin', className)} style={{ animationDuration: '.8s' }} />
}
