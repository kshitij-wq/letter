import { Check, Download, Eye, FileDown, Table2 } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { es, useEngineRev } from '@/hooks/useEngine'
import { useUi } from '@/store'
import { Badge, Button, EmptyState, Section, Select, Switch, cn } from '@/ui'
import { changePreviewSettings, csvRows, downloadMapping, downloadSetup, previewValues, setView } from '../../engine'
import { runDownloadDocx } from '../shell/docx'
import { isNarrowNow } from '../shell/useMedia'
import { PreviewValues } from './PreviewValues'
import { Readiness } from './Readiness'

function DownloadItem({ children, hint, ...props }: { children: React.ReactNode; hint: string } & React.ComponentProps<typeof Button>) {
  return (
    <div className="grid justify-items-start gap-1.5">
      <Button {...props}>{children}</Button>
      <p className="text-sm text-muted">{hint}</p>
    </div>
  )
}

function Downloads() {
  const docx = useUi((s) => s.docx)
  return (
    <div className="grid gap-4">
      <DownloadItem hint="Upload this to CompUp." variant="primary" loading={docx === 'busy'} onClick={() => runDownloadDocx()}
        icon={docx === 'done' ? <Check aria-hidden /> : <Download aria-hidden />}>
        {docx === 'busy' ? 'Building…' : docx === 'done' ? 'Downloaded' : 'Download tagged .docx'}
      </DownloadItem>
      <DownloadItem hint="Which text became which tag." icon={<Table2 aria-hidden />} onClick={() => downloadMapping()}>Export mapping CSV</DownloadItem>
      <DownloadItem hint="Reopen this work later or reuse it next cycle." icon={<FileDown aria-hidden />} onClick={() => downloadSetup()}>Download setup file</DownloadItem>
    </div>
  )
}

const PLACE = [
  { value: 'both', label: 'Both basic and custom_schema.basic' },
  { value: 'top', label: 'basic only' },
  { value: 'custom', label: 'custom_schema.basic only' },
]
const NUMBERS = [
  { value: 'text', label: 'Keep as text, like an upload (stricter)' },
  { value: 'number', label: 'Treat them as numbers' },
]

function PreviewSettings() {
  const placeId = useId(), numId = useId()
  const rows = csvRows().length
  const csv = es.csv as { name: string; mode: string } | null
  const st = es.settings as { csvPlace?: string; csvNumbers?: string; previewSamples?: boolean }
  return (
    <div className="grid gap-4">
      <p className="text-sm">
        {rows
          ? <><Badge tone="ok" className="mr-1.5">Real data</Badge><span className="tnum">{rows} employee{rows > 1 ? 's' : ''}</span> in <b className="break-all font-semibold">{csv?.name}</b>.</>
          : <><Badge tone="warn" className="mr-1.5">Sample data</Badge>{csv ? `Your CSV has no employee rows (${csv.mode === 'keys' ? 'only column names' : 'a text-to-tag list'}), so the preview uses made-up values.` : 'No CSV loaded, so the preview uses made-up values.'}</>}
      </p>
      <div className="grid gap-1">
        <label htmlFor={placeId} className="text-sm text-muted">Your CSV columns are available in the template as</label>
        <Select id={placeId} value={st.csvPlace || 'both'} onValueChange={(v) => changePreviewSettings({ csvPlace: v })} options={PLACE} />
      </div>
      <div className="grid gap-1">
        <label htmlFor={numId} className="text-sm text-muted">Numbers in the CSV</label>
        <Select id={numId} value={st.csvNumbers || 'text'} onValueChange={(v) => changePreviewSettings({ csvNumbers: v })} options={NUMBERS} />
      </div>
      <Switch checked={st.previewSamples !== false} onCheckedChange={(on) => changePreviewSettings({ previewSamples: on })}>Fill fields missing from the data with made-up sample values (clearly marked)</Switch>
      <div>
        <Button icon={<Eye aria-hidden />} onClick={() => { setView('filled'); if (isNarrowNow()) useUi.getState().setDrawerOpen(false) }}>Open employee preview</Button>
      </div>
    </div>
  )
}

/**
 * Preview & export: is the template ready (every line links to the step that fixes it), the three downloads, how the preview
 * gets its values, and the values themselves.
 */
export function ExportStep() {
  const rev = useEngineRev()
  const wanted = useUi((s) => s.valuesWanted)
  const [valuesOpen, setValuesOpen] = useState(false)
  const valuesRef = useRef<HTMLDivElement>(null)
  // "Values" in the preview bar: unfold the values and bring them into view
  useEffect(() => {
    if (!wanted) return
    useUi.getState().setValuesWanted(false)
    setValuesOpen(true)
    requestAnimationFrame(() => valuesRef.current?.scrollIntoView({ block: 'start', inline: 'nearest', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }))
  }, [wanted])
  if (!es.an) return <EmptyState title="Load a letter first">Readiness, downloads and the employee preview appear once a letter is open.</EmptyState>
  const h = 'text-lg font-semibold'
  const valueCount = previewValues().rows.length
  return (
    <div className={cn('grid gap-9')}>
      <section aria-labelledby="ex-ready" className="grid gap-2">
        <h3 id="ex-ready" className={h}>Ready to export?</h3>
        <Readiness />
      </section>
      <section aria-labelledby="ex-dl" className="grid gap-3">
        <h3 id="ex-dl" className={h}>Download</h3>
        <Downloads />
      </section>
      <section aria-labelledby="ex-pv" className="grid gap-3">
        <h3 id="ex-pv" className={h}>Preview settings</h3>
        <PreviewSettings />
      </section>
      <div ref={valuesRef} className="scroll-mt-2">
        <Section title="Values in this preview" count={valueCount ? `(${valueCount})` : undefined} open={valuesOpen} onOpenChange={setValuesOpen}>
          <PreviewValues rev={rev} />
        </Section>
      </div>
    </div>
  )
}
