import { ChevronRight, Circle, CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react'
import { cn } from '@/ui'
import { exportChecklist } from '../../engine'
import { plainLine } from '../validate/plain'
import { goToStep } from '../shell/commands'

type Kind = 'ok' | 'warn' | 'err' | 'idle'
type Item = { kind: Kind; label: string; text: string; sub: string; step: string; stepLabel: string }

const ICON = { ok: CircleCheck, warn: TriangleAlert, err: CircleAlert, idle: Info } as const
const TONE = { ok: 'text-ok', warn: 'text-warn', err: 'text-err', idle: 'text-muted' } as const
const SR = { ok: 'Done: ', warn: 'Needs a look: ', err: 'Problem: ', idle: 'Not done: ' } as const

function Row({ it }: { it: Item }) {
  const Icon = it.kind === 'idle' && !it.step ? Circle : ICON[it.kind]
  const body = (
    <>
      <Icon aria-hidden className={cn('mt-0.5', TONE[it.kind])} />
      <span className="min-w-0 flex-1 text-left">
        <span className="sr-only">{SR[it.kind]}</span>
        <b className="font-semibold">{it.label}</b> <span className="text-muted">·</span> {it.text}
        {it.sub && <span className="mt-0.5 block text-sm text-muted">{it.sub}</span>}
      </span>
    </>
  )
  // a line that belongs to a step is a button to it: the whole line, so it is easy to hit
  if (!it.step) return <li className="flex items-start gap-2.5 px-2 py-1.5">{body}</li>
  return (
    <li>
      <button type="button" onClick={() => goToStep(it.step as 'tags')}
        className="group flex w-full items-start gap-2.5 rounded-control px-2 py-1.5 transition-colors duration-150 hover:bg-hairline-soft">
        {body}
        <span className="sr-only">Go to {it.stepLabel}</span>
        <ChevronRight aria-hidden className="mt-0.5 text-muted opacity-50 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100" />
      </button>
    </li>
  )
}

/** The readiness checklist: every line is read from the page's current state (never from clicks), and takes you to its step. */
export function Readiness() {
  const raw = exportChecklist() as { items: Item[]; warn: string }
  // the full check only proves the template runs: it is never a green "passed" while something else is still open
  const open = raw.items.some((it) => it.kind === 'warn' || it.kind === 'err')
  const errs = raw.items.some((it) => it.kind === 'err')
  const items = raw.items.map((it) => {
    const full = it.label === 'Real Jinja check' && it.kind === 'ok'
    return { ...it, label: it.label === 'Real Jinja check' ? 'Full check' : it.label, text: full ? "the template runs in CompUp's engine" : plainLine(it.text), sub: plainLine(it.sub), kind: (full && open ? 'idle' : it.kind) as Kind }
  })
  return (
    <div className="grid gap-2">
      <ul aria-label="Readiness" className="-mx-2 grid gap-0.5">{items.map((it) => <Row key={it.label} it={it} />)}</ul>
      {errs && <p className="flex items-start gap-2 text-sm text-err"><CircleAlert aria-hidden className="mt-px" /><span>Download stays blocked until the errors are fixed.</span></p>}
      {!errs && open && <p className="flex items-start gap-2 text-sm text-warn"><TriangleAlert aria-hidden className="mt-px" /><span>Not finished. Downloading will ask you first.</span></p>}
      {!open && items.length > 0 && <p className="flex items-start gap-2 text-sm text-ok"><CircleCheck aria-hidden className="mt-px" /><span>Ready. Nothing is left to fix.</span></p>}
    </div>
  )
}
