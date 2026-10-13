import { Check, ChevronDown } from 'lucide-react'
import { Select as S } from 'radix-ui'
import { cn } from './cn'

export type SelectOption = { value: string; label: string; hint?: string; disabled?: boolean }

/**
 * A dropdown of a few fixed choices (for long or searchable lists use FieldPicker).
 * Option values must not be the empty string (Radix reserves it): use a word such as "none".
 */
export function Select({ value, onValueChange, options, placeholder, 'aria-label': ariaLabel, id, disabled, className, size = 'md' }: {
  value: string; onValueChange: (v: string) => void; options: SelectOption[]; placeholder?: string; 'aria-label'?: string; id?: string; disabled?: boolean; className?: string; size?: 'sm' | 'md'
}) {
  return (
    <S.Root value={value} onValueChange={onValueChange} disabled={disabled}>
      <S.Trigger id={id} aria-label={ariaLabel}
        className={cn('inline-flex w-full min-w-0 items-center justify-between gap-2 rounded-control border border-hairline bg-panel px-3 text-left text-base text-ink transition-colors duration-150 hover:border-muted/50 focus-visible:border-accent focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-55 data-[placeholder]:text-muted', size === 'sm' ? 'h-8 text-sm' : 'h-10', className)}>
        <span className="min-w-0 truncate"><S.Value placeholder={placeholder} /></span>
        <S.Icon><ChevronDown aria-hidden className="text-muted" /></S.Icon>
      </S.Trigger>
      <S.Portal>
        <S.Content position="popper" sideOffset={4} collisionPadding={8}
          className="anim-pop z-[70] max-h-[min(320px,var(--radix-select-content-available-height))] min-w-[var(--radix-select-trigger-width)] max-w-[min(420px,calc(100vw-16px))] overflow-hidden rounded-panel border border-hairline bg-panel shadow-pop">
          <S.Viewport className="p-1">
            {options.map((o) => (
              <S.Item key={o.value} value={o.value} disabled={o.disabled}
                className="relative flex min-h-[30px] cursor-default select-none items-center gap-2 rounded-control py-1 pl-7 pr-2 text-base outline-none data-[disabled]:opacity-45 data-[highlighted]:bg-hairline-soft">
                <S.ItemIndicator className="absolute left-2 grid place-items-center text-accent"><Check aria-hidden /></S.ItemIndicator>
                <S.ItemText>{o.label}</S.ItemText>
                {o.hint && <span className="ml-auto pl-3 font-mono text-xs text-muted">{o.hint}</span>}
              </S.Item>
            ))}
          </S.Viewport>
        </S.Content>
      </S.Portal>
    </S.Root>
  )
}
