import { FileUp, Table2 } from 'lucide-react'
import { es, useEngineRev } from '@/hooks/useEngine'
import { useUi } from '@/store'
import { Button, Notice } from '@/ui'
import { csvMetaText, stepInfo } from '../../engine'
import { DATA_ACCEPT, LETTER_ACCEPT, openData, openLetter, openTagged, pickFile } from '../shell/openFile'

/** R1 placeholder for the Document step: what is open, and the three ways to change it. R2 replaces this file. */
export function DocStep() {
  useEngineRev()
  const error = useUi((s) => s.error)
  const { info } = stepInfo() as { info: Record<string, { title: string }> }
  const csv = es.csv as { name: string } | null
  return (
    <div className="grid gap-5">
      {error && <Notice tone="err">{error.message}</Notice>}
      <div className="grid gap-1">
        <p className="break-words font-semibold">{es.fileName}</p>
        <p className="text-sm text-muted">{info.doc.title}</p>
      </div>
      <div className="grid gap-1">
        <p className="font-semibold">Employee data</p>
        <p className="text-sm text-muted">{csv ? `${csv.name} · ${csvMetaText(csv)}` : 'None loaded. Previews use made-up sample values.'}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button icon={<FileUp aria-hidden />} onClick={() => pickFile(LETTER_ACCEPT, openLetter)}>Open another letter…</Button>
        <Button icon={<Table2 aria-hidden />} onClick={() => pickFile(DATA_ACCEPT, (f) => openData(f))}>{csv ? 'Replace employee data…' : 'Add employee data…'}</Button>
        <Button variant="ghost" onClick={() => pickFile(LETTER_ACCEPT, openTagged)}>Check a tagged template…</Button>
      </div>
    </div>
  )
}
