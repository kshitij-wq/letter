import { ConfirmHost, Toaster, TooltipProvider } from '@/ui'
import { EngineEvents } from './features/shell/EngineEvents'
import { Shell } from './features/shell/Shell'

export default function App() {
  return (
    <TooltipProvider>
      <Shell />
      <ConfirmHost />
      <Toaster />
      <EngineEvents />
    </TooltipProvider>
  )
}
