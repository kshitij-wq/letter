import { Check, ChevronRight, CircleCheck, GitBranch, Tag, Upload, Download } from 'lucide-react'
import { es, useEngineRev } from '@/hooks/useEngine'
import { useUi } from '@/store'
import { Button, DropZone, Notice } from '@/ui'
import { csvMetaText } from '../../engine'
import { DATA_ACCEPT, LETTER_ACCEPT, openData, openLetter, openSample, openTagged, pickFile } from '../shell/openFile'

const FLOW = [
  { icon: Tag, label: 'Map placeholders' },
  { icon: GitBranch, label: 'Add conditions' },
  { icon: CircleCheck, label: 'Validate' },
  { icon: Download, label: 'Download' },
]

/**
 * The page before any letter is open (no letter is opened for you): a big drop zone, optional employee data, the sample
 * letter, the four steps, and what leaves the browser. Errors for a bad or empty file show here, where the person is looking.
 */
export function FirstRun() {
  useEngineRev()
  const error = useUi((s) => s.error)
  const csv = es.csv as { name: string } | null
  const shown = error && (error.scope === 'letter' || error.scope === 'data') ? error : null

  return (
    <section aria-labelledby="first-run-title" className="mx-auto flex w-full max-w-[560px] flex-1 flex-col justify-center gap-8 px-5 py-10">
      <h1 id="first-run-title" className="text-balance text-center text-xl font-semibold leading-tight">Turn a client letter into a CompUp template</h1>

      <div className="grid gap-3">
        {shown && <Notice tone="err">{shown.message}</Notice>}
        <DropZone label="Choose the client's letter, a Word .docx file" accept={LETTER_ACCEPT} onFiles={([f]) => openLetter(f)}
          className="group border border-dashed border-muted/50 bg-panel px-6 py-12 text-center hover:border-accent focus-visible:border-accent">
          <div className="flex flex-col items-center gap-2">
            <Upload aria-hidden className="size-6 stroke-[1.25] text-muted transition-colors group-hover:text-accent" />
            <p className="text-lg font-semibold">Drop the client's letter here</p>
            <p className="flex items-center gap-2 text-muted">or <span className="pointer-events-none inline-flex h-8 items-center rounded-control bg-accent px-3 font-semibold text-accent-ink group-hover:bg-accent-hover">Choose a .docx file</span></p>
            <p className="mt-1 text-sm text-muted">.docx (Word 2007 or later). Data: .csv, .xlsx, .xls.</p>
          </div>
        </DropZone>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-hairline-soft pt-6">
        <div className="min-w-0 flex-1 basis-64">
          <h2 className="flex items-center gap-2 text-base font-semibold">Employee data <span className="rounded-badge bg-hairline-soft px-1.5 text-xs font-semibold text-muted">Optional</span></h2>
          <p className="mt-1 text-sm text-muted">Add a CSV or Excel file of employees to fill previews and test every employee. Without it, previews use made-up sample values.</p>
          {csv && <p className="mt-2 flex items-center gap-1.5 text-sm text-ok"><Check aria-hidden className="size-3.5" /><span className="min-w-0 truncate text-ink">{csv.name} · {csvMetaText(csv)}</span></p>}
        </div>
        <DropZone label="Add employee data" accept={DATA_ACCEPT} onFiles={([f]) => openData(f)} className="shrink-0">
          <span className="inline-flex h-8 items-center rounded-control border border-hairline bg-panel px-3 font-semibold hover:bg-hairline-soft">Add employee data…</span>
        </DropZone>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-x-3 text-muted">
        <span>No file to hand?</span>
        <Button variant="ghost" onClick={() => openSample()}>Open the sample letter</Button>
        <span aria-hidden>·</span>
        <Button variant="ghost" onClick={() => pickFile(LETTER_ACCEPT, openTagged)}>Check a tagged template…</Button>
      </div>

      <div className="grid gap-4 text-center">
        <ol aria-label="The steps" className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm text-muted max-[480px]:gap-x-4">
          {FLOW.map((s, i) => (
            <li key={s.label} className="flex items-center gap-2">
              {i > 0 && <ChevronRight aria-hidden className="size-3.5 text-hairline max-[480px]:hidden" />}
              <span className="flex items-center gap-1.5"><s.icon aria-hidden className="size-3.5" />{s.label}</span>
            </li>
          ))}
        </ol>
        <p className="mx-auto max-w-[58ch] text-sm text-muted">
          Your files stay in this browser. Checks with real Jinja send the template to this tool's own server, never to anyone else. Test every employee also sends the employee values there.
          Claude helpers, if you use them, get the letter text, column names and a few example values (such as departments), never employee rows or names.
        </p>
      </div>
    </section>
  )
}
