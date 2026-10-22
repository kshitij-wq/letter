import { CircleAlert, CircleCheck, Flag, Info, LocateFixed, Minus, RotateCcw, Trash2, TriangleAlert, X } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { es, useEngineRev } from '@/hooks/useEngine'
import { Badge, Button, Checkbox, SegmentedControl, Select, confirm } from '@/ui'
import { useUi } from '@/store'
import { dataColumnFor, mergePlace, onlyHere, placeLabel, removeRow, rowPlaces, sameTextRow, setRowFormatAt, setRowKey, setRowKeyAt, setRowTagAt, tagKeyOf } from '../../engine'
import {
  ST_INFO, canConfirm, confirmRow, deleteRow, fieldPickerGroups, finalTag, formatOptions, inferNote, nextReviewId, noteFor, previewTag, resetRowTag, rowContext, rowEdited, rowNote,
  rowStatus, setRowEnabled, setRowFormat, setRowTag, tagProblem,
} from '../../engine'
import { plainLine } from '../validate/plain'
import { InspectorBody, InspectorFoot } from '../shell/Inspector'
import type { InspectorPanelProps } from '../shell/registry'
import { FieldSlots } from './FieldSlots'
import { TagInput } from './TagInput'
import { CustomToggle } from './CustomToggle'
import { locateRow, showRow, usePos } from './locate'
import { Around, ColumnHint } from './parts'

const TONE = { tagged: 'ok', check: 'warn', need: 'err', off: 'neutral' } as const
export const STATUS_ICON = { tagged: CircleCheck, check: TriangleAlert, need: Flag, off: Minus } as const

type Preview = Awaited<ReturnType<typeof previewTag>>

/** What the tag gives for the employee being previewed, or for made-up sample values. Re-checked a moment after each change. */
function usePreview(id: string, rev: number): Preview | null {
  const [pv, setPv] = useState<{ id: string; p: Preview } | null>(null)
  useEffect(() => {
    let dead = false
    const t = setTimeout(async () => {
      const r = (es.rows as any[]).find((x) => x.id === id)
      if (!r) return
      const p = await previewTag(r)
      if (!dead) setPv({ id, p })
    }, 140)
    return () => { dead = true; clearTimeout(t) }
  }, [id, rev])
  return pv && pv.id === id ? pv.p : null
}

const Heading = ({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) => (
  <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-semibold text-muted">{children}</label>
)

/** The placeholder panel: what the text is, the field and format it prints, what that gives, and the tag written into the letter. */
export function TagInspector({ args, close }: InspectorPanelProps) {
  const rev = useEngineRev()
  const id = String(args.id)
  const r = (es.rows as any[]).find((x) => x.id === id)
  const groups = useMemo(() => fieldPickerGroups(), [rev])
  const pos = usePos(id)
  const pv = usePreview(id, rev)
  // the same text in several places of the letter: change all of them, or only the one that was clicked or located
  const argPlace = args.place as { pid: string; s: number } | undefined
  const [mode, setMode] = useState<'all' | 'one'>(argPlace ? 'one' : 'all')
  useEffect(() => { setMode(argPlace ? 'one' : 'all') }, [id, argPlace?.pid, argPlace?.s])

  // a new letter, or the text was deleted: nothing to show
  useEffect(() => { if (!r) close() }, [r, close])
  if (!r) return <InspectorBody><p className="text-muted">This placeholder is no longer in the letter.</p></InspectorBody>

  const st = rowStatus(r) as keyof typeof TONE
  const Mark = STATUS_ICON[st]
  const cx = rowContext(r)
  const tag: string = finalTag(r)
  const problem: string = r.enabled ? tagProblem(tag) : ''
  const edited = rowEdited(r)
  const infer: string = inferNote(r)
  const notes = infer ? [infer, noteFor(r.key, r.extra)].filter(Boolean) : [rowNote(r)].filter(Boolean)
  const places = rowPlaces(id) as { pid: string; s: number; e: number; find: string; before: string; after: string }[]
  const many = r.scope === 'all' && places.length > 1
  const seen = argPlace ?? pos?.place ?? null
  const placeIdx = Math.max(0, seen ? places.findIndex((x) => x.pid === seen.pid && x.s === seen.s) : 0)
  const place = places[placeIdx]
  const here = many && mode === 'one' && place ? { pid: place.pid, s: place.s } : null
  const own = onlyHere(r)
  const sameRow = own ? sameTextRow(r) : null
  // an edit at one place makes a row of its own for that place; the panel follows it
  const follow = (nid: string | null) => { if (nid && nid !== id) useUi.getState().openInspector('tag', { id: nid }) }
  const changeKey = (k: string) => { if (here) follow(setRowKeyAt(id, here, k)); else setRowKey(id, k) }
  const changeTag = (v: string) => { if (here) follow(setRowTagAt(id, here, v)); else setRowTag(id, v) }
  const changeFormat = (v: string) => { if (here) follow(setRowFormatAt(id, here, v)); else setRowFormat(id, v) }
  const col: string = dataColumnFor(r.key)
  const times = r.count === 0 ? 'Not in the letter' : r.count === 1 ? 'Appears once' : `Appears ${r.count} times`

  const done = () => {
    close()
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-row-id="${CSS.escape(id)}"]`)?.focus({ preventScroll: true }))
  }
  const confirmMapping = () => {
    confirmRow(id)
    const next = nextReviewId(id)
    if (next) showRow(next) && locateRow(next, false)
  }
  const notPlaceholder = () => { close(); removeRow(id) }
  const sameTag = () => { close(); mergePlace(id) }
  const del = async () => {
    const ok = await confirm({ title: 'Delete this text from the list?', body: `“${r.find}” will no longer be tagged. The text itself stays in the letter.`, confirmLabel: 'Delete', danger: true })
    if (!ok) return
    close()
    deleteRow(id)
  }

  return (
    <>
      <InspectorBody className="gap-5">
        <section>
          <Heading>Text in the letter</Heading>
          <p className="break-words font-serif text-xl leading-snug">{r.find}</p>
          {cx && (
            <p className="mt-2 break-words rounded-control bg-hairline-soft px-2.5 py-1.5 font-serif text-base leading-snug text-muted">
              <Around cx={cx} after={30} />
            </p>
          )}
          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className="text-sm text-muted">{times}</span>
            <Button size="sm" icon={<LocateFixed aria-hidden />} disabled={!r.count} onClick={() => locateRow(id, true)}>Locate</Button>
            <span aria-live="polite" className="tnum text-sm text-muted">{pos && pos.count > 1 ? `Showing ${pos.index + 1} of ${pos.count}` : ''}</span>
          </div>
        </section>

        {many && (
          <section data-testid="place-choice">
            <Heading>Change</Heading>
            <SegmentedControl label="Change" size="sm" value={mode} onValueChange={setMode} items={[{ value: 'all', label: `All ${places.length} places` }, { value: 'one', label: 'Only this place' }]} />
            {place && (
              <p data-testid="place-label" className="mt-2 text-sm text-muted">
                {mode === 'one' ? 'Place' : 'Looking at place'} <span className="tnum">{placeIdx + 1} of {places.length}</span>: <span className="font-serif text-base text-ink">{placeLabel(place)}</span>
              </p>
            )}
            <p className="mt-1 text-sm text-muted">{mode === 'one' ? 'The other places keep this tag.' : `Every place changes together.`}</p>
          </section>
        )}
        {own && (
          <section data-testid="place-own">
            <Heading>Only this place</Heading>
            <p className="text-sm text-muted">This tag is for <span className="font-serif text-base text-ink">{placeLabel(r)}</span> only.</p>
            {sameRow && <Button size="sm" className="mt-2" icon={<RotateCcw aria-hidden />} onClick={sameTag} data-testid="place-merge">Use the same tag as the other places</Button>}
          </section>
        )}

        <section>
          <div className="flex items-center justify-between gap-2">
            <Badge tone={TONE[st]} className="h-6 gap-1.5 px-2 text-sm"><Mark aria-hidden className="size-3.5" />{ST_INFO[st].label}</Badge>
            {canConfirm(r) && <Button size="sm" variant="secondary" icon={<CircleCheck aria-hidden />} onClick={confirmMapping}>Confirm mapping</Button>}
          </div>
          {notes.length > 0 && <div className="mt-2 flex flex-col gap-0.5 text-sm text-muted">{notes.map((n, i) => <p key={i}>{n}</p>)}</div>}
        </section>

        <section>
          <Heading htmlFor="tag-key-0">Employee field</Heading>
          <FieldSlots id={id} fieldKey={r.key || ''} groups={groups} focusFirst={!!args.focus} onKey={changeKey} />
          {col && <ColumnHint testId="data-column-hint" className="mt-2" col={col} onUse={() => changeKey(tagKeyOf(col))} />}
          <CustomToggle className="mt-3" fieldKey={r.key || r.override || ''} onChange={changeKey} />
          {!r.key && <p className="mt-2 text-sm text-muted">{r.override ? 'No field chosen. This text uses a tag you wrote yourself.' : 'No field chosen yet.'}</p>}
          {r.scope === 'all' && r.count > 1 && !here && (
            <p className="mt-2.5 flex items-start gap-1.5 text-sm text-muted"><Info aria-hidden className="mt-px size-3.5 shrink-0" />Changing this updates all {r.count} places.</p>
          )}
        </section>

        <section>
          <Heading htmlFor="tag-format">Format</Heading>
          <Select id="tag-format" aria-label="Format" value={r.format} onValueChange={changeFormat} options={formatOptions(r)} />
          <p className="mt-1.5 text-sm text-muted">Money format applies to amounts.</p>
        </section>

        <section aria-live="polite">
          <Heading>{pv?.heading ?? 'Preview'}</Heading>
          <PreviewBox pv={pv} />
        </section>

        <section>
          <Heading htmlFor="tag-final">Tag written into the letter</Heading>
          <TagInput id="tag-final" multiline value={tag} invalid={!!problem} aria-describedby={problem ? 'tag-problem' : undefined}
            className={edited ? 'border-accent' : undefined} onValueChange={changeTag} />
          {problem && (
            <p id="tag-problem" role="status" className="mt-1.5 flex items-start gap-1.5 text-sm text-err"><CircleAlert aria-hidden className="mt-px size-3.5 shrink-0" /><span>{plainLine(problem)}</span></p>
          )}
          {edited && <Button size="sm" variant="ghost" className="mt-1.5" icon={<RotateCcw aria-hidden />} onClick={() => resetRowTag(id)}>Reset to generated tag</Button>}
        </section>
      </InspectorBody>
      <InspectorFoot className="flex-wrap">
        <Checkbox checked={!!r.enabled} onCheckedChange={(on) => setRowEnabled(id, on)}>Include in template</Checkbox>
        <div className="ml-auto flex items-center gap-2">
          {r.kind === 'Added'
            ? <Button size="sm" variant="danger" icon={<Trash2 aria-hidden />} onClick={del}>Delete</Button>
            : <Button size="sm" variant="ghost" icon={<X aria-hidden />} onClick={notPlaceholder} data-testid="insp-remove" title="Take it out of the list. The words stay in the letter as plain text.">Not a placeholder, remove</Button>}
          <Button size="sm" variant="primary" onClick={done}>Done</Button>
        </div>
      </InspectorFoot>
    </>
  )
}

function PreviewBox({ pv }: { pv: Preview | null }) {
  if (!pv) return <p className="text-sm text-muted">Checking…</p>
  const quiet = pv.kind === 'none' || pv.kind === 'empty'
  return (
    <div>
      {pv.kind === 'error' ? (
        <p className="flex items-start gap-1.5 text-base text-err"><CircleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" /><span>{pv.text}</span></p>
      ) : (
        <p className={quiet ? 'text-base italic text-muted' : 'break-words rounded-control bg-hairline-soft px-2.5 py-1.5 text-lg font-medium'}>{pv.text}</p>
      )}
      {pv.note && <p className={`mt-1.5 text-sm ${pv.warn ? 'text-warn' : 'text-muted'}`}>{pv.note}</p>}
    </div>
  )
}
