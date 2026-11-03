import { CircleCheck, Ellipsis, SkipForward, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { es, useEngineRev } from '@/hooks/useEngine'
import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, FieldPicker, IconButton } from '@/ui'
import { confirmRow, dataColumnFor, fieldPickerGroups, inventoryStats, removeRow, rowContext, rowStatus, setFilter, setRowKey, setTab, tagKeyOf, tagsTodo } from '../../engine'
import { CustomToggle } from './CustomToggle'
import { locateRow, showRow } from './locate'
import { Around, ColumnHint } from './parts'

/** The placeholders in the letter still waiting for a tag, then the ones with a suggestion to check. */
function pending(): any[] {
  const inDoc = (es.rows as any[]).filter((r) => r.count > 0)
  return [...inDoc.filter((r) => rowStatus(r) === 'need'), ...inDoc.filter((r) => rowStatus(r) === 'check')]
}

/**
 * "Next to tag": the one placeholder to work on now, with its sentence and the field picker right here. "Tag it" saves it and
 * moves on to the next one (the letter scrolls to it); "Skip" leaves it for later. When nothing is left it says so.
 */
export function NextCard() {
  const rev = useEngineRev()
  const groups = useMemo(() => fieldPickerGroups(), [rev])
  const [skipped, setSkipped] = useState<string[]>([])
  const [draft, setDraft] = useState<{ id: string; key: string } | null>(null)
  const stats = inventoryStats()
  const list = pending()
  const open = list.filter((r) => !skipped.includes(r.id))
  const r = open[0] ?? list[0]

  if (!stats.inDoc) return null
  if (!r) {
    return (
      <section data-testid="next-done" aria-label="All tagged" className="flex flex-col gap-3 rounded-panel bg-ok-wash p-4">
        <div className="flex items-start gap-3">
          <CircleCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-ok" />
          <div>
            <h3 className="text-base font-semibold text-ink">Everything has a tag</h3>
            <p className="mt-0.5 text-sm text-muted">{tagsTodo().cells > 0 ? `The list is done. ${tagsTodo().cells} salary table cell${tagsTodo().cells === 1 ? ' still needs' : 's still need'} a tag.` : 'Look over the list once more, or go on to the conditions.'}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => { setFilter('all'); const first = (es.rows as any[]).find((x) => x.count > 0); if (first && showRow(first.id)) locateRow(first.id, false) }}>Review all</Button>
          <Button onClick={() => setTab('logic')}>Next: Conditions</Button>
        </div>
      </section>
    )
  }

  const cx = rowContext(r)
  const status = rowStatus(r)
  const picked = draft && draft.id === r.id ? draft.key : null
  const key: string = picked ?? r.key ?? ''
  const col = dataColumnFor(key)
  const left = list.length
  const times = r.count > 1 ? `Appears ${r.count} times in the letter` : ''

  // the one after this: not the same row, not a skipped one if another is waiting
  const nextAfter = (id: string, skip: string[]) => {
    const rest = list.filter((x) => x.id !== id)
    return rest.find((x) => !skip.includes(x.id)) ?? rest[0]
  }
  const go = (id: string | undefined) => { if (id) requestAnimationFrame(() => locateRow(id, false)) }
  const tagIt = () => {
    if (!key) return
    const next = nextAfter(r.id, skipped)
    if (picked && picked !== r.key) setRowKey(r.id, picked); else if (status === 'check') confirmRow(r.id)
    setDraft(null)
    go(next?.id)
  }
  const notPlaceholder = () => {
    const next = nextAfter(r.id, skipped)
    removeRow(r.id)
    setDraft(null)
    go(next?.id)
  }
  const skip = () => {
    const next = nextAfter(r.id, [...skipped, r.id])
    const all = [...skipped, r.id]
    setSkipped(list.every((x) => all.includes(x.id)) ? [r.id] : all)
    setDraft(null)
    go(next?.id)
  }

  return (
    <section data-testid="next-card" aria-label={status === 'check' ? 'Next to check' : 'Next to tag'} className="flex flex-col gap-4 rounded-panel bg-panel p-4 ring-1 ring-hairline">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold text-ink">{status === 'check' ? 'Next to check' : 'Next to tag'}</h3>
        <span className="tnum text-sm text-muted">{left} left</span>
      </div>
      <div>
        <button type="button" onClick={() => locateRow(r.id, true)} title="Show it in the letter" className="block w-full break-words rounded-control text-left font-serif text-lg leading-snug hover:text-accent">{r.find}</button>
        {cx && (
          <p className="mt-1.5 break-words font-serif text-sm leading-relaxed text-muted">
            <Around cx={cx} after={40} />
          </p>
        )}
        {times && <p className="mt-1 text-xs text-muted">{times}</p>}
      </div>
      <div className="flex flex-col gap-1.5">
        <span id="next-field-label" className="text-sm text-muted">{status === 'check' ? 'Suggested field' : 'Which employee field is this?'}</span>
        <FieldPicker id="next-field" aria-label="Employee field for the next placeholder" value={key} groups={groups} allowCustom placeholder="Pick or type a field"
          onChange={(v) => setDraft({ id: r.id, key: v })} />
        {col && <ColumnHint testId="next-column" col={col} onUse={() => setDraft({ id: r.id, key: tagKeyOf(col) })} />}
        <CustomToggle fieldKey={key} compact className="mt-1" onChange={(k) => setDraft({ id: r.id, key: k })} />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Button variant="primary" disabled={!key} onClick={tagIt} data-testid="next-tag">{status === 'check' && !picked ? 'Looks right' : 'Tag it'}</Button>
        <Button icon={<SkipForward aria-hidden />} variant="ghost" onClick={skip} disabled={list.length < 2} data-testid="next-skip">Skip</Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild><IconButton label="More for this placeholder" className="ml-auto"><Ellipsis aria-hidden /></IconButton></DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem icon={<X aria-hidden />} onSelect={notPlaceholder} data-testid="next-remove" title="Take it out of the list. The words stay in the letter as plain text.">Not a placeholder</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </section>
  )
}
