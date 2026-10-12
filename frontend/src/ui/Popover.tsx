import type { ComponentProps } from 'react'
import { Popover as P } from 'radix-ui'
import { cn } from './cn'

/** A floating panel anchored to its trigger (the legend key, a quick editor). Escapes any scrolling parent. */
export const Popover = P.Root
export const PopoverTrigger = P.Trigger
export const PopoverAnchor = P.Anchor
export function PopoverContent({ className, align = 'start', sideOffset = 6, ...p }: ComponentProps<typeof P.Content>) {
  return (
    <P.Portal>
      <P.Content align={align} sideOffset={sideOffset} collisionPadding={8}
        className={cn('anim-pop z-[70] w-72 max-w-[calc(100vw-16px)] rounded-panel border border-hairline bg-panel p-3 text-base shadow-pop', className)} {...p} />
    </P.Portal>
  )
}
