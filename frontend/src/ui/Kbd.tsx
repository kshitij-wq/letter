import type { ReactNode } from 'react'
import { cn } from './cn'

/** A key cap for a shortcut ("Ctrl", "K"). */
export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return <kbd className={cn('inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[4px] border border-hairline bg-notesheet px-1 font-sans text-xs font-medium text-muted', className)}>{children}</kbd>
}

/** True on macOS and iOS, so shortcuts read ⌘ there and Ctrl elsewhere. */
const isMac = typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent)
export const modKey = isMac ? '⌘' : 'Ctrl'
