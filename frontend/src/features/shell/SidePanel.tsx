import { Tabs } from 'radix-ui'
import { useRef, type KeyboardEvent, type PointerEvent } from 'react'
import { es, useEngineRev } from '@/hooks/useEngine'
import { SIDE_MAX, SIDE_MIN, useUi } from '@/store'
import { cn } from '@/ui'
import { getStep, type StepId } from './registry'
import { STEP_NAMES } from './StepBar'

/** The current step's panel: its name, then whatever the step feature registered (registerStep). */
export function StepPanel({ inDrawer }: { inDrawer?: boolean }) {
  useEngineRev()
  const id = es.tab as StepId
  const def = getStep(id)
  const Body = def?.Panel
  return (
    <Tabs.Content value={id} tabIndex={-1} className="flex min-h-0 flex-1 flex-col outline-none">
      <div className={cn('shrink-0 px-6 pb-4 pt-6', inDrawer && 'pr-14')}>
        <h2 className="text-xl font-semibold leading-tight tracking-tight">{STEP_NAMES[id]}</h2>
        {def?.hint && <p className="mt-1.5 text-sm text-muted">{def.hint}</p>}
      </div>
      <div data-testid="step-panel" className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-10 pt-2">{Body ? <Body /> : null}</div>
    </Tabs.Content>
  )
}

/** Wide screens: the step panel as the left column, 300 to 560px wide, dragged (or arrow-keyed) by its right edge. */
export function SidePanel() {
  const width = useUi((s) => s.sideW)
  const setW = useUi((s) => s.setSideW)
  const ref = useRef<HTMLElement>(null)
  const drag = useRef(false)

  const onDown = (e: PointerEvent<HTMLDivElement>) => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); drag.current = true; document.body.style.cursor = 'col-resize'; document.body.style.userSelect = 'none' }
  const onMove = (e: PointerEvent<HTMLDivElement>) => { if (drag.current && ref.current) setW(e.clientX - ref.current.getBoundingClientRect().left) }
  const onUp = () => { if (!drag.current) return; drag.current = false; document.body.style.cursor = ''; document.body.style.userSelect = ''; setW(useUi.getState().sideW, true) }
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') return
    e.preventDefault()
    setW(e.key === 'Home' ? SIDE_MIN : e.key === 'End' ? SIDE_MAX : width + (e.key === 'ArrowRight' ? 20 : -20), true)
  }

  return (
    <aside ref={ref} aria-label="Current step" style={{ width }} className="relative flex shrink-0 flex-col bg-notesheet">
      <StepPanel />
      <div role="separator" aria-orientation="vertical" aria-label="Resize panel" aria-valuemin={SIDE_MIN} aria-valuemax={SIDE_MAX} aria-valuenow={width} tabIndex={0}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onKeyDown={onKey}
        className={cn('group absolute inset-y-0 -right-1 z-10 w-2 cursor-col-resize touch-none outline-none')}>
        <span aria-hidden className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-hairline-soft transition-[background-color,width] duration-150 group-hover:w-0.5 group-hover:bg-accent group-focus-visible:w-0.5 group-focus-visible:bg-accent group-active:w-0.5 group-active:bg-accent" />
      </div>
    </aside>
  )
}
