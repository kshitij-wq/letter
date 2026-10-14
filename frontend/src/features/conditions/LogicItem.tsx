import { ChevronDown, CircleAlert, Eye, X } from 'lucide-react'
import { useState } from 'react'
import { Badge, Button, IconButton, Input, Select, cn } from '@/ui'
import {
  PLACES, blockCountInfo, commitLogicText, deleteLogic, lgInfo, lgWord, logicSay, pageLabel, setLogicPlace, snippet, startCondEdit, typeLogicText,
} from '../../engine'
import { es } from '@/hooks/useEngine'
import { showPid } from '../paper/navigate'
import { Code } from './parts'
import { useSyncedText } from './hooks'

/** The paragraph a condition is labelled by: its own, or when that is an empty line, the first one after it that has text (the block it wraps). */
function labelPara(p: any): any {
  const paras = (es.an?.paras || []) as any[]
  if (!p || p.model.text.trim()) return p
  const i = paras.indexOf(p)
  for (let k = i + 1; i >= 0 && k < paras.length && k <= i + 30; k++) {
    if (!paras[k].fallback && paras[k].model.text.replace(/\{%[\s\S]*?%\}|\{#[\s\S]*?#\}/g, '').trim()) return paras[k]
  }
  return p
}

const PLACE_OPTIONS = (PLACES as Array<[string, string]>).map(([value, label]) => ({ value, label }))

/** The tag as typed (and where it goes), for the ones you added; read-only for the ones that were already in the letter. */
function JinjaBox({ e }: { e: any }) {
  const [text, setText] = useSyncedText(e.full)
  if (e.src !== 'you') {
    return (
      <div className="grid gap-1.5">
        <code className="rounded-tag border border-tag-line bg-tag-bg px-2 py-1 font-mono text-xs text-tag [overflow-wrap:anywhere]">{e.text}</code>
        <p className="text-sm text-muted">Already in the letter. Position can’t be changed here.</p>
      </div>
    )
  }
  return (
    <div className="grid gap-2">
      <label className="grid gap-1 text-sm text-muted">Tag
        <Input mono id={`lgt-${e.id}`} aria-label="Tag text" value={text} spellCheck={false}
          onChange={(ev) => { setText(ev.target.value); typeLogicText(e.id, ev.target.value) }}
          onBlur={(ev) => commitLogicText(e.id, ev.target.value)} />
      </label>
      {e.place === 'at'
        ? <p className="text-sm text-muted">Position: inside the paragraph</p>
        : (
          <label className="grid gap-1 text-sm text-muted">Position
            <Select id={`lgp-${e.id}`} aria-label="Where the tag goes" value={e.place} options={PLACE_OPTIONS} onValueChange={(p) => setLogicPlace(e.id, p)} />
          </label>
        )}
    </div>
  )
}

/** One tag of a condition block in the Conditions list: what it does in plain words, who gets it, where it is. */
export function LogicItem({ e }: { e: any }) {
  const [open, setOpen] = useState(false)
  const { label: problem, isCond } = lgInfo(e) as { label: string; isCond: boolean }
  const say = logicSay(e) as { lead?: string; en?: string; expr?: string; text?: string } | null
  const cnt = blockCountInfo(e) as { kind: string; text: string } | null
  const isEnd = e.kw === 'endif' || e.kw === 'endfor'
  const lp = labelPara(e.p)
  const page = pageLabel(lp) as string
  const depth: number = e.depth || 0

  return (
    <li data-lg-key={e.key} data-key={e.key} className="lg-item list-none border-b border-hairline-soft py-3 last:border-b-0">
      <div className={cn('grid grid-cols-[minmax(0,1fr)] gap-1.5', depth > 0 && 'border-l border-hairline pl-3')} style={depth > 0 ? { marginLeft: Math.min(depth, 4) * 12 } : undefined}>
        <div className="flex min-h-7 items-center gap-2">
          <Badge tone={isEnd ? 'neutral' : 'cond'}>{lgWord(e.kw)}</Badge>
          {problem && <Badge tone="err"><CircleAlert aria-hidden className="size-3" />{problem}</Badge>}
          <span className="flex-1" />
          {e.src === 'you' && <IconButton label="Delete this tag" size="sm" onClick={() => deleteLogic(e.id)}><X aria-hidden /></IconButton>}
        </div>
        {(say || cnt) && (
          <p className={cn('text-base leading-snug', !isCond && e.kw !== 'else' && 'text-muted')}>
            {say && (say.text ? say.text : <>{say.lead} {say.en ? say.en : <Code className="text-xs">{say.expr}</Code>}</>)}
            {say && cnt && <span aria-hidden className="px-1.5 text-muted">·</span>}
            {cnt && <span title="Employees in your data file who get this part of the letter" className={cn('tnum text-sm', cnt.kind === 'none' ? 'font-medium text-warn' : 'text-muted')}>{cnt.text}</span>}
          </p>
        )}
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => showPid(e.pid)} title="Show in the letter" aria-label={`Show in the letter: ${page} ${snippet(lp, 34)}`}
            className="-ml-1 flex min-w-0 flex-1 items-center gap-1.5 rounded-control px-1 py-1 text-left text-sm text-muted transition-colors duration-150 hover:bg-hairline-soft hover:text-ink">
            <Eye aria-hidden className="shrink-0" />
            {page && <span className="tnum shrink-0 font-medium">{page}</span>}
            <span className="min-w-0 flex-1 truncate">“{snippet(lp, 34)}”</span>
          </button>
          {isCond && <Button size="sm" variant="secondary" className="shrink-0" onClick={() => startCondEdit(e.key)}>Change condition</Button>}
        </div>
        <details open={open} onToggle={(ev) => setOpen(ev.currentTarget.open)} className="group text-sm">
          <summary className="flex w-fit cursor-pointer select-none list-none items-center gap-1 rounded-control py-0.5 text-muted transition-colors hover:text-ink [&::-webkit-details-marker]:hidden">
            <ChevronDown aria-hidden className="size-3.5 transition-transform duration-150 group-not-open:-rotate-90" />
            {e.src === 'you' ? 'Jinja and position' : 'Jinja'}
          </summary>
          <div className="pt-2"><JinjaBox e={e} /></div>
        </details>
      </div>
    </li>
  )
}
