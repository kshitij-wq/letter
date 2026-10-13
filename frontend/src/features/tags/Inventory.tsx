import { Plus, SearchX, Tag } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { es, useEngineRev } from '@/hooks/useEngine'
import { useUi } from '@/store'
import { Button, EmptyState, FilterChip, Input, Progress, SearchInput, confirm } from '@/ui'
import { FILTERS, acceptAllChecks, addManual, clearFilters, inventoryItems, inventoryStats, nextReviewId, setFilter, setSearch } from '../../engine'
import { ClaudeBar } from './ClaudeBar'
import { NextCard } from './NextCard'
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
export function AddForm() {
  const [text, setText] = useState('')
  const submit = (e: FormEvent) => { e.preventDefault(); const v = text.trim(); if (!v) return; addManual(v); setText('') }
  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <label htmlFor="tag-add" className="text-sm text-muted">Type words exactly as they appear in the letter. You can also select them in the letter.</label>
      <div className="flex gap-2">
        <Input id="tag-add" aria-label="Other text to tag" value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Rahul Sharma" autoComplete="off" />
        <Button type="submit" icon={<Plus aria-hidden />} disabled={!text.trim()}>Add</Button>
      </div>
    </form>
  )
}

/** The progress line and bar, Claude's suggestions, the "next to tag" card, then search, the filters and the whole list. */
export function Inventory() {
  useEngineRev()
  const stats = inventoryStats()
  const items = inventoryItems()
  const f = es.filter as string
  const q = (es.q as string) || ''

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2.5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <p className="tnum text-lg" aria-live="polite">
            {stats.inDoc ? <><b className="text-xl font-semibold">{stats.tagged}</b> <span className="text-muted">of {stats.inDoc} tagged</span></> : <span className="text-muted">No placeholders in the letter</span>}
          </p>
          {stats.check > 0 && <Button size="sm" variant="ghost" onClick={acceptAll}>Accept all suggestions</Button>}
        </div>
        {stats.inDoc > 0 && <Progress value={(stats.tagged / stats.inDoc) * 100} label={`${stats.tagged} of ${stats.inDoc} placeholders tagged`} className="h-2" />}
      </div>

      <ClaudeBar />
      <NextCard />

      <div className="flex flex-col gap-3">
        <h3 className="text-lg font-semibold">All placeholders</h3>
        <SearchInput value={q} onChange={setSearch} placeholder="Search text or field" label="Search placeholders by text or field" autoComplete="off" spellCheck={false} />
        <div role="group" aria-label="Filter placeholders" className="no-scrollbar -mx-1 flex gap-0.5 overflow-x-auto px-1 pb-0.5">
          {FILTERS.map(([id, label]) => (
            <FilterChip quiet key={id} pressed={f === id} onPressedChange={() => setFilter(id)} count={(stats as any)[id]}>{label}</FilterChip>
          ))}
        </div>
      </div>

      {items.length ? <TagList items={items} /> : !stats.all ? (
        <EmptyState icon={<Tag aria-hidden />} title="No placeholders yet">Select text in the letter, or add it in "Other text to tag" below.</EmptyState>
      ) : (
        <EmptyState icon={<SearchX aria-hidden />} title="No placeholders match" action={<Button size="sm" onClick={clearFilters}>Clear filters</Button>}>
          Try another word, or show everything again.
        </EmptyState>
      )}
    </div>
  )
}
