import { cn } from '@/ui'

/** The words around a placeholder with the placeholder marked: up to 60 characters before it and `after` characters after it. */
export function Around({ cx, after }: { cx: { before: string; find: string; after: string }; after: number }) {
  return <>{cx.before.length > 60 ? '…' : ''}{cx.before.slice(-60)}<mark className="rounded-[2px] bg-hl px-0.5 text-hl-ink">{cx.find}</mark>{cx.after.slice(0, after)}{cx.after.length > after ? '…' : ''}</>
}

/** "Your data has a “dept” column. Use dept": the loaded data names this field differently. Only offered, never applied. */
export function ColumnHint({ col, onUse, testId, className }: { col: string; onUse: () => void; testId: string; className?: string }) {
  return <p data-testid={testId} className={cn('text-sm text-muted', className)}>Your data has a “{col}” column. <button type="button" className="font-semibold text-accent hover:underline" onClick={onUse}>Use {col}</button></p>
}
