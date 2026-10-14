import { FileDown } from 'lucide-react'
import { useEffect, useState } from 'react'
import { es, useEngineRev } from '@/hooks/useEngine'
import { Button, Notice } from '@/ui'
import { downloadSetup, loadSetupFile, saveStatusText } from '../../engine'
import { pickFile } from '../shell/openFile'

export type Report = { text: string; error?: boolean } | null

/** Save your work: what this browser keeps by itself, and the setup file you keep or share. `report` says what loading a setup did. */
export function SaveGroup({ report, onReport }: { report: Report; onReport: (r: Report) => void }) {
  useEngineRev()
  const has = !!es.an
  // "Saved in this browser · 2 min ago" ages on its own
  const [, tick] = useState(0)
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 30000); return () => clearInterval(t) }, [])
  const load = () => pickFile('.json,application/json', async (f) => {
    const r = await loadSetupFile(f)
    onReport(r.error ? { text: r.error, error: true } : { text: r.report ?? '' })
  })
  return (
    <div className="grid gap-3">
      <h3 className="text-base font-semibold">Save your work</h3>
      <div className="grid gap-2.5 text-sm">
        <div><p className="font-semibold text-ink">Autosaved in this browser</p><p className="text-muted" role="status" data-testid="autosave">{has ? saveStatusText() : 'Starts once a letter is open'}</p>
          <p className="text-muted">This copy lives only in this browser. Use Download setup file to keep your work safe.</p></div>
        <div><p className="font-semibold text-ink">Setup file</p><p className="text-muted">Download a setup file to keep it or share it. It holds every choice for this letter and your data's column names, never its employee rows.</p></div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button disabled={!has} icon={<FileDown aria-hidden />} onClick={() => downloadSetup()}>Download setup file</Button>
        <Button onClick={load}>Load setup file…</Button>
      </div>
      <p className="text-sm text-muted">Load a setup file to carry on later, or on next year's version of the letter to redo most of the work.</p>
      {report && <Notice tone={report.error ? 'err' : 'ok'}>{report.text}</Notice>}
    </div>
  )
}
