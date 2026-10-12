import { Check } from 'lucide-react'
import type { ComponentProps, ReactNode } from 'react'
import { DropdownMenu as M } from 'radix-ui'
import { cn } from './cn'

/** A menu of actions or one-of-few choices. Arrow keys, type-ahead and Esc come with it. */
export const DropdownMenu = M.Root
export const DropdownMenuTrigger = M.Trigger
export const DropdownMenuRadioGroup = M.RadioGroup

export function DropdownMenuContent({ className, align = 'end', sideOffset = 6, ...p }: ComponentProps<typeof M.Content>) {
  return (
    <M.Portal>
      <M.Content align={align} sideOffset={sideOffset} collisionPadding={8}
        className={cn('anim-pop z-[70] min-w-44 rounded-panel border border-hairline bg-panel p-1 text-base shadow-pop', className)} {...p} />
    </M.Portal>
  )
}

const item = 'relative flex min-h-[30px] cursor-default select-none items-center gap-2 rounded-control px-2 py-1 outline-none data-[disabled]:opacity-45 data-[highlighted]:bg-hairline-soft'

export function DropdownMenuItem({ icon, shortcut, children, className, ...p }: ComponentProps<typeof M.Item> & { icon?: ReactNode; shortcut?: ReactNode }) {
  return (
    <M.Item className={cn(item, className)} {...p}>
      {icon && <span className="text-muted">{icon}</span>}
      <span className="flex-1">{children}</span>
      {shortcut && <span className="text-xs text-muted">{shortcut}</span>}
    </M.Item>
  )
}

export function DropdownMenuRadioItem({ icon, children, className, ...p }: ComponentProps<typeof M.RadioItem> & { icon?: ReactNode }) {
  return (
    <M.RadioItem className={cn(item, 'pr-7', className)} {...p}>
      {icon && <span className="text-muted">{icon}</span>}
      <span className="flex-1">{children}</span>
      <M.ItemIndicator className="absolute right-2 text-accent"><Check aria-hidden /></M.ItemIndicator>
    </M.RadioItem>
  )
}

export function DropdownMenuLabel({ className, ...p }: ComponentProps<typeof M.Label>) {
  return <M.Label className={cn('px-2 py-1 text-xs font-semibold text-muted', className)} {...p} />
}
export function DropdownMenuSeparator({ className, ...p }: ComponentProps<typeof M.Separator>) {
  return <M.Separator className={cn('-mx-1 my-1 h-px bg-hairline-soft', className)} {...p} />
}
