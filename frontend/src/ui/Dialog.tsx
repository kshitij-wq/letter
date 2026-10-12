import { X } from 'lucide-react'
import { useRef, useSyncExternalStore, type ReactNode } from 'react'
import { Dialog as D } from 'radix-ui'
import { Button, IconButton } from './Button'
import { cn } from './cn'

/** A dialog: protected focus, Esc closes. Use it only when the task needs the person's full attention. */
export function Dialog({ open, onOpenChange, title, description, children, footer, className, onOpenAutoFocus }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: ReactNode; children?: ReactNode; footer?: ReactNode; className?: string
  onOpenAutoFocus?: (e: Event) => void
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="anim-fade fixed inset-0 z-[60] bg-[var(--scrim)]" />
        <D.Content onOpenAutoFocus={onOpenAutoFocus}
          className={cn('anim-pop fixed left-1/2 top-1/2 z-[61] w-[min(440px,calc(100vw-32px))] max-h-[calc(100dvh-32px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-panel border border-hairline bg-panel p-5 shadow-pop', className)}>
          <D.Title className="text-lg font-semibold text-ink">{title}</D.Title>
          {description ? <D.Description className="mt-2 text-base text-muted">{description}</D.Description> : <D.Description className="sr-only">{title}</D.Description>}
          {children && <div className="mt-4">{children}</div>}
          {footer && <div className="mt-5 flex flex-wrap justify-end gap-2">{footer}</div>}
        </D.Content>
      </D.Portal>
    </D.Root>
  )
}

/** A panel that slides in from an edge (the step drawer on a phone). */
export function Sheet({ open, onOpenChange, side = 'left', title, children, className }: { open: boolean; onOpenChange: (o: boolean) => void; side?: 'left' | 'right'; title: string; children: ReactNode; className?: string }) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="anim-fade fixed inset-0 z-[50] bg-[var(--scrim)]" />
        <D.Content aria-describedby={undefined} onOpenAutoFocus={(e) => { e.preventDefault(); (e.currentTarget as HTMLElement).focus() }}
          className={cn('fixed inset-y-0 z-[51] flex w-[min(88vw,420px)] flex-col bg-notesheet shadow-pop outline-none', side === 'left' ? 'anim-left left-0' : 'anim-right right-0', className)}>
          <D.Title className="sr-only">{title}</D.Title>
          <D.Close asChild>
            <IconButton label="Close" size="sm" className="absolute right-2 top-2 z-10"><X aria-hidden /></IconButton>
          </D.Close>
          {children}
        </D.Content>
      </D.Portal>
    </D.Root>
  )
}

/* ---- confirm(): a promise-returning yes/no, like window.confirm but in the design system ---- */
export type ConfirmOptions = { title: string; body?: ReactNode; confirmLabel?: string; cancelLabel?: string; danger?: boolean }
type Pending = ConfirmOptions & { resolve: (ok: boolean) => void }
let pending: Pending | null = null
const subs = new Set<() => void>()
const emit = () => subs.forEach((f) => f())
const settle = (ok: boolean) => { const p = pending; pending = null; emit(); p?.resolve(ok) }

/**
 * Ask before something that can't be undone. Resolves true when the person confirms, false on Cancel, Esc or a click outside.
 * With `danger` the Cancel button has focus, so Enter never confirms by accident. Needs <ConfirmHost /> mounted once.
 */
export function confirm(opts: ConfirmOptions): Promise<boolean> {
  if (pending) settle(false)
  return new Promise<boolean>((resolve) => { pending = { ...opts, resolve }; emit() })
}

/** Mount once in the app: shows the dialog for confirm(). */
export function ConfirmHost() {
  const p = useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f) } }, () => pending, () => null)
  const cancel = useRef<HTMLButtonElement>(null)
  const ok = useRef<HTMLButtonElement>(null)
  return (
    <Dialog open={!!p} onOpenChange={(o) => { if (!o) settle(false) }} title={p?.title ?? ''} description={p?.body}
      onOpenAutoFocus={(e) => { e.preventDefault(); (p?.danger ? cancel : ok).current?.focus() }}
      footer={p && (
        <>
          <Button ref={cancel} onClick={() => settle(false)}>{p.cancelLabel ?? 'Cancel'}</Button>
          <Button ref={ok} variant={p.danger ? 'danger' : 'primary'} onClick={() => settle(true)}>{p.confirmLabel ?? 'Continue'}</Button>
        </>
      )} />
  )
}
