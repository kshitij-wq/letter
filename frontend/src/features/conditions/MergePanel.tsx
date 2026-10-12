import { Upload } from 'lucide-react'
import { es, useEngineRev } from '@/hooks/useEngine'
import { Button, Checkbox, DropZone, Input, Section, Select } from '@/ui'
import { COND_PRESETS, applyMerge, chooseLetterB, clearMerge, setMergeCond, setMergeHunkCond, setMergeInclude, setMergeLoose, setMergePreset } from '../../engine'
import { useSyncedText } from './hooks'

const PRESETS = (COND_PRESETS as Array<{ id: string; label: string; expr: string }>).filter((p) => p.expr).map((p) => ({ value: p.id, label: p.label }))
type Block = { text: string }
type Hunk = { a: number[]; b: number[] }

function Snip({ blocks, idx, tag }: { blocks: Block[]; idx: number[]; tag: 'A' | 'B' }) {
  const items = idx.map((i) => blocks[i]).filter((x) => x.text)
  return (
    <div className="min-w-0">
      <span className={`mr-1.5 inline-grid size-4 place-items-center rounded-badge text-xs font-semibold ${tag === 'A' ? 'bg-hairline-soft text-muted' : 'bg-info-wash text-info'}`}>{tag}</span>
      {items.length ? items.map((x, i) => <p key={i} className="mt-1 text-sm leading-snug text-muted">{x.text.slice(0, 150)}{x.text.length > 150 ? '…' : ''}</p>)
        : <span className="text-sm text-muted">(empty lines only)</span>}
    </div>
  )
}

function HunkCond({ k, mb }: { k: number; mb: any }) {
  const [v, setV] = useSyncedText(mb.conds[k] || '')
  return <Input mono id={`mgc-${k}`} aria-label="Condition for this difference" value={v} placeholder="Same condition as above (or type a different one)" spellCheck={false}
    onChange={(e) => { setV(e.target.value); setMergeHunkCond(k, e.target.value) }} />
}

function MergeBody({ mb }: { mb: any }) {
  const H: Hunk[] = mb.hunks || []
  const [cond, setCond] = useSyncedText(mb.cond || '')
  const picked = H.filter((_, k) => mb.include[k] !== false).length
  const sim = mb.similar && mb.similar.length
  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted">Compared with <b className="font-semibold text-ink">{mb.name}</b>.{sim ? ` ${sim} paragraph${sim > 1 ? 's differ' : ' differs'} only slightly and ${sim > 1 ? 'stay' : 'stays'} as in Letter A.` : ''}</p>
      <Checkbox checked={!!mb.loose} onCheckedChange={setMergeLoose}>Ignore small differences such as names and amounts</Checkbox>
      {H.length > 0 ? (
        <>
          <div className="grid gap-1.5">
            <label htmlFor="mgCond" className="text-base font-semibold">Use Letter A’s text when</label>
            <div className="flex gap-1.5">
              <Input id="mgCond" mono value={cond} placeholder={'e.g. employee_schema.promotion_needed | lower | trim == "yes"'} spellCheck={false} className="min-w-0 flex-1"
                onChange={(e) => { setCond(e.target.value); setMergeCond(e.target.value) }} />
              <Select aria-label="Condition presets" value="" placeholder="Presets…" options={PRESETS} className="w-[120px]" onValueChange={setMergePreset} />
            </div>
          </div>
          <ol className="grid">
            {H.map((h, k) => (
              <li key={k} className="grid gap-2 border-b border-hairline-soft py-3 last:border-b-0">
                <Checkbox checked={mb.include[k] !== false} onCheckedChange={(on) => setMergeInclude(k, on)}>
                  <b className="font-semibold">{h.a.length && h.b.length ? 'Different text' : h.a.length ? 'Only in Letter A' : 'Only in Letter B'}</b>
                </Checkbox>
                <div className="grid gap-2 pl-6">
                  {h.a.length > 0 && <Snip blocks={mb.A} idx={h.a} tag="A" />}
                  {h.b.length > 0 && <Snip blocks={mb.B} idx={h.b} tag="B" />}
                  <HunkCond k={k} mb={mb} />
                </div>
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap gap-2">
            <Button id="mgApply" variant="primary" disabled={!picked} onClick={applyMerge}>Merge {picked} into this letter</Button>
            <Button id="mgClear" onClick={clearMerge}>Remove Letter B</Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-muted">{mb.done ? 'Merged. The if / else tags are in the list above; edit their conditions there.' : 'No differences found.'}</p>
          <div><Button id="mgClear" onClick={clearMerge}>Remove Letter B</Button></div>
        </>
      )}
      {mb.done && (
        <p className="text-sm text-muted">Last merge: {mb.done.n} difference{mb.done.n > 1 ? 's' : ''}.{mb.done.images ? ` ${mb.done.images} image${mb.done.images > 1 ? 's' : ''} in Letter B’s text couldn’t be copied.` : ''}{mb.done.lists ? ' Numbered or bulleted paragraphs from Letter B use Letter A’s list styles, so check the numbering.' : ''}</p>
      )}
    </div>
  )
}

/** Combine two versions of a letter: what differs in Letter B becomes if / else blocks in this letter. */
export function MergePanel({ hasLetter }: { hasLetter: boolean }) {
  useEngineRev()
  if (!hasLetter) return null
  const mb = es.mergeB
  const n = mb && mb.hunks ? mb.hunks.length : 0
  return (
    <Section title="Combine two versions" count={mb ? `${n} difference${n === 1 ? '' : 's'}` : ''} defaultOpen={!!mb} className="border-t border-hairline-soft pt-4">
      <div className="grid gap-3">
        <p className="text-sm text-muted">Have two versions of this letter, such as with and without promotion? Upload the other one as Letter B. Paragraphs that differ become if / else blocks in this letter.</p>
        <DropZone label="Letter B (.docx): drop or click" accept=".docx" onFiles={(f) => { void chooseLetterB(f[0]) }}
          className="flex items-center gap-3 border border-dashed border-hairline px-3 py-2.5 hover:bg-hairline-soft">
          <Upload aria-hidden className="text-muted" />
          <span><span className="block text-base font-semibold">Letter B</span><span className="block text-sm text-muted">.docx · drop or click</span></span>
        </DropZone>
        {mb && <MergeBody mb={mb} />}
      </div>
    </Section>
  )
}
