import { ChevronRight } from 'lucide-react'
import { useId, type ReactNode } from 'react'
import { cn } from '@/ui'
import { COND_PRESETS, PLACES } from '../../engine'

/** The common conditions, as Select options. */
export const PRESETS = (COND_PRESETS as Array<{ id: string; label: string; expr: string }>).filter((p) => p.expr).map((p) => ({ value: p.id, label: p.label }))
/** Where a condition tag goes in its paragraph, as Select options. */
export const PLACE_OPTIONS = (PLACES as Array<[string, string]>).map(([value, label]) => ({ value, label }))

/** What is selected, in one place: a short title, the words, and where they sit. */
export function SelSummary({ title, quote, ctx }: { title: ReactNode; quote?: ReactNode; ctx?: ReactNode }) {
  return (
    <div className="grid gap-1">
      <p className="text-base">{title}</p>
      {quote && <p className="font-serif text-lg leading-snug text-ink">{quote}</p>}
      {ctx && <p className="text-sm text-muted">{ctx}</p>}
    </div>
  )
}

/** A titled part of a form: a heading and its controls, 8px apart. */
export function Part({ title, htmlFor, hint, children, className }: { title: ReactNode; htmlFor?: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  const id = useId()
  return (
    <section aria-labelledby={id} className={cn('grid gap-2', className)}>
      {htmlFor
        ? <label id={id} htmlFor={htmlFor} className="text-base font-semibold">{title}</label>
        : <h3 id={id} className="text-base font-semibold">{title}</h3>}
      {children}
      {hint && <p className="text-sm text-muted">{hint}</p>}
    </section>
  )
}

/** A choice with a one-line explanation (what to do with the selected words). */
export function ActionRow({ title, children, onClick, id }: { title: string; children: ReactNode; onClick: () => void; id?: string }) {
  return (
    <button type="button" id={id} onClick={onClick}
      className="group flex w-full items-center gap-3 rounded-panel px-3 py-2.5 text-left transition-colors duration-150 hover:bg-hairline-soft">
      <span className="min-w-0 flex-1">
        <span className="block text-base font-semibold">{title}</span>
        <span className="mt-0.5 block text-sm text-muted">{children}</span>
      </span>
      <ChevronRight aria-hidden className="text-muted transition-transform duration-150 group-hover:translate-x-0.5" />
    </button>
  )
}

/** Inline code in the plain-words text: a tag or a condition as typed. */
export function Code({ children, className }: { children: ReactNode; className?: string }) {
  return <code className={cn('rounded-tag bg-cond-wash px-1 font-mono text-[0.92em] text-cond [overflow-wrap:anywhere]', className)}>{children}</code>
}
