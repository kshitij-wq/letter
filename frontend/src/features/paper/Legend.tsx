import { ChevronDown } from 'lucide-react'
import { es, useEngineRev } from '@/hooks/useEngine'
import { Button, Popover, PopoverContent, PopoverTrigger } from '@/ui'
import { getFlags } from './paperEvents'

type Item = { sw: string; label: string; note?: string }

/** What the marks in the current view mean. */
function legendItems(): { main: Item[]; more: Item[] } {
  const view = es.view
  if (view === 'source') {
    const more: Item[] = []
    if (getFlags().length) more.push({ sw: 'flag', label: 'Flag', note: 'A lettered flag in the margin marks an issue listed in Validate.' })
    if (es.tagMarks && [...es.tagMarks.values()].some((m: { level: string }) => m.level === 'error')) more.push({ sw: 'sw-problem', label: 'Tag with a problem' })
    if (es.lg && es.lg.length) more.push({ sw: 'sw-cond', label: 'Condition', note: 'A bracket in the margin shows text that appears only when the condition is true.' })
    return { main: [{ sw: 'sw-tagged', label: 'Tagged' }, { sw: 'sw-check', label: 'To check' }, { sw: 'sw-need', label: 'Needs a tag' }], more }
  }
  if (view === 'filled') return { main: [{ sw: 'sw-fv', label: 'From the data' }, { sw: 'sw-smp', label: 'Made-up sample' }, { sw: 'sw-empty', label: 'Empty' }], more: [] }
  return { main: [], more: [] }
}

const Swatch = ({ sw }: { sw: string }) => sw === 'flag'
  ? <b aria-hidden className="grid h-[14px] w-[16px] shrink-0 place-items-center bg-err pr-[2px] text-[11px] font-bold leading-none text-panel [clip-path:polygon(0_0,76%_0,100%_50%,76%_100%,0_100%)]">A</b>
  : <i aria-hidden className={`sw ${sw}`} />

/** A compact key: the main marks inline on a wide canvas, everything in a "Key" popover. */
export function Legend() {
  useEngineRev()
  const { main, more } = legendItems()
  if (!main.length) return <div className="flex-1" />
  return (
    <div className="flex min-w-0 flex-1 items-center gap-1">
      <ul className="hidden min-w-0 items-center gap-3 overflow-hidden whitespace-nowrap text-sm text-muted @[760px]:flex" aria-label="Marks in the letter">
        {main.map((m) => <li key={m.label} className="flex items-center gap-1.5"><Swatch sw={m.sw} />{m.label}</li>)}
      </ul>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className="ml-auto @[760px]:ml-0">Key<ChevronDown aria-hidden /></Button>
        </PopoverTrigger>
        <PopoverContent aria-label="Key to the marks in the letter" className="w-[min(320px,calc(100vw-16px))]">
          <ul className="grid gap-2.5">
            {[...main, ...more].map((m) => (
              <li key={m.label} className="flex items-start gap-2">
                <span className="mt-[3px]"><Swatch sw={m.sw} /></span>
                <span><span className="font-medium text-ink">{m.label}</span>{m.note && <span className="block text-sm text-muted">{m.note}</span>}</span>
              </li>
            ))}
          </ul>
        </PopoverContent>
      </Popover>
    </div>
  )
}
