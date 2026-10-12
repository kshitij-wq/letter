import { ArrowLeft } from 'lucide-react'
import { es, useEngineRev } from '@/hooks/useEngine'
import { Button, Notice } from '@/ui'
import { csvRows, setView } from '../../engine'

/**
 * R1 placeholder for the bar above the Employee preview: says whether the values are real or made up (never claims real
 * data it does not have) and goes back to the tagged template. R2 (Preview & export) replaces this file.
 */
export function PreviewBar() {
  useEngineRev()
  const real = csvRows().length > 0
  return (
    <Notice tone={real ? 'ok' : 'warn'} action={<Button size="sm" icon={<ArrowLeft aria-hidden />} onClick={() => setView('tagged')}>Back to tagged template</Button>}>
      <span className="font-semibold">{real ? `Real data · ${es.csv.name}` : 'Sample data · made-up values'}</span>
    </Notice>
  )
}
