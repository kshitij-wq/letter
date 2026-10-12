import { CircleCheck, ListChecks, Plus, SearchX, Tag } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { es, useEngineRev } from '@/hooks/useEngine'
import { useUi } from '@/store'
import { Button, EmptyState, FilterChip, Input, SearchInput, confirm } from '@/ui'
import { FILTERS, acceptAllChecks, addManual, clearFilters, inventoryItems, inventoryStats, nextReviewId, setFilter, setSearch } from '../../engine'
import { ClaudeBar } from './ClaudeBar'
import { TagList } from './TagList'
import { locateRow, showRow } from './locate'

/** The next placeholder that needs a tag or a check, after the one that is open. */
export function reviewNext() {
  const cur = useUi.getState().inspector
  const id = nextReviewId(cur?.kind === 'tag' ? String(cur.args.id) : undefined)
  if (id && showRow(id)) locateRow(id, false)
}

/** Accept every suggestion that is still "To check" (asks first). */
export async function acceptAll() {
  const k = inventoryStats().check
  if (!k) return
  const ok = await confirm({ title: `Accept ${k} suggested tag${k === 1 ? '' : 's'}?`, body: "They'll be marked as reviewed. You can still change any of them.", confirmLabel: 'Accept all' })
  if (ok) acceptAllChecks()
}

/** Other text in the letter to tag: typed here, becomes a placeholder. */
function AddForm() {
  const [text, setText] = useState('')
  const submit = (e: FormEvent) => { e.preventDefault(); const v = text.trim(); if (!v) return; addManual(v); setText('') }
  return (
    <form onSubmit={submit} className="flex flex-col gap-1.5">
      <label htmlFor="tag-add" className="text-sm font-medium text-ink">Other text to tag</label>
      <div className="flex gap-2">
        <Input id="tag-add" value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Rahul Sharma" autoComplete="off" />
        <Button type="submit" icon={<Plus aria-hidden />} disabled={!text.trim()}>Add</Button>
      </div>
    </form>
  )
}

/** Search, the filter chips, the review buttons, the list and the "other text" form. */
export function Inventory() {
  useEngineRev()
  const stats = inventoryStats()
  const items = inventoryItems()
  const f = es.filter as string
  const q = (es.q as string) || ''
  const todo = stats.need + stats.check

  return (
    <div className="flex flex-col gap-3.5">
      <ClaudeBar />
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <p className="tnum text-base" aria-live="polite">
          {stats.inDoc ? <><b className="font-semibold">{stats.tagged}</b> <span className="text-muted">of {stats.inDoc} tagged</span></> : <span className="text-muted">No placeholders in the letter</span>}
        </p>
        {todo > 0 ? (
          <div className="flex items-center gap-2">
            {stats.check > 0 && <Button size="sm" onClick={acceptAll}>Accept all suggestions</Button>}
            <Button size="sm" variant="primary" icon={<ListChecks aria-hidden />} onClick={reviewNext}>Review next</Button>
          </div>
        ) : stats.inDoc > 0 ? (
          <span className="inline-flex items-center gap-1.5 text-sm text-ok"><CircleCheck aria-hidden />Everything has a tag</span>
        ) : null}
      </div>

      <SearchInput value={q} onChange={setSearch} placeholder="Search text or field" label="Search placeholders by text or field" autoComplete="off" spellCheck={false} />
      <div role="group" aria-label="Filter placeholders" className="flex flex-wrap gap-1.5">
        {FILTERS.map(([id, label]) => (
          <FilterChip key={id} pressed={f === id} onPressedChange={() => setFilter(id)} count={(stats as any)[id]}>{label}</FilterChip>
        ))}
      </div>

      {items.length ? <TagList items={items} /> : !stats.all ? (
        <EmptyState icon={<Tag aria-hidden />} title="No placeholders yet">Select text in the letter, or add it below.</EmptyState>
      ) : (
        <EmptyState icon={<SearchX aria-hidden />} title="No placeholders match" action={<Button size="sm" onClick={clearFilters}>Clear filters</Button>}>
          Try another word, or show everything again.
        </EmptyState>
      )}
      <AddForm />
    </div>
  )
}
