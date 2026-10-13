import { Tabs } from 'radix-ui'
import { es, useEngineRev } from '@/hooks/useEngine'
import { useUi } from '@/store'
import { Sheet } from '@/ui'
import { setTab } from '../../engine'
import { AssistantPanel } from '../assistant/AssistantPanel'
import { Canvas } from '../paper/Canvas'
import { CommandPalette } from './CommandPalette'
import { Header } from './Header'
import { Inspector } from './Inspector'
import { StepPanel, SidePanel } from './SidePanel'
import { StepBar } from './StepBar'
import { useInspectorSync } from './useInspectorSync'
import { useIsNarrow } from './useMedia'

/**
 * The frame: header, step bar, then three columns (current step, the letter, the inspector). Each column scrolls on its own.
 * With no letter open only the first-run page shows (no step bar, no panels). The step panel is a drawer at 980px and below
 * and the inspector floats over the letter at 1280px and below.
 */
export function Shell() {
  useEngineRev()
  useInspectorSync()
  const narrow = useIsNarrow()
  const collapsed = useUi((s) => s.sideCollapsed)
  const drawer = useUi((s) => s.drawerOpen)
  const setDrawer = useUi((s) => s.setDrawerOpen)
  const assistant = useUi((s) => s.assistantOpen)
  const has = !!es.an

  return (
    <Tabs.Root value={es.tab} onValueChange={(v) => setTab(v)} activationMode="automatic" className="flex h-dvh min-h-0 flex-col bg-ground">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-[90] focus:rounded-control focus:bg-panel focus:px-3 focus:py-2 focus:shadow-pop">Skip to the letter</a>
      <Header />
      {has && <StepBar />}
      <div className="relative flex min-h-0 flex-1">
        {has && !narrow && !collapsed && <SidePanel />}
        <Canvas />
        {has && <Inspector />}
        {assistant && <AssistantPanel />}
      </div>
      {has && narrow && (
        <Sheet open={drawer} onOpenChange={setDrawer} title="Current step" side="left">
          <StepPanel inDrawer />
        </Sheet>
      )}
      <CommandPalette />
    </Tabs.Root>
  )
}
