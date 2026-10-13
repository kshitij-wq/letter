import { Check } from 'lucide-react'
import { useId, type ReactNode } from 'react'
import { Checkbox as C, Switch as Sw } from 'radix-ui'
import { cn } from './cn'

/** A checkbox with its label (click the label too). */
export function Checkbox({ checked, onCheckedChange, children, disabled, className }: { checked: boolean; onCheckedChange: (on: boolean) => void; children: ReactNode; disabled?: boolean; className?: string }) {
  const id = useId()
  return (
    <div className={cn('flex items-start gap-2', className)}>
      <C.Root id={id} checked={checked} disabled={disabled} onCheckedChange={(v) => onCheckedChange(v === true)}
        className="mt-px grid size-4 shrink-0 place-items-center rounded-[4px] border border-muted/70 bg-panel text-accent-ink transition-colors duration-150 hover:border-blue data-[state=checked]:border-blue data-[state=checked]:bg-blue disabled:opacity-45">
        <C.Indicator><Check aria-hidden className="size-3 stroke-[2.5]" /></C.Indicator>
      </C.Root>
      <label htmlFor={id} className={cn('text-base leading-snug', disabled && 'opacity-55')}>{children}</label>
    </div>
  )
}

/** An on/off switch with its label. */
export function Switch({ checked, onCheckedChange, children, disabled, className }: { checked: boolean; onCheckedChange: (on: boolean) => void; children: ReactNode; disabled?: boolean; className?: string }) {
  const id = useId()
  return (
    <div className={cn('flex items-center justify-between gap-3', className)}>
      <label htmlFor={id} className={cn('text-base', disabled && 'opacity-55')}>{children}</label>
      <Sw.Root id={id} checked={checked} disabled={disabled} onCheckedChange={onCheckedChange}
        className="relative h-[18px] w-8 shrink-0 rounded-full bg-hairline transition-colors duration-150 data-[state=checked]:bg-accent disabled:opacity-45">
        <Sw.Thumb className="block size-3.5 translate-x-[2px] rounded-full bg-panel shadow-key transition-transform duration-150 data-[state=checked]:translate-x-[16px] data-[state=checked]:bg-accent-ink" />
      </Sw.Root>
    </div>
  )
}
