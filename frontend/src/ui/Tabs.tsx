import type { ComponentProps } from 'react'
import { Tabs as T } from 'radix-ui'
import { cn } from './cn'

/** In-panel tabs (underline style). The step bar uses Radix Tabs directly; this is for tabs inside a panel. */
export const Tabs = T.Root
export function TabsList({ className, ...p }: ComponentProps<typeof T.List>) {
  return <T.List className={cn('flex gap-4 border-b border-hairline-soft', className)} {...p} />
}
export function TabsTrigger({ className, ...p }: ComponentProps<typeof T.Trigger>) {
  return <T.Trigger className={cn('-mb-px border-b-2 border-transparent pb-2 pt-1 text-base font-semibold text-muted transition-colors duration-150 hover:text-ink data-[state=active]:border-accent data-[state=active]:text-ink', className)} {...p} />
}
export const TabsContent = T.Content
