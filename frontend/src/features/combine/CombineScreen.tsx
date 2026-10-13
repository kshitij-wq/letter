import { ArrowDown, ArrowLeft, ArrowUp, FilePlus2, GitBranch, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { es, useEngineRev } from '@/hooks/useEngine'
import { Badge, Button, Checkbox, DropZone, IconButton, Input, Notice, cn } from '@/ui'
import { combineCancel, combineMove, combineMoveTo, combineRemove, combineSetBase, combineSetLabel, combineSetLoose, combineView } from '../../engine'
import { useSyncedText } from '../conditions/hooks'
import { LETTER_ACCEPT, combineNow, openVersions } from '../shell/openFile'

type Ver = { id: string; name: string; label: string; blocks: unknown[] }
type Group = { versions: string[]; english: string; cond: string; empty: boolean; texts: string[]; preview: string }
type Region = { index: number; after: string; groups: Group[] }
type View = { autoField: string; regions: Region[]; sameCount: number; differ: number; ready: boolean }

function VersionRow({ v, i, n, isBase, dragId, setDragId }: {
  v: Ver; i: number; n: number; isBase: boolean; dragId: string | null; setDragId: (id: string | null) => void
}) {
  const [label, setLabel] = useSyncedText(v.label)
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
    </li>
  )
}

function GroupCard({ g }: { g: Group }) {
  const [open, setOpen] = useState(false)
  const long = g.texts.join(' ').length > g.preview.length
  return (
    <div className="grid min-w-0 content-start gap-1.5 rounded-control border border-hairline-soft bg-panel p-3">
      <div className="flex flex-wrap gap-1">{g.versions.map((n) => <Badge key={n} tone={g.empty ? 'neutral' : 'cond'}>{n}</Badge>)}</div>
      {g.english && <p className="text-xs text-muted">When {g.english}</p>}
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
  const c = es.combine as { versions: Ver[]; base: number; loose: boolean; errors?: string[] }
  const [dragId, setDragId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const view = useMemo(() => combineView() as View, [rev]) // eslint-disable-line react-hooks/exhaustive-deps
  const n = c.versions.length
  const hint = n < 2 ? (n === 1 ? 'Add at least one more version to combine.' : 'Add the versions you want to combine.') : ''

  return (
    <section aria-labelledby="combine-title" data-testid="combine-screen" className="mx-auto grid w-full max-w-[880px] gap-6 px-5 py-8 max-[480px]:px-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-72">
          <h1 id="combine-title" className="text-balance text-xl font-semibold leading-tight">Combine several versions into one template</h1>
          <p className="mt-1 max-w-[62ch] text-muted">Text that is the same in every version stays once. Paragraphs that differ become if / else blocks. Each version is switched on <code className="font-mono">{view.autoField}</code>; change who gets which version later in Conditions.</p>
        </div>
        <Button data-testid="combine-cancel" icon={<ArrowLeft aria-hidden />} onClick={combineCancel}>{es.an ? 'Back to the letter' : 'Cancel'}</Button>
      </div>

      {c.errors && c.errors.length > 0 && <Notice tone="err"><span data-testid="combine-errors">{c.errors.join(' ')}</span></Notice>}

      <section aria-labelledby="combine-versions" className="grid gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="combine-versions" className="text-base font-semibold">Versions <span className="font-normal text-muted">({n})</span></h2>
          <DropZone multiple label="Add more versions (.docx)" accept={LETTER_ACCEPT} onFiles={(f) => { void openVersions(f) }} className="shrink-0">
            <span data-testid="combine-add" className="inline-flex h-10 items-center gap-1.5 rounded-control border border-hairline bg-panel px-3 font-semibold hover:bg-hairline-soft"><FilePlus2 aria-hidden />Add versions…</span>
          </DropZone>
        </div>
        {n === 0 ? <p className="text-sm text-muted">No versions yet.</p> : (
          <>
            <p className="text-sm text-muted">The base version keeps its page setup, header and footer. Drag a row or use the arrows to reorder.</p>
            <ol aria-label="Versions" className="grid">
              {c.versions.map((v, i) => <VersionRow key={v.id} v={v} i={i} n={n} isBase={c.base === i} dragId={dragId} setDragId={setDragId} />)}
            </ol>
          </>
        )}
        {hint && <div data-testid="combine-hint"><Notice>{hint}</Notice></div>}
      </section>

      {n >= 2 && (
        <>
          <section aria-labelledby="combine-diff-h" className="grid gap-3">
            <h2 id="combine-diff-h" className="flex items-center gap-2 text-base font-semibold"><GitBranch aria-hidden className="size-4 text-muted" />What differs</h2>
            <p data-testid="combine-summary" role="status" className="text-sm">
              <b className="font-semibold">{view.sameCount}</b> part{view.sameCount === 1 ? ' is' : 's are'} the same in every version · <b className="font-semibold">{view.differ}</b> place{view.differ === 1 ? '' : 's'} differ
            </p>
            <Checkbox checked={c.loose} onCheckedChange={(on) => combineSetLoose(on)}>Ignore small differences in numbers and spacing</Checkbox>
            <Differences view={view} />
          </section>
        </>
      )}

      <div className="sticky bottom-0 -mx-5 flex flex-wrap items-center gap-3 border-t border-hairline-soft bg-ground px-5 py-3 max-[480px]:-mx-4 max-[480px]:px-4">
        <Button variant="primary" data-testid="combine-go" disabled={!view.ready || busy} loading={busy}
          onClick={async () => { setBusy(true); try { await combineNow() } finally { setBusy(false) } }}>Combine into one template</Button>
        <span className="min-w-0 text-sm text-muted">{view.ready ? `Opens the base version with ${view.differ} if / else place${view.differ === 1 ? '' : 's'} on the Conditions step.` : hint}</span>
      </div>
    </section>
  )
}
