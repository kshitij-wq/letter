import { Plus, X } from 'lucide-react'
import { useId, type ReactNode } from 'react'
import { Badge, Button, IconButton, Select, confirm } from '@/ui'
import { chooseDataFilter, chooseDataFilterValue, chooseSampleRow, chooseSheet, clearData, downloadTagListTemplate, removeExtraFile } from '../../engine'
import { dataSummary, type DataExtra, type DataSummary } from './types'
import { DATA_ACCEPT, openData, pickFile } from '../shell/openFile'
import { DropArea } from './DropArea'

type Summary = DataSummary
type Extra = DataExtra
const ALL = '__all'
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`

/** A labelled control: the label above, quiet. */
function Field({ label, children, id }: { label: ReactNode; children: ReactNode; id?: string }) {
  return <div className="grid gap-1"><label htmlFor={id} className="text-sm text-muted">{label}</label>{children}</div>
}

/** Which sheet of an Excel workbook is used; when the workbook is no longer in memory the name is shown and the person is told to load it again. */
function SheetPick({ file, sheets }: { file: string; sheets: NonNullable<Summary['sheets']> }) {
  const id = useId()
  if (!sheets.canSwitch) return <p className="text-sm text-muted"><b className="font-semibold text-ink">{sheets.current}</b> (load the workbook again to switch sheets)</p>
  return (
    <Field label={`Sheet of ${sheets.book}`} id={id}>
      <Select id={id} value={sheets.current} onValueChange={(v) => chooseSheet(file, v)} options={sheets.names.map((n) => ({ value: n, label: n }))} />
    </Field>
  )
}

function extraText(x: Extra): string {
  if (x.kind === 'names') return `${plural(x.names, 'name')}`
  const unit = x.params ? 'parameter' : 'column'
  if (x.kind === 'one-row') return `${plural(x.columns, unit)} · one row, used for every employee in the preview`
  return `${plural(x.columns, unit)} · ${plural(x.rows, 'row')} · ${x.matchBy ? `${x.matched} of ${x.employees} employees matched by ${x.matchBy}` : 'no employee-code column to match on'}`
}

function Notes({ d }: { d: Summary }) {
  if (d.kind === 'mapping') return <p className="text-sm text-muted"><b className="font-semibold text-ink">Text-to-tag list.</b> {d.used} used in this letter{d.alias ? `, ${d.alias} kept as suggestions` : ''}.</p>
  if (d.kind === 'params') return <p className="text-sm text-muted"><b className="font-semibold text-ink">Params sheet.</b> Its names are in every tag list, and the preview uses these values (numbers stay numbers, as in a formula).</p>
  if (d.kind === 'keys') return <p className="text-sm text-muted"><b className="font-semibold text-ink">Tag list.</b> {d.keys} tags added to the suggestions.</p>
  return <p className="text-sm text-muted">The column names are in every tag list. Preview an employee in Preview &amp; export; test every employee in Validate.</p>
}

/** Which employees to use: everyone, or only those with one value in a column (such as the letter template). */
function FilterPick({ f }: { f: NonNullable<Summary['filter']> }) {
  const colId = useId(), valId = useId()
  const cur = f.columns.find((c) => c.col === f.col)
  return (
    <div className="grid gap-2">
      <Field label="Employees to use" id={colId}>
        <Select id={colId} value={f.col || ALL} onValueChange={(v) => chooseDataFilter(v === ALL ? '' : v)}
          options={[{ value: ALL, label: `All ${f.total} employees` }, ...f.columns.map((c) => ({ value: c.col, label: `Only where ${c.col} is…` }))]} />
      </Field>
      {cur && (
        <Field label={`Value of ${cur.col}`} id={valId}>
          <Select id={valId} value={cur.values.find((v) => v.value.toLowerCase() === f.value.toLowerCase())?.value ?? cur.values[0].value} onValueChange={chooseDataFilterValue}
            options={cur.values.map((v) => ({ value: v.value, label: `${v.value} (${v.count})` }))} />
          <p className="text-sm text-muted tnum">{f.shown} of {f.total}{f.auto ? " · picked from the letter's file name" : ''}</p>
        </Field>
      )}
    </div>
  )
}

/** Employee data (optional): the file, how the letter uses it, which employees, extra files. A file dropped here becomes the data. */
export function DataGroup() {
  const d = dataSummary()
  const sampleId = useId()
  const addFile = () => pickFile(DATA_ACCEPT, (f) => openData(f))
  const addExtra = () => pickFile(DATA_ACCEPT, (f) => openData(f, true))
  const remove = async () => {
    if (await confirm({ title: 'Remove the employee data?', body: 'Tags you mapped to its columns stay; previews switch to sample values.', confirmLabel: 'Remove', danger: true })) clearData()
  }
  return (
    <DropArea onFile={(f) => openData(f)}>
      <h3 className="flex items-center gap-2 text-base font-semibold">Employee data <Badge>Optional</Badge></h3>
      {d ? (
        <>
          <p className="mt-1 break-words" data-testid="data-name">{d.name}</p>
          <p className="text-sm text-muted tnum">{d.meta}</p>
        </>
      ) : (
        <>
          <p className="mt-1 text-muted">None loaded</p>
          <p className="mt-1 text-sm text-muted">Fills the preview, offers its column names as tags and lets you test every employee. Drop a CSV or Excel file here.</p>
        </>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" onClick={addFile}>{d ? 'Replace data…' : 'Add data file…'}</Button>
        <Button size="sm" variant="ghost" onClick={() => downloadTagListTemplate()}>Get CSV template</Button>
        {d && <Button size="sm" variant="danger" onClick={remove}>Remove</Button>}
      </div>

      {d && (
        <div className="mt-4 grid gap-3">
          <Notes d={d} />
          {d.kind === 'sample' && d.filter && <FilterPick f={d.filter} />}
          {d.sampleRows && (
            <Field label={`${d.sampleRows.used} ${d.sampleRows.used > 1 ? 'values from this row were' : 'value from this row was'} found in the letter and tagged`} id={sampleId}>
              <Select id={sampleId} value={String(d.sampleRows.current)} onValueChange={(v) => chooseSampleRow(+v)}
                options={d.sampleRows.options.map((o) => ({ value: String(o.index), label: o.label }))} />
            </Field>
          )}
          {d.sheets && <SheetPick file={d.name} sheets={d.sheets} />}

          {d.extras.length > 0 && (
            <ul className="grid gap-2">
              {d.extras.map((x) => (
                <li key={x.name} className="grid gap-2">
                  <div className="flex items-start gap-1">
                    <p className="min-w-0 flex-1 break-words text-sm"><b className="font-semibold">Also:</b> {x.name} <span className="text-muted">· {extraText(x)}</span></p>
                    <IconButton label={`Remove ${x.name}`} size="sm" side="left" className="-mt-0.5" onClick={() => removeExtraFile(x.name)}><X aria-hidden /></IconButton>
                  </div>
                  {x.sheets && <SheetPick file={x.name} sheets={x.sheets} />}
                </li>
              ))}
            </ul>
          )}
          {d.canAddExtra && (
            <div className="grid justify-items-start gap-1">
              <Button size="sm" variant="ghost" icon={<Plus aria-hidden />} onClick={addExtra}>Add another data file</Button>
              <p className="text-sm text-muted">For example the params sheet and the old-salary upload; rows are matched on employee code.</p>
            </div>
          )}
        </div>
      )}
    </DropArea>
  )
}
