import { CircleAlert, CircleCheck, Circle, Download, Table2, TriangleAlert } from 'lucide-react'
import { useEngineRev } from '@/hooks/useEngine'
import { useUi } from '@/store'
import { Button } from '@/ui'
import { downloadMapping, downloadSetup, exportChecklist } from '../../engine'
import { runDownloadDocx } from '../shell/docx'
import { goToStep } from '../shell/commands'

const ICON = { ok: CircleCheck, warn: TriangleAlert, err: CircleAlert, idle: Circle } as const
const TONE = { ok: 'text-ok', warn: 'text-warn', err: 'text-err', idle: 'text-muted' } as const

/** R1 placeholder for Preview & export: the real readiness checklist and the three downloads. R2 replaces this file. */
export function ExportStep() {
  useEngineRev()
  const docx = useUi((s) => s.docx)
  const { items, warn } = exportChecklist() as { items: { kind: keyof typeof ICON; label: string; text: string; sub: string; step: string }[]; warn: string }
  return (
    <div className="grid gap-5">
      <ul className="grid gap-3">
        {items.map((it) => {
          const Icon = ICON[it.kind]
          return (
            <li key={it.label} className="flex items-start gap-2.5">
              <Icon aria-hidden className={`mt-0.5 ${TONE[it.kind]}`} />
              <div className="min-w-0 flex-1">
                <p className="text-base"><span className="font-semibold">{it.label}</span> · {it.text}</p>
                {it.sub && <p className="text-sm text-muted">{it.sub}</p>}
              </div>
              {it.step && it.kind !== 'ok' && <Button variant="ghost" size="sm" onClick={() => goToStep(it.step as 'tags')}>Open</Button>}
            </li>
          )
        })}
      </ul>
      {warn && <p className="text-sm text-warn">{warn}</p>}
      <div className="grid gap-2">
        <Button variant="primary" loading={docx === 'busy'} icon={<Download aria-hidden />} onClick={() => runDownloadDocx()}>{docx === 'busy' ? 'Building…' : docx === 'done' ? 'Downloaded' : 'Download tagged .docx'}</Button>
        <Button icon={<Table2 aria-hidden />} onClick={() => downloadMapping()}>Export mapping CSV</Button>
        <Button icon={<Download aria-hidden />} onClick={() => downloadSetup()}>Download setup file</Button>
      </div>
    </div>
  )
}
