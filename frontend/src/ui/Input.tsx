import { X, Search } from 'lucide-react'
import type { InputHTMLAttributes, KeyboardEvent, Ref, TextareaHTMLAttributes } from 'react'
import { cn } from './cn'

const field = 'w-full rounded-control border border-hairline bg-panel text-base text-ink transition-colors duration-150 placeholder:text-muted hover:border-muted/50 focus-visible:border-accent focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-55 aria-invalid:border-err aria-invalid:focus-visible:outline-err'

type InputProps = InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean; mono?: boolean; ref?: Ref<HTMLInputElement> }

/** A single-line field, 32px high. `invalid` turns the border red (say why in the text under it). */
export function Input({ invalid, mono, className, ref, ...rest }: InputProps) {
  return <input ref={ref} aria-invalid={invalid || undefined} className={cn(field, 'h-10 px-3', mono && 'font-mono text-sm', className)} {...rest} />
}

/** A search field with a magnifier and a clear button; Escape clears it first. */
export function SearchInput({ value, onChange, placeholder = 'Search', label, className, ref, ...rest }: Omit<InputProps, 'onChange' | 'value'> & { value: string; onChange: (v: string) => void; label?: string }) {
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape' && value) { e.preventDefault(); e.stopPropagation(); onChange('') }
  }
  return (
    <div className={cn('relative', className)}>
      <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
      <Input ref={ref} type="search" value={value} placeholder={placeholder} aria-label={label || placeholder} onChange={(e) => onChange(e.target.value)} onKeyDown={onKey}
        className="pl-8 pr-8 [&::-webkit-search-cancel-button]:hidden" {...rest} />
      {value && (
        <button type="button" aria-label="Clear search" onClick={() => onChange('')}
          className="absolute right-1 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-control text-muted transition-colors hover:bg-hairline-soft hover:text-ink">
          <X aria-hidden />
        </button>
      )}
    </div>
  )
}

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean; mono?: boolean; ref?: Ref<HTMLTextAreaElement> }

/** A multi-line field; starts at 60px and can be dragged taller. */
export function Textarea({ invalid, mono, className, ref, ...rest }: TextareaProps) {
  return <textarea ref={ref} aria-invalid={invalid || undefined} className={cn(field, 'min-h-[60px] resize-y px-2.5 py-1.5', mono && 'font-mono text-sm', className)} {...rest} />
}
