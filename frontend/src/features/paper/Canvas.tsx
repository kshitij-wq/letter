import { ArrowUp } from 'lucide-react'
import { es, useEngineRev } from '@/hooks/useEngine'
import { Button, IconButton, Notice, SegmentedControl, type Segment } from '@/ui'
import { dismissRestore, fmtWhen, restoreAutosave, setView } from '../../engine'
import { FirstRun } from '../firstrun/FirstRun'
import { LETTER_ACCEPT, openLetter, pickFile } from '../shell/openFile'
import { canvasSlots } from '../shell/registry'
import { Legend } from './Legend'
import { Paper } from './Paper'
import { paperScroller, scrollBehavior } from './navigate'

type View = 'source' | 'tagged' | 'filled'
const VIEWS: Segment<View>[] = [
  { value: 'source', ariaLabel: 'Client letter', label: <><span className="@max-[600px]:hidden">Client letter</span><span className="@min-[600px]:hidden">Letter</span></> },
  { value: 'tagged', ariaLabel: 'Tagged template', label: <><span className="@max-[600px]:hidden">Tagged template</span><span className="@min-[600px]:hidden">Template</span></> },
  { value: 'filled', ariaLabel: 'Employee preview', label: <><span className="@max-[600px]:hidden">Employee preview</span><span className="@min-[600px]:hidden">Preview</span></> },
]

/** The middle of the screen: the first-run page, or the view switch, the notices and the letter on its desk. */
export function Canvas() {
  useEngineRev()
  if (!es.an) return <main id="main" className="flex min-w-0 flex-1 flex-col overflow-y-auto bg-ground"><FirstRun /></main>
  const Preview = es.view === 'filled' ? canvasSlots.previewBar : undefined
  const restore = es.pendingRestore as { savedAt?: string } | null

  return (
    <main id="main" className="@container flex min-w-0 flex-1 flex-col bg-ground">
      <div className="flex h-12 shrink-0 items-center gap-3 px-6 @max-[520px]:px-3">
        <SegmentedControl<View> label="View of the letter" value={es.view} onValueChange={setView} items={VIEWS} size="sm" />
        <Legend />
        <IconButton label="Back to top of letter" size="sm" className="@max-[520px]:hidden"
          onClick={() => paperScroller()?.scrollTo({ top: 0, behavior: scrollBehavior() })}><ArrowUp aria-hidden /></IconButton>
      </div>
      {(es.isSample || restore || Preview) && (
        <div className="mx-auto grid w-full max-w-[816px] shrink-0 gap-2 px-6 pb-3 @max-[520px]:px-3">
          {es.isSample && (
            <Notice action={<Button size="sm" onClick={() => pickFile(LETTER_ACCEPT, openLetter)}>Upload a client letter</Button>}>
              Sample letter for a made-up company (Northwind Appliances).
            </Notice>
          )}
          {restore && (
            <Notice tone="warn" action={<><Button size="sm" variant="primary" onClick={restoreAutosave}>Restore my work</Button><Button size="sm" onClick={dismissRestore}>Start fresh</Button></>}>
              You worked on this letter before{restore.savedAt ? ` (saved ${fmtWhen(Date.parse(restore.savedAt))})` : ''}.
            </Notice>
          )}
          {Preview && <Preview />}
        </div>
      )}
      <div id="paper-scroll" className="paper-scroll min-h-0 flex-1" tabIndex={-1}>
        <Paper />
      </div>
    </main>
  )
}
