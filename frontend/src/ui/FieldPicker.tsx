import { Check, ChevronDown } from 'lucide-react'
import { Command } from 'cmdk'
import { useId, useMemo, useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from './Popover'
import { cn } from './cn'

const ITEM = 'flex min-h-10 cursor-default items-center gap-2 rounded-control px-2.5 py-1.5 text-base data-[selected=true]:bg-hairline-soft'

export type PickerOption = { value: string; label: string; /** the mono code shown at the right, e.g. the tag key */ hint?: string; /** extra words the search also matches */ keywords?: string[] }
export type PickerGroup = { heading: string; options: PickerOption[] }

/**
 * A searchable list of fields grouped under headings (CompUp tags, columns from the data file).
 * Type to filter, Up/Down to move, Enter to pick, Esc to close. With `allowCustom`, typing something that is not in the
 * list offers “Use <text> as the field” so a custom column name can be entered (the search box and the empty text say so).
 */
export function FieldPicker({ value, onChange, groups, placeholder = 'Choose a field', allowCustom, searchPlaceholder = allowCustom ? 'Search fields or type a name' : 'Search fields', customLabel = (t) => `Use “${t}” as the field`, emptyText = allowCustom ? 'No field matches. Keep typing to use your own name.' : 'No field matches.', id, 'aria-label': ariaLabel, disabled, className, defaultOpen, onOpenChange, variant = 'field' }: {
  /** 'button': a small button ("Pick field") instead of the full-width field, for use inside a list row. */
  variant?: 'field' | 'button'
  value: string; onChange: (v: string) => void; groups: PickerGroup[]; placeholder?: string; searchPlaceholder?: string
  allowCustom?: boolean; customLabel?: (text: string) => string; emptyText?: string; id?: string; 'aria-label'?: string; disabled?: boolean; className?: string
  /** Start with the list open (a picker added on request). */
  defaultOpen?: boolean
  /** Told when the list opens or closes (to drop a picker that was opened and closed without a pick). */
  onOpenChange?: (open: boolean) => void
}) {
  const [open, setOpen] = useState(!!defaultOpen)
  const [query, setQuery] = useState('')
  const listId = useId()
  const all = useMemo(() => groups.flatMap((g) => g.options), [groups])
  const current = all.find((o) => o.value === value)
  const q = query.trim()
  const known = !!q && all.some((o) => o.value.toLowerCase() === q.toLowerCase() || o.label.toLowerCase() === q.toLowerCase())
  const pick = (v: string) => { onChange(v); setOpen(false); setQuery('') }

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQuery(''); onOpenChange?.(o) }}>
      <PopoverTrigger asChild>
        <button type="button" id={id} role="combobox" aria-expanded={open} aria-controls={listId} aria-label={ariaLabel} disabled={disabled}
          className={cn(variant === 'button'
            ? 'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-control border border-accent-line bg-accent-wash px-3 text-sm font-semibold text-accent transition-colors duration-150 hover:border-accent focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-55'
            : 'inline-flex h-10 w-full min-w-0 items-center justify-between gap-2 rounded-control border border-hairline bg-panel px-3 text-left text-base text-ink transition-colors duration-150 hover:border-muted/50 focus-visible:border-accent focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-55', className)}>
          {variant === 'button' ? <span>{current ? current.label : value || placeholder}</span> : <>
            <span className={cn('min-w-0 flex-1 truncate', !value && 'text-muted')}>{current ? current.label : value || placeholder}</span>
            {current?.hint && <span className="max-w-[40%] shrink-0 truncate font-mono text-xs text-muted">{current.hint}</span>}
            <ChevronDown aria-hidden className="text-muted" /></>}
        </button>
      </PopoverTrigger>
      <PopoverContent align={variant === 'button' ? 'end' : 'start'} className="w-[min(380px,calc(100vw-16px))] p-0">
        <Command loop label={searchPlaceholder} filter={(val, search, kw) => (`${val} ${(kw || []).join(' ')}`.toLowerCase().includes(search.toLowerCase()) ? 1 : 0)}>
          <div className="border-b border-hairline-soft p-2">
            <Command.Input autoFocus value={query} onValueChange={setQuery} placeholder={searchPlaceholder} aria-label={searchPlaceholder}
              className="h-10 w-full rounded-control bg-hairline-soft px-3 text-base text-ink outline-none placeholder:text-muted focus-visible:outline-2 focus-visible:outline-accent" />
          </div>
          <Command.List id={listId} className="max-h-[min(320px,50dvh)] overflow-y-auto overscroll-contain p-1">
            <Command.Empty className="px-3 py-6 text-center text-sm text-muted">{allowCustom && q ? '' : emptyText}</Command.Empty>
            {groups.map((g) => g.options.length > 0 && (
              <Command.Group key={g.heading} heading={g.heading}
                className="[&_[cmdk-group-heading]]:sticky [&_[cmdk-group-heading]]:top-0 [&_[cmdk-group-heading]]:z-[1] [&_[cmdk-group-heading]]:bg-panel [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-muted">
                {g.options.map((o) => (
                  <Command.Item key={o.value} value={`${o.label} ${o.value}`} keywords={o.keywords} onSelect={() => pick(o.value)}
                    className={ITEM}>
                    <Check aria-hidden className={cn('text-accent', o.value === value ? 'opacity-100' : 'opacity-0')} />
                    <span className="min-w-0 flex-1 truncate">{o.label}</span>
                    {o.hint && <span className="max-w-[45%] shrink-0 truncate font-mono text-xs text-muted">{o.hint}</span>}
                  </Command.Item>
                ))}
              </Command.Group>
            ))}
            {allowCustom && q && !known && (
              <Command.Item forceMount value={`__custom ${q}`} onSelect={() => pick(q)}
                className={ITEM}>
                <span className="min-w-0 flex-1 truncate">{customLabel(q)}</span>
              </Command.Item>
            )}
          </Command.List>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
