import { Check, PanelLeft } from 'lucide-react'
import { useEffect } from 'react'
import { Tabs } from 'radix-ui'
import { es, useEngineRev } from '@/hooks/useEngine'
import { useUi } from '@/store'
import { IconButton, Tooltip, cn } from '@/ui'
import { STEPS, stepInfo } from '../../engine'
import { useIsNarrow } from './useMedia'

export const STEP_NAMES: Record<string, string> = { doc: 'Document', tags: 'Tags & fields', logic: 'Conditions', check: 'Validate', export: 'Preview & export' }

/** Show the step panel: unfold it on a wide screen, open the drawer on a narrow one. */
export function revealSide(narrow: boolean) {
  const ui = useUi.getState()
  if (narrow) ui.setDrawerOpen(true)
  else if (ui.sideCollapsed) ui.setSideCollapsed(false)
}

/**
 * Document · Tags & fields · Conditions · Validate · Preview & export. Free navigation (arrow keys move between steps).
 * The marks and counts come from the engine's stepInfo(): a step is only "done" from what the page can see.
 * Must sit inside the Radix <Tabs.Root> in Shell (the step panel is its Tabs.Content).
 */
export function StepBar() {
  useEngineRev()
  const narrow = useIsNarrow()
  const collapsed = useUi((s) => s.sideCollapsed)
  const drawer = useUi((s) => s.drawerOpen)
  const setCollapsed = useUi((s) => s.setSideCollapsed)
  const setDrawer = useUi((s) => s.setDrawerOpen)
  const { info, done } = stepInfo() as { info: Record<string, { n: number | string; err?: boolean; label: string; title: string }>; done: Record<string, boolean> }
  const sideOpen = narrow ? drawer : !collapsed
  // on a phone the bar scrolls sideways: keep the current step in view
  useEffect(() => { document.querySelector('[role="tab"][aria-selected="true"]')?.scrollIntoView({ inline: 'nearest', block: 'nearest' }) }, [es.tab])

  return (
    <nav aria-label="Workflow" className="flex h-11 shrink-0 items-center gap-1 border-b border-hairline-soft bg-panel px-3">
      <IconButton label={sideOpen ? 'Hide panel' : 'Show panel'} aria-expanded={sideOpen}
        onClick={() => (narrow ? setDrawer(!drawer) : setCollapsed(!collapsed))}>
        <PanelLeft aria-hidden />
      </IconButton>
      <Tabs.List aria-label="Workflow steps" className="no-scrollbar flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
        {STEPS.map((id: string, i: number) => {
          const it = info[id]
          const on = es.tab === id
          return (
            <Tooltip key={id} content={it.title} side="bottom">
              <Tabs.Trigger value={id} aria-label={it.label} data-testid={`step-${id}`} data-done={done[id] || undefined} onClick={() => revealSide(narrow)}
                className={cn('group relative flex h-11 shrink-0 items-center gap-2 px-2.5 text-base font-semibold transition-colors duration-150 focus-visible:-outline-offset-2',
                  on ? 'text-accent' : 'text-muted hover:text-ink')}>
                <span aria-hidden className={cn('tnum grid size-5 place-items-center rounded-full text-xs font-semibold transition-colors duration-150',
                  done[id] ? 'bg-ok text-panel' : on ? 'bg-accent text-accent-ink' : 'bg-hairline-soft text-muted')}>
                  {done[id] ? <Check className="size-3 stroke-[2.5]" /> : i + 1}
                </span>
                <span className="whitespace-nowrap">{STEP_NAMES[id]}</span>
                {it.n !== '' && it.n !== 0 && (
                  <span aria-hidden data-testid="step-count" className={cn('tnum grid h-[18px] min-w-[18px] place-items-center rounded-full px-1.5 text-xs font-semibold',
                    it.err ? 'bg-err text-panel' : 'bg-warn-wash text-warn ring-1 ring-inset ring-warn-line')}>{it.n}</span>
                )}
                <span aria-hidden className={cn('absolute inset-x-2.5 bottom-0 h-0.5 rounded-full bg-accent transition-opacity duration-150', on ? 'opacity-100' : 'opacity-0')} />
              </Tabs.Trigger>
            </Tooltip>
          )
        })}
      </Tabs.List>
    </nav>
  )
}

