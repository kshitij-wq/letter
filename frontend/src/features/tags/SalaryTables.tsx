import { ChevronDown, Eye, Flag } from 'lucide-react'
import { Collapsible } from 'radix-ui'
import { useMemo } from 'react'
import { es, useEngineRev } from '@/hooks/useEngine'
import { Button, Checkbox, FieldPicker, Input, Section, Select, cn, type PickerGroup } from '@/ui'
import {
  COL_FMTS, commitTableHidePattern, fieldPickerGroups, notify, runTableAction, setTableColDivide12, setTableColFormat, setTableEnabled, setTableHideColumn, setTableHideOn,
  setTableRowHide, setView, tableCellView, tableCounts, tableHideExample, tableRowHide, tableSummary, tablesOverview, typeTableCellKey, typeTableCellTag, typeTableHidePattern,
} from '../../engine'
import { useUi } from '@/store'
import { TagInput } from './TagInput'
import { useCollapsed } from './useCollapsed'

const frames = (fn: () => void) => requestAnimationFrame(() => requestAnimationFrame(fn))
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
const cellKey = (t: string, ri: number | string, ci: number | string) => `${t}-${ri}-${ci}`

/** Show a table in the letter: the Client letter view, scrolled to its first empty cell. */
export function showTable(tid: string) {
  useUi.getState().setDrawerOpen(false)
  const go = () => {
    const g = [...document.querySelectorAll<HTMLElement>('#paper .cell-ghost')].find((x) => x.dataset.t === tid)
    g?.scrollIntoView({ block: 'center', inline: 'nearest', behavior: reduced() ? 'auto' : 'smooth' })
  }
  if (es.view !== 'source') { setView('source'); frames(go) } else go()
}

/** A click on a table cell in the letter: open that table and put the cursor in the cell's field. */
export function focusCell(tid: string, ri: string | number, ci: string | number) {
  if (es.tColl.has(tid)) { es.tColl.delete(tid); notify() }
  const find = () => document.querySelector<HTMLElement>(`[data-cell="${cellKey(tid, ri, ci)}"]`)
  const go = () => {
    const el = find(); if (!el) return
    el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: reduced() ? 'auto' : 'smooth' })
    el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash')
    setTimeout(() => el.querySelector<HTMLElement>('[role="combobox"]')?.focus({ preventScroll: true }), 250)
  }
  frames(() => frames(go))
}

function CellBox({ t, row, col, groups }: { t: any; row: any; col: any; groups: PickerGroup[] }) {
  const v = tableCellView(t, row, col)
  if (v.na) return <p className="text-sm text-muted"><span className="font-medium">{col.header}</span> · Has text</p>
  const id = cellKey(t.id, row.ri, col.ci)
  const label = `${row.label} · ${col.header}`
  return (
    <div data-cell={id} className={cn('flex min-w-0 flex-col gap-1.5 rounded-control p-2 transition-colors duration-150', v.needs && t.enabled ? 'bg-warn-wash' : 'bg-hairline-soft')}>
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="truncate font-semibold text-muted">{col.header}</span>
        {v.needs && t.enabled
          ? <span className="inline-flex shrink-0 items-center gap-1 font-semibold text-warn"><Flag aria-hidden className="size-3" />Needs a tag</span>
          : v.src ? <span className="shrink-0 text-muted">{v.src}</span> : null}
      </div>
      <FieldPicker id={`tk-${id}`} aria-label={`${label} field`} value={v.key} groups={groups} allowCustom placeholder="Pick a field" searchPlaceholder="Search fields or type a name"
        customLabel={(x) => `Use “${x}” as the field`} onChange={(x) => typeTableCellKey(t, row, col.ci, x)} className="bg-panel" />
      <TagInput value={v.tag} aria-label={`${label} tag text`} placeholder="Tag in the cell" className={cn('h-7 bg-panel text-xs', v.edited && 'border-accent')}
        onValueChange={(x) => typeTableCellTag(t, row, col.ci, x)} />
    </div>
  )
}

function Options({ t }: { t: any }) {
  const sum = tableSummary(t)
  const open = es.tOpts.has(t.id)
  const ex = tableHideExample(t)
  return (
    <Collapsible.Root open={open} onOpenChange={(o) => { if (o) es.tOpts.add(t.id); else es.tOpts.delete(t.id); notify() }} className="border-t border-hairline-soft">
      <Collapsible.Trigger className="group/o flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors duration-150 hover:bg-hairline-soft">
        <ChevronDown aria-hidden className="shrink-0 text-muted transition-transform duration-150 group-data-[state=closed]/o:-rotate-90" />
        <span className="font-semibold">Format and row hiding</span>
        <span className="min-w-0 flex-1 truncate text-muted">{sum.fmt} · {sum.hide}</span>
      </Collapsible.Trigger>
      <Collapsible.Content className="flex flex-col gap-4 px-3 pb-3 pt-1">
        {t.cols.map((c: any) => (
          <div key={c.ci} className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold">{c.header}</span>
            <Select aria-label={`Number format for ${c.header}`} value={c.fmt} onValueChange={(v) => setTableColFormat(t, c.ci, v)} options={COL_FMTS.map(([value, label]) => ({ value, label }))} />
            <Checkbox checked={!!c.div12} onCheckedChange={(on) => setTableColDivide12(t, c.ci, on)} className="text-sm">Tags are annual, divide by 12</Checkbox>
          </div>
        ))}
        <div className="flex flex-col gap-2 border-t border-hairline-soft pt-3">
          <Checkbox checked={!!t.hide.on} onCheckedChange={(on) => setTableHideOn(t, on)}><b className="font-semibold">Hide a row when its value is empty or 0</b></Checkbox>
          {t.hide.on && (
            <div className="flex flex-col gap-2.5 pl-6">
              <label className="flex flex-col gap-1 text-sm text-muted">Check the value in
                <Select aria-label="Check the value in" value={String(t.hide.ci)} onValueChange={(v) => setTableHideColumn(t, +v)} options={t.cols.map((c: any) => ({ value: String(c.ci), label: c.header }))} />
              </label>
              <label className="flex flex-col gap-1 text-sm text-muted">Row shows when ({'{key}'} = that cell's tag)
                <Input mono value={t.hide.pattern} spellCheck={false} onChange={(e) => typeTableHidePattern(t, e.target.value)} onBlur={(e) => commitTableHidePattern(t, e.target.value)} />
              </label>
              <p className="text-sm text-muted">
                {ex && <>For {ex.label}: <code className="font-mono text-xs">{'{% if ' + ex.expr + ' %}'}</code> goes at the end of the row above and <code className="font-mono text-xs">{'{% endif %}'}</code> at the end of the row. </>}
                Totals and CTC rows are always shown unless you tick them.
              </p>
            </div>
          )}
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  )
}

function TableCard({ t, groups }: { t: any; groups: PickerGroup[] }) {
  const cnt = tableCounts(t)
  const collapsed = es.tColl.has(t.id)
  const toggle = () => { if (collapsed) es.tColl.delete(t.id); else es.tColl.add(t.id); notify() }
  return (
    <div data-table={t.id} className={cn('overflow-hidden rounded-panel border border-hairline-soft bg-panel', !t.enabled && 'opacity-80')}>
      <div className="flex items-center gap-1 pr-2">
        <button type="button" aria-expanded={!collapsed} aria-label={`${collapsed ? 'Expand' : 'Collapse'} table ${t.n}`} onClick={toggle}
          className="grid size-9 shrink-0 place-items-center text-muted transition-colors duration-150 hover:text-ink">
          <ChevronDown aria-hidden className={cn('transition-transform duration-150', collapsed && '-rotate-90')} />
        </button>
        <div className="min-w-0 flex-1 py-2">
          <Checkbox checked={!!t.enabled} onCheckedChange={(on) => setTableEnabled(t, on)}><span className="font-semibold">Table {t.n}</span>{t.corner ? <span className="text-muted"> · {t.corner}</span> : null}</Checkbox>
          <p className="tnum ml-6 text-xs text-muted">{cnt.done} of {cnt.all} cells tagged</p>
        </div>
        <Button size="sm" variant="ghost" icon={<Eye aria-hidden />} onClick={() => showTable(t.id)}>Show in letter</Button>
      </div>
      {!collapsed && (
        <>
          <Options t={t} />
          <div className="@container border-t border-hairline-soft px-3">
            {t.rows.map((r: any) => {
              const h = t.hide.on ? tableRowHide(t, r) : null
              return (
                <div key={r.ri} data-row={r.ri} className="border-b border-hairline-soft py-2.5 last:border-b-0">
                  <div className="mb-1.5 flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate text-base font-medium" title={r.label}>{r.label}</span>
                    {h && <Checkbox checked={h.on} onCheckedChange={(on) => setTableRowHide(t, r, on)} className="shrink-0 text-sm"><span title={h.title} className={cn('text-sm', h.on ? 'text-ink' : 'text-muted')}>{h.text}</span></Checkbox>}
                  </div>
                  <div className="grid gap-2 @[440px]:grid-cols-2">
                    {t.cols.map((c: any) => <CellBox key={c.ci} t={t} row={r} col={c} groups={groups} />)}
                  </div>
                </div>
              )
            })}
          </div>
          <div className="flex flex-wrap gap-2 border-t border-hairline-soft px-3 py-2.5">
            <Button size="sm" onClick={() => runTableAction(t, 'csv')}>Match CSV columns</Button>
            <Button size="sm" onClick={() => runTableAction(t, 'comp')}>Suggest CompUp component tags</Button>
            <Button size="sm" variant="ghost" onClick={() => runTableAction(t, 'clear')}>Clear all</Button>
          </div>
        </>
      )}
    </div>
  )
}

/** Tables with empty amount cells: each cell gets a field and a tag, with the format and row-hiding options. Shown only when the letter has such tables. */
export function SalaryTables() {
  const rev = useEngineRev()
  const [open, setOpen] = useCollapsed('tablesBlock', true)
  const groups = useMemo(() => fieldPickerGroups(), [rev])
  const tables = es.tables as any[]
  if (!tables.length) return null
  const ov = tablesOverview()
  return (
    <Section id="tablesBlock" title="Salary tables" count={`${ov.done} of ${ov.all} cells tagged`} open={open} onOpenChange={setOpen}>
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted">Tables with empty amount cells. Click a cell here or in the letter, then pick a field, or type your own tag.</p>
        {tables.map((t) => <TableCard key={t.id} t={t} groups={groups} />)}
      </div>
    </Section>
  )
}
