import { GitBranch, X } from 'lucide-react'
import { es, useEngineRev } from '@/hooks/useEngine'
import { Badge, Button, EmptyState, IconButton, Notice } from '@/ui'
import { discardUnplaced, logicProblems, logicRows, logicWhere, snippet, startClosing, startPlacing } from '../../engine'
import { showPid } from '../paper/navigate'
import { LogicItem } from './LogicItem'
import { MergePanel } from './MergePanel'
import { Code } from './parts'

function Alerts() {
  const pr = logicProblems() as { open: any[]; stray: any[]; cells: any[]; unplaced: any[] }
  const show = (e: any) => <Button size="sm" onClick={() => showPid(e.pid)}>Show</Button>
  return (
    <>
      {pr.open.map((e) => (
        <Notice key={e.key} tone="err" action={<><Button size="sm" variant="primary" onClick={() => startClosing(e.key)}>Choose where it ends</Button>{show(e)}</>}>
          <Code className="bg-transparent px-0">{e.kw === 'for' ? 'for' : 'if'} {e.expr.slice(0, 60)}</Code> is not closed yet. Opened {logicWhere(e)}{e.src === 'doc' ? '(already in the letter) ' : ''}at “{snippet(e.p, 50)}”.{e.p.kind !== 'body' ? ' A header or footer needs its own end if.' : ''}
        </Notice>
      ))}
      {pr.stray.map((e) => (
        <Notice key={e.key} tone="err" action={show(e)}>
          <Code className="bg-transparent px-0">{e.text}</Code> {logicWhere(e)}has no open {e.kw === 'endfor' ? 'for' : 'if'} above it. Delete it, or add the {e.kw === 'endfor' ? 'for' : 'if'} before it.
        </Notice>
      ))}
      {pr.cells.map((e) => (
        <Notice key={e.key} tone="err" action={show(e)}>
          <Code className="bg-transparent px-0">{e.opener.text.slice(0, 50)}</Code> and its <Code className="bg-transparent px-0">{e.text}</Code> are in different table cells. In a table, keep both in the same cell.
        </Notice>
      ))}
      {pr.unplaced.length > 0 && (
        <Notice tone="warn">
          <p><b className="font-semibold">{pr.unplaced.length} tag{pr.unplaced.length > 1 ? 's' : ''} need{pr.unplaced.length > 1 ? '' : 's'} a place.</b> {pr.unplaced.length > 1 ? 'Their paragraphs aren’t' : 'Its paragraph isn’t'} in this version of the letter.</p>
          <ul className="mt-2 grid gap-2">
            {pr.unplaced.map((u: any, k: number) => (
              <li key={k} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <Code className="bg-transparent px-0">{String(u.text).slice(0, 70)}</Code>
                <span className="text-muted">{u.anchor && u.anchor.text ? `was at “${u.anchor.text.slice(0, 50)}”` : u.reason || ''}</span>
                <span className="ml-auto flex items-center gap-1">
                  <Button size="sm" onClick={() => startPlacing(k)}>Place it</Button>
                  <IconButton label="Discard this tag" size="sm" onClick={() => discardUnplaced(k)}><X aria-hidden /></IconButton>
                </span>
              </li>
            ))}
          </ul>
        </Notice>
      )}
    </>
  )
}

/** Conditions: every if / else / end if in the letter, in order, with problems on top; combine two versions at the bottom. */
export function LogicStep() {
  useEngineRev()
  const pr = logicProblems() as { probs: number; label: string; total: number }
  const rows = logicRows() as any[]
  const firstText = () => {
    const all = [...document.querySelectorAll<HTMLElement>('#paper p.lp.body')]
    const p = all.find((x) => (x.textContent || '').replace(/ /g, ' ').trim().length > 25) || all[0]
    if (p) { showPid(p.dataset.pid as string); p.focus({ preventScroll: true }) }
  }
  return (
    <div className="grid gap-6">
      <div className="grid gap-3">
        {pr.total > 0 && (
          <div className="flex items-center gap-2">
            <Badge tone={pr.probs ? 'err' : 'ok'}>{pr.label}</Badge>
          </div>
        )}
        {pr.total > 0 && <p className="text-sm text-muted">Click a paragraph in the letter to show it only for some employees. Select words to add a condition inside a sentence.</p>}
        <Alerts />
        {rows.length ? (
          <ol aria-label="Conditions in the letter" className="-mt-1">{rows.map((e) => <LogicItem key={e.key} e={e} />)}</ol>
        ) : (
          <EmptyState icon={<GitBranch aria-hidden />} title="No conditions yet"
            action={<Button id="lgStart" onClick={firstText}>Select a paragraph</Button>}>
            Pick a paragraph in the letter, then choose who should see it.
          </EmptyState>
        )}
      </div>
      <MergePanel hasLetter={!!es.an} />
    </div>
  )
}
