import { CircleCheck, SkipForward } from 'lucide-react'
import { useMemo, useState } from 'react'
import { es, useEngineRev } from '@/hooks/useEngine'
import { Button, FieldPicker } from '@/ui'
import { confirmRow, fieldPickerGroups, inventoryStats, rowContext, rowStatus, setFilter, setRowKey, setTab } from '../../engine'
import { locateRow, showRow } from './locate'

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
      <section data-testid="next-done" aria-label="All tagged" className="flex flex-col gap-3 rounded-panel bg-ok-wash p-5">
        <div className="flex items-start gap-3">
          <CircleCheck aria-hidden className="mt-0.5 size-6 shrink-0 text-ok" />
          <div>
            <h3 className="text-lg font-semibold text-ink">Everything has a tag</h3>
            <p className="mt-0.5 text-base text-muted">Look over the list once more, or go on to the conditions.</p>
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
  const skip = () => {
    const next = nextAfter(r.id, [...skipped, r.id])
    const all = [...skipped, r.id]
    setSkipped(list.every((x) => all.includes(x.id)) ? [r.id] : all)
    setDraft(null)
    go(next?.id)
  }

  return (
    <section data-testid="next-card" aria-label={status === 'check' ? 'Next to check' : 'Next to tag'} className="flex flex-col gap-4 rounded-panel border border-accent-line bg-panel p-5 shadow-key">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold text-accent">{status === 'check' ? 'Next to check' : 'Next to tag'}</h3>
        <span className="tnum text-sm text-muted">{left} left</span>
      </div>
      <div>
        <button type="button" onClick={() => locateRow(r.id, true)} title="Show it in the letter" className="block w-full break-words rounded-control text-left font-serif text-xl leading-snug hover:text-accent">{r.find}</button>
        {cx && (
          <p className="mt-2 break-words font-serif text-base leading-relaxed text-muted">
            {cx.before.length > 60 ? '…' : ''}{cx.before.slice(-60)}<mark className="rounded-[2px] bg-hl px-0.5 text-hl-ink">{cx.find}</mark>{cx.after.slice(0, 40)}{cx.after.length > 40 ? '…' : ''}
          </p>
        )}
        {times && <p className="mt-1.5 text-sm text-muted">{times}</p>}
      </div>
      <div className="flex flex-col gap-1.5">
        <span id="next-field-label" className="text-sm font-medium text-ink">{status === 'check' ? 'Suggested field' : 'Which employee field is this?'}</span>
        <FieldPicker id="next-field" aria-label="Employee field for the next placeholder" value={key} groups={groups} allowCustom placeholder="Pick or type a field" searchPlaceholder="Search fields or type a name"
          customLabel={(t) => `Use “${t}” as the field`} emptyText="No field matches. Keep typing to use your own name." onChange={(v) => setDraft({ id: r.id, key: v })} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" disabled={!key} onClick={tagIt} data-testid="next-tag">{status === 'check' && !picked ? 'Looks right' : 'Tag it'}</Button>
        <Button icon={<SkipForward aria-hidden />} variant="ghost" onClick={skip} disabled={list.length < 2} data-testid="next-skip">Skip</Button>
      </div>
    </section>
  )
}
