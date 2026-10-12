import { ArrowDown, ArrowLeft, ArrowUp, FilePlus2, GitBranch, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { es, useEngineRev } from '@/hooks/useEngine'
import { Badge, Button, Checkbox, DropZone, FieldPicker, IconButton, Input, Notice, Select, cn } from '@/ui'
import { combineCancel, combineMove, combineMoveTo, combineRemove, combineSet, combineSetBase, combineSetCond, combineSetLabel, combineView } from '../../engine'
import { useFieldGroups, useSyncedText } from '../conditions/hooks'
import { LETTER_ACCEPT, combineNow, openVersions } from '../shell/openFile'

type Ver = { id: string; name: string; label: string; blocks: unknown[]; cond: { mode: 'value' | 'raw' | 'else'; value: string; raw: string } }
type Problem = { text: string; id?: string }
type Group = { versions: string[]; english: string; cond: string; isElse: boolean; empty: boolean; texts: string[]; preview: string }
type Region = { index: number; after: string; groups: Group[] }
type View = { problems: Problem[]; regions: Region[]; sameCount: number; differ: number; ready: boolean }

const MODES = [
  { value: 'value', label: 'Field is…' },
  { value: 'raw', label: 'Typed condition' },
  { value: 'else', label: 'Everything else' },
]
const MATCH = [{ value: 'text', label: 'Match text' }, { value: 'number', label: 'Match number' }]

function VersionRow({ v, i, n, isBase, problems, dragId, setDragId }: {
  v: Ver; i: number; n: number; isBase: boolean; problems: Problem[]; dragId: string | null; setDragId: (id: string | null) => void
}) {
  const [value, setValue] = useSyncedText(v.cond.value)
  const [raw, setRaw] = useSyncedText(v.cond.raw)
  const [label, setLabel] = useSyncedText(v.label)
  const mine = problems.filter((p) => p.id === v.id)
  const bad = mine.length > 0
  const errId = `combine-err-${v.id}`
  return (
    <li data-testid={`combine-version-${i}`} draggable
      onDragStart={(e) => { setDragId(v.id); e.dataTransfer.effectAllowed = 'move' }} onDragEnd={() => setDragId(null)}
      onDragOver={(e) => { if (dragId) e.preventDefault() }}
      onDrop={(e) => { if (dragId) { e.preventDefault(); combineMoveTo(dragId, i); setDragId(null) } }}
      className={cn('grid gap-2 border-b border-hairline-soft py-3 last:border-b-0', dragId === v.id && 'opacity-50')}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex shrink-0 items-center">
          <IconButton label={`Move ${v.label} up`} size="sm" disabled={i === 0} onClick={() => combineMove(v.id, -1)}><ArrowUp aria-hidden /></IconButton>
          <IconButton label={`Move ${v.label} down`} size="sm" disabled={i === n - 1} onClick={() => combineMove(v.id, 1)}><ArrowDown aria-hidden /></IconButton>
        </div>
        <div className="min-w-0 flex-1 basis-40">
          <Input aria-label={`Name of version ${i + 1}`} data-testid={`combine-label-${i}`} value={label} onChange={(e) => { setLabel(e.target.value); combineSetLabel(v.id, e.target.value) }} />
          <p className="mt-0.5 truncate text-xs text-muted">{v.name} · {v.blocks.length} paragraph{v.blocks.length === 1 ? '' : 's'}</p>
        </div>
        <label className="flex shrink-0 items-center gap-1.5 text-sm">
          <input type="radio" name="combine-base" data-testid={`combine-base-${i}`} checked={isBase} onChange={() => combineSetBase(v.id)} className="size-4 accent-accent" />
          Base
        </label>
        <IconButton label={`Remove ${v.label}`} size="sm" onClick={() => combineRemove(v.id)}><Trash2 aria-hidden /></IconButton>
      </div>
      <div className="flex flex-wrap items-center gap-2 pl-0 sm:pl-[68px]">
        <Select aria-label={`When does ${v.label} apply`} size="sm" value={v.cond.mode} options={MODES} className="w-[150px]"
          onValueChange={(m) => combineSetCond(v.id, { mode: m })} />
        {v.cond.mode === 'value' && (
          <Input aria-label={`Value for ${v.label}`} data-testid={`combine-value-${i}`} value={value} placeholder="e.g. promotion" invalid={bad} aria-describedby={bad ? errId : undefined}
            className="h-7 min-w-0 flex-1 basis-40 text-sm" onChange={(e) => { setValue(e.target.value); combineSetCond(v.id, { value: e.target.value }) }} />
        )}
        {v.cond.mode === 'raw' && (
          <Input mono aria-label={`Condition for ${v.label}`} data-testid={`combine-raw-${i}`} value={raw} placeholder={'e.g. employee_schema.rating | float >= 4'} spellCheck={false} invalid={bad} aria-describedby={bad ? errId : undefined}
            className="h-7 min-w-0 flex-1 basis-56" onChange={(e) => { setRaw(e.target.value); combineSetCond(v.id, { raw: e.target.value }) }} />
        )}
        {v.cond.mode === 'else' && <span className="text-sm text-muted">Used when no other version applies.</span>}
      </div>
      {bad && <p id={errId} className="text-sm text-err sm:pl-[68px]">{mine.map((p) => p.text).join(' ')}</p>}
    </li>
  )
}

function GroupCard({ g }: { g: Group }) {
  const [open, setOpen] = useState(false)
  const long = g.texts.join(' ').length > g.preview.length
  return (
    <div className="grid min-w-0 content-start gap-1.5 rounded-control border border-hairline-soft bg-panel p-3">
      <div className="flex flex-wrap gap-1">{g.versions.map((n) => <Badge key={n} tone={g.empty ? 'neutral' : 'cond'}>{n}</Badge>)}</div>
      {g.english && <p className="text-xs text-muted">{g.isElse ? g.english : <>When {g.english}</>}</p>}
      {g.empty
        ? <p className="text-sm text-muted">Nothing here in {g.versions.length > 1 ? 'these versions' : 'this version'}.</p>
        : open
          ? <div className="grid gap-1">{g.texts.map((t, k) => <p key={k} className="break-words text-sm leading-snug">{t}</p>)}</div>
          : <p className="break-words text-sm leading-snug">{g.preview}</p>}
      {!g.empty && (long || g.texts.length > 1 || open) && (
        <div><Button size="sm" variant="ghost" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? 'Hide' : 'Show'}</Button></div>
      )}
    </div>
  )
}

function Differences({ view }: { view: View }) {
  if (!view.regions.length) return <p className="text-sm text-muted">No differences yet. Add the versions that differ.</p>
  return (
    <ol className="grid gap-5">
      {view.regions.map((r) => (
        <li key={r.index} data-testid={`combine-region-${r.index}`} className="grid gap-2">
          <h3 className="text-sm font-semibold">Place {r.index + 1}<span className="font-normal text-muted">{r.after ? ` · after “${r.after}”` : ' · at the start'}</span></h3>
          <div className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr))]">
            {r.groups.map((g, k) => <GroupCard key={k} g={g} />)}
          </div>
        </li>
      ))}
    </ol>
  )
}

/** The screen before the workspace when several client versions are being combined into one template. */
export function CombineScreen() {
  const rev = useEngineRev()
  const c = es.combine as { versions: Ver[]; base: number; field: string; match: string; loose: boolean; errors?: string[] }
  const groups = useFieldGroups(true)
  const [dragId, setDragId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const view = useMemo(() => combineView() as View, [rev]) // eslint-disable-line react-hooks/exhaustive-deps
  const n = c.versions.length
  const shownProblems = view.problems.filter((p) => !p.id)
  const hint = n < 2 ? (n === 1 ? 'Add at least one more version to combine.' : 'Add the versions you want to combine.') : ''

  return (
    <section aria-labelledby="combine-title" data-testid="combine-screen" className="mx-auto grid w-full max-w-[880px] gap-6 px-5 py-8 max-[480px]:px-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-72">
          <h1 id="combine-title" className="text-balance text-xl font-semibold leading-tight">Combine several versions into one template</h1>
          <p className="mt-1 max-w-[62ch] text-muted">Text that is the same in every version stays once. Paragraphs that differ become if / else blocks.</p>
        </div>
        <Button data-testid="combine-cancel" icon={<ArrowLeft aria-hidden />} onClick={combineCancel}>{es.an ? 'Back to the letter' : 'Cancel'}</Button>
      </div>

      {c.errors && c.errors.length > 0 && <Notice tone="err"><span data-testid="combine-errors">{c.errors.join(' ')}</span></Notice>}

      <section aria-labelledby="combine-versions" className="grid gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="combine-versions" className="text-base font-semibold">Versions <span className="font-normal text-muted">({n})</span></h2>
          <DropZone multiple label="Add more versions (.docx)" accept={LETTER_ACCEPT} onFiles={(f) => { void openVersions(f) }} className="shrink-0">
            <span data-testid="combine-add" className="inline-flex h-8 items-center gap-1.5 rounded-control border border-hairline bg-panel px-3 font-semibold hover:bg-hairline-soft"><FilePlus2 aria-hidden />Add versions…</span>
          </DropZone>
        </div>
        {n === 0 ? <p className="text-sm text-muted">No versions yet.</p> : (
          <>
            <p className="text-sm text-muted">The base version keeps its page setup, header and footer. Drag a row or use the arrows to reorder.</p>
            <ol aria-label="Versions" className="grid">
              {c.versions.map((v, i) => <VersionRow key={v.id} v={v} i={i} n={n} isBase={c.base === i} problems={view.problems} dragId={dragId} setDragId={setDragId} />)}
            </ol>
          </>
        )}
        {hint && <div data-testid="combine-hint"><Notice>{hint}</Notice></div>}
      </section>

      {n >= 2 && (
        <>
          <section aria-labelledby="combine-field-h" className="grid gap-2">
            <h2 id="combine-field-h" className="text-base font-semibold">Which field decides the version?</h2>
            <div className="flex flex-wrap items-center gap-2">
              <div className="min-w-0 flex-1 basis-64">
                <FieldPicker id="combine-field" aria-label="Field that decides the version" value={c.field} groups={groups} allowCustom placeholder="Choose a field, e.g. employee_schema.case" customLabel={(t) => `Use “${t}” as the field`}
                  onChange={(f) => combineSet('field', f)} />
              </div>
              <Select aria-label="How to compare" value={c.match} options={MATCH} className="w-[150px]" onValueChange={(m) => combineSet('match', m)} />
            </div>
            <p className="text-sm text-muted">Give each version the value of this field that should get it, or type your own condition.</p>
            {shownProblems.length > 0 && <p data-testid="combine-problems" className="text-sm text-err">{shownProblems.map((p) => p.text).join(' ')}</p>}
          </section>

          <section aria-labelledby="combine-diff-h" className="grid gap-3">
            <h2 id="combine-diff-h" className="flex items-center gap-2 text-base font-semibold"><GitBranch aria-hidden className="size-4 text-muted" />What differs</h2>
            <p data-testid="combine-summary" role="status" className="text-sm">
              <b className="font-semibold">{view.sameCount}</b> part{view.sameCount === 1 ? ' is' : 's are'} the same in every version · <b className="font-semibold">{view.differ}</b> place{view.differ === 1 ? '' : 's'} differ
            </p>
            <Checkbox checked={c.loose} onCheckedChange={(on) => combineSet('loose', on)}>Ignore small differences in numbers and spacing</Checkbox>
            <Differences view={view} />
          </section>
        </>
      )}

      <div className="sticky bottom-0 -mx-5 flex flex-wrap items-center gap-3 border-t border-hairline-soft bg-ground px-5 py-3 max-[480px]:-mx-4 max-[480px]:px-4">
        <Button variant="primary" data-testid="combine-go" disabled={!view.ready || busy} loading={busy}
          onClick={async () => { setBusy(true); try { await combineNow() } finally { setBusy(false) } }}>Combine into one template</Button>
        <span className="min-w-0 text-sm text-muted">{view.ready ? `Opens the base version with ${view.differ} if / else place${view.differ === 1 ? '' : 's'} on the Conditions step.` : (hint || 'Fix the points above first.')}</span>
      </div>
    </section>
  )
}
