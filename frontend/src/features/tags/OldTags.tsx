import { MapPin, Pencil, X } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { es, useEngineRev } from '@/hooks/useEngine'
import { Button, Checkbox, IconButton, Input, Section, Select, cn } from '@/ui'
import { addPrefixToTags, fieldLabel, oldTagNames, renameTag, renameTagTyped, replaceInTags, rewriteAmountTags, squash, tagOpParts, undoTagOp } from '../../engine'
import { scrollBehavior } from '../paper/navigate'
import { plainLine } from '../validate/plain'
import { getPicked, locateTag, setPicked, useOpenTag, usePicked, useTagPos } from './existing'
import { useCollapsed } from './useCollapsed'

const AMOUNT_FORMATS = [
  { value: 'dec0', label: "'{:.0f}'.format(x | default(0) | float) | indian_comma" },
  { value: 'indian', label: 'x | indian_comma' },
  { value: 'indian_round', label: '(x | float) | round(0) | int | indian_comma' },
  { value: 'intl', label: 'x | int_comma' },
]

const STATUS: Record<string, { text: string; tone: string }> = {
  csv: { text: 'In your data', tone: 'text-ok' },
  compup: { text: 'CompUp tag', tone: 'text-muted' },
  nocsv: { text: 'Not checked (no CSV)', tone: 'text-muted' },
  unknown: { text: 'Not in your data file', tone: 'text-err' },
}

/** What is wrong with the tags this name sits in, in everyday words (the page's own checks, reworded by the plain-language layer). */
function problemsOf(n: any): string[] {
  const marks = es.tagMarks as Map<string, { level: string; msg: string }> | null
  if (!marks || !marks.size) return []
  const out: string[] = []
  for (const p of n.places as { tag: string }[]) {
    const mk = marks.get(squash(p.tag))
    if (mk && (mk.level === 'error' || mk.level === 'warn')) { const t = plainLine(mk.msg); if (!out.includes(t)) out.push(t) }
  }
  return out
}

/** One tag name in the letter: its field, where it stands against the data file, any problem, Locate, and rename. */
export function NameRow({ n }: { n: any }) {
  const [editing, setEditing] = useState(false)
  const [to, setTo] = useState('')
  const picked = usePicked().has(n.id)
  const open = useOpenTag()
  const pos = useTagPos(n.id)
  const ref = useRef<HTMLLIElement>(null)
  const isOpen = open?.id === n.id
  useEffect(() => { if (isOpen) ref.current?.scrollIntoView({ block: 'nearest', behavior: scrollBehavior() }) }, [isOpen, open?.n])
  const st = STATUS[n.status] || STATUS.unknown
  const label = n.status === 'unknown' ? '' : fieldLabel(n.id)
  const problems = problemsOf(n)
  const submit = (e: FormEvent) => { e.preventDefault(); if (renameTagTyped(n.id, to)) { setEditing(false); setTo('') } }
  return (
    <li ref={ref} data-testid={`old-tag-${n.id}`} data-open={isOpen ? '' : undefined} className={cn('py-1.5', isOpen && '-mx-2 rounded-control bg-accent-wash px-2')}>
      <div className="flex items-center gap-2">
        <Checkbox checked={picked} onCheckedChange={(on) => setPicked(n.id, !!on)} className="relative [&_label]:sr-only">{`Select ${n.id}`}</Checkbox>
        <code className="min-w-0 truncate font-mono text-sm" title={n.id}>{n.id}</code>
        <span className="tnum shrink-0 text-xs text-muted">{n.count}×</span>
        <IconButton label={`Show ${n.id} in the letter`} size="sm" className="ml-auto" onClick={() => locateTag(n.id)}><MapPin aria-hidden /></IconButton>
        <IconButton label={`Rename ${n.id}`} size="sm" onClick={() => setEditing((e) => !e)}><Pencil aria-hidden /></IconButton>
      </div>
      <p className={cn('ml-6 flex flex-wrap items-center gap-x-2 text-xs', st.tone)}>
        <span>{label && label.toLowerCase() !== n.id.toLowerCase() ? <span className="text-ink">{label} · </span> : null}{st.text}{n.suggestion ? <> · did you mean <code className="font-mono">{n.suggestion}</code>?</> : null}{pos ? <span className="text-muted"> · showing {pos.index + 1} of {pos.count}</span> : null}</span>
        {n.suggestion && <Button size="sm" variant="ghost" className="-my-1 h-6 px-1.5 text-xs" onClick={() => renameTag(n.id, n.suggestion)}>Use {n.suggestion}</Button>}
      </p>
      {problems.map((p) => <p key={p} className="ml-6 text-xs text-err" data-testid="old-tag-problem">{p}</p>)}
      {editing && (
        <form onSubmit={submit} className="ml-6 mt-1.5 flex gap-2">
          <Input mono autoFocus value={to} onChange={(e) => setTo(e.target.value)} placeholder="Rename to…" aria-label={`New name for ${n.id}`} spellCheck={false} />
          <Button type="submit" disabled={!to.trim()}>Rename</Button>
        </form>
      )}
    </li>
  )
}

/** Clean up an older template: rename the tags it already has, add a prefix, rewrite amount tags in one format, find and replace inside tags. */
export function OldTags() {
  useEngineRev()
  const [open, setOpen] = useCollapsed('oldTagsBlock', false)
  const [prefix, setPrefix] = useState('custom_schema.')
  const [fmt, setFmt] = useState('dec0')
  const [find, setFind] = useState('')
  const [repl, setRepl] = useState('')
  const [regex, setRegex] = useState(false)
  const info = oldTagNames()
  if (!(info.total > 0 || info.ops.length > 0)) return null
  const names = info.names as any[]
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`
  const tools = 'flex flex-col gap-1.5'

  return (
    <Section title="Tags already in the letter" summary={`${plural(info.total, 'tag')}, ${plural(names.length, 'name')}. Add a prefix, change amount formats, find and replace.`} open={open} onOpenChange={setOpen}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted">The tags are listed at the top of this step. Here you can clean them up in one go: add a prefix such as <code className="font-mono text-xs">custom_schema.</code>, or rewrite amount tags in one go. Changes apply to the tags that were already in the uploaded letter.</p>
        <form className={tools} onSubmit={(e) => { e.preventDefault(); addPrefixToTags(prefix, [...getPicked()]) }}>
          <label htmlFor="old-prefix" className="text-sm font-medium">Add a prefix to the ticked tags (or all non-CompUp names)</label>
          <div className="flex gap-2">
            <Input id="old-prefix" mono value={prefix} onChange={(e) => setPrefix(e.target.value)} spellCheck={false} />
            <Button type="submit">Add prefix</Button>
          </div>
        </form>

        <form className={tools} onSubmit={(e) => { e.preventDefault(); rewriteAmountTags(fmt) }}>
          <label htmlFor="old-fmt" className="text-sm font-medium">Rewrite {plural(info.amountTags, 'amount tag')} in one format</label>
          <div className="flex gap-2">
            <Select id="old-fmt" aria-label="Format for amount tags" value={fmt} onValueChange={setFmt} options={AMOUNT_FORMATS} />
            <Button type="submit">Rewrite</Button>
          </div>
        </form>

        <form className={tools} onSubmit={(e) => { e.preventDefault(); replaceInTags(find, repl, regex) }}>
          <span className="text-sm font-medium" id="old-replace-h">Find and replace inside tags</span>
          <div className="flex flex-wrap gap-2" role="group" aria-labelledby="old-replace-h">
            <Input mono className="min-w-0 flex-1 basis-24" value={find} onChange={(e) => setFind(e.target.value)} placeholder="Find" aria-label="Find" spellCheck={false} />
            <Input mono className="min-w-0 flex-1 basis-24" value={repl} onChange={(e) => setRepl(e.target.value)} placeholder="Replace with" aria-label="Replace with" spellCheck={false} />
            <Button type="submit">Replace</Button>
          </div>
          <Checkbox checked={regex} onCheckedChange={setRegex} className="text-sm">Use a pattern (regular expression)</Checkbox>
        </form>

        {info.ops.length > 0 && (
          <div className="flex flex-col gap-1">
            <h3 className="text-sm font-medium">Changes made</h3>
            <ul className="divide-y divide-hairline-soft">
              {info.ops.map((op: any) => (
                <li key={op.id} className="flex items-center gap-2 py-1.5 text-sm">
                  <span className="min-w-0 flex-1 break-words">{tagOpParts(op).map((p: any, i: number) => 'c' in p ? <code key={i} className="font-mono text-xs">{p.c}</code> : <span key={i}>{p.t}</span>)}</span>
                  <IconButton label="Undo this change" size="sm" onClick={() => undoTagOp(op.id)}><X aria-hidden /></IconButton>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Section>
  )
}
