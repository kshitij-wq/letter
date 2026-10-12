import type { HTMLAttributes, Ref } from 'react'
import { cn } from './cn'

/** A scrolling region. Uses the browser's own scrollbar, themed thin from the palette (see styles.css); never chains scroll to the page. */
export function ScrollArea({ className, ref, ...rest }: HTMLAttributes<HTMLDivElement> & { ref?: Ref<HTMLDivElement> }) {
  return <div ref={ref} className={cn('min-h-0 overflow-y-auto overscroll-contain', className)} {...rest} />
}
