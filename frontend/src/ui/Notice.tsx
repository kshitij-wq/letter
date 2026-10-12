import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from './cn'

type Tone = 'info' | 'warn' | 'err' | 'ok'
const ground: Record<Tone, string> = { info: 'bg-info-wash', warn: 'bg-warn-wash', err: 'bg-err-wash', ok: 'bg-ok-wash' }
const iconTone: Record<Tone, string> = { info: 'text-info', warn: 'text-warn', err: 'text-err', ok: 'text-ok' }
const icons = { info: Info, warn: TriangleAlert, err: CircleAlert, ok: CircleCheck }

/** An inline strip: what happened, and (optionally) the one action. Only the icon carries the colour. */
export function Notice({ tone = 'info', children, action, className }: { tone?: Tone; children: ReactNode; action?: ReactNode; className?: string }) {
  const Icon = icons[tone]
  return (
    <div role={tone === 'err' ? 'alert' : 'status'} className={cn('flex flex-wrap items-center gap-x-3 gap-y-2 rounded-control px-3 py-2 text-sm text-ink', ground[tone], className)}>
      <Icon aria-hidden className={cn('mt-px self-start', iconTone[tone])} />
      <div className="min-w-0 flex-1 basis-48 leading-snug">{children}</div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  )
}
