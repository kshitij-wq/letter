import { CircleCheck, Plus, SearchX, Table2, Tag } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { es, useEngineRev } from '@/hooks/useEngine'
import { useUi } from '@/store'
import { Button, EmptyState, FilterChip, Input, Notice, Progress, SearchInput, confirm } from '@/ui'
import { FILTERS, acceptAllChecks, addManual, clearFilters, inventoryItems, inventoryStats, nextReviewId, oldTagNames, plural, setFilter, setSearch, tagsTodo } from '../../engine'
import { ClaudeBar } from './ClaudeBar'
import { ExistingTags } from './ExistingTags'
import { NextCard } from './NextCard'
import { TagList } from './TagList'
import { locateRow, showRow } from './locate'
import { showTable } from './SalaryTables'
import { openSection } from './useCollapsed'

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

/** Salary-table cells that still need a tag are part of the step's number: say so up front and open them from here. */
function TablesTodo() {
  const t = tagsTodo()
  if (!t.cells) return null
  const k = (t.tables as any[]).length
  const open = () => {
    openSection('tablesBlock')
    const first = (t.tables as any[])[0]
    setTimeout(() => {
      document.getElementById('tablesBlock')?.scrollIntoView({ block: 'start', behavior: 'smooth' })
      if (first) showTable(first.id)
    }, 80)
  }
  return (
    <Notice tone="warn" className="px-4 py-3 text-base" action={<Button size="sm" onClick={open} data-testid="tables-todo-open">Open</Button>}>
      <div data-testid="tables-todo">
        <b className="font-semibold"><Table2 aria-hidden className="mr-1.5 inline size-4 align-[-2px]" />Salary tables</b>
        <span className="block text-muted"><span className="tnum">{t.cells}</span> cell{t.cells === 1 ? '' : 's'} in {k} table{k === 1 ? '' : 's'} need a tag</span>
      </div>
    </Notice>
  )
}

/** The progress line and bar, Claude's suggestions, the "next to tag" card, then search, the filters and the whole list. */
export function Inventory() {
  useEngineRev()
  const stats = inventoryStats()
  const items = inventoryItems()
  const f = es.filter as string
  const q = (es.q as string) || ''
  const old = oldTagNames()
  const hasOld = old.total > 0
  const todo = tagsTodo()

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2.5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <p className="tnum text-lg" aria-live="polite">
            {hasOld && <span data-testid="existing-head"><b className="text-xl font-semibold">This letter already has {plural(old.total, 'tag')}</b></span>}
            {hasOld && stats.inDoc > 0 && <span className="text-muted"> · </span>}
            {stats.inDoc ? <><b className="text-xl font-semibold">{stats.tagged}</b> <span className="text-muted">of {stats.inDoc} {hasOld ? 'new words ' : ''}tagged</span></> : hasOld ? null : <span className="text-muted">No placeholders in the letter</span>}
            {todo.cells > 0 && <span className="text-muted"> · {todo.cells} table cell{todo.cells === 1 ? '' : 's'} to tag</span>}
          </p>
          {stats.check > 0 && <Button size="sm" variant="ghost" onClick={acceptAll}>Accept all suggestions</Button>}
        </div>
        {stats.inDoc > 0 && <Progress value={(stats.tagged / stats.inDoc) * 100} label={`${stats.tagged} of ${stats.inDoc} placeholders tagged`} className="h-2" />}
      </div>

      <TablesTodo />
      <ClaudeBar />
      <NextCard />
      <ExistingTags />

      {stats.all > 0 || stats.removed > 0 || !hasOld ? (
        <div className="flex flex-col gap-3">
        <h3 className="text-lg font-semibold">All placeholders</h3>
        <SearchInput value={q} onChange={setSearch} placeholder="Search text or field" label="Search placeholders by text or field" autoComplete="off" spellCheck={false} />
        <div role="group" aria-label="Filter placeholders" className="-mx-1 flex flex-wrap gap-0.5 px-1">
          {FILTERS.filter(([id]) => id !== 'removed' || stats.removed > 0 || f === 'removed').map(([id, label]) => (
            <FilterChip quiet key={id} pressed={f === id} onPressedChange={() => setFilter(id)} count={(stats as any)[id]}>{label}</FilterChip>
          ))}
        </div>
      </div>
      ) : null}

      {items.length ? <TagList items={items} /> : !stats.all && stats.removed > 0 && f !== 'removed' ? (
        <EmptyState icon={<Tag aria-hidden />} title="No placeholders left" action={<Button size="sm" onClick={() => setFilter('removed')}>Show removed</Button>}>
          {plural(stats.removed, 'text')} taken out of the list and left as plain text in the letter.
        </EmptyState>
      ) : !stats.all && hasOld ? (
        <div data-testid="already-tagged"><EmptyState icon={<CircleCheck aria-hidden />} title="This letter is already tagged">Click more words in the letter to add tags of your own.</EmptyState></div>
      ) : !stats.all ? (
        <EmptyState icon={<Tag aria-hidden />} title="No placeholders yet">Select text in the letter, or add it in "Other text to tag" below.</EmptyState>
      ) : (
        <EmptyState icon={<SearchX aria-hidden />} title="No placeholders match" action={<Button size="sm" onClick={clearFilters}>Clear filters</Button>}>
          Try another word, or show everything again.
        </EmptyState>
      )}
    </div>
  )
}
