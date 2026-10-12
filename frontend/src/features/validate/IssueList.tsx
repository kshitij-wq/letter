import { CircleAlert, CircleCheck, ChevronRight, Info, TriangleAlert } from 'lucide-react'
import { Badge, Button, Section, Spinner, cn } from '@/ui'
import { runIssueFix } from '../../engine'
import { openIssue, runCategoryAction } from './actions'
import { FlagLetter, LevelBadge, MSG, Places } from './parts'
import type { CheckViewData as View, IssueItem as Item } from './types'

/** One line about what the real Jinja check did. Plain, no box: only the icon carries the colour. */
export function EngineLine({ engine }: { engine: View['engine'] }) {
  if (engine.kind === 'none') return null
  const icon = engine.kind === 'passed' ? <CircleCheck aria-hidden className="text-ok" />
    : engine.kind === 'failed' || engine.kind === 'error' ? <CircleAlert aria-hidden className="text-err" />
    : engine.kind === 'checking' ? <Spinner className="text-muted" /> : <Info aria-hidden className="text-muted" />
  return (
    <div role="status" data-engine={engine.kind} className="flex items-start gap-2 text-base">
      <span className="mt-0.5 flex">{icon}</span>
      <div className="min-w-0">
        <p className={cn('leading-snug', engine.kind === 'failed' && 'font-semibold')}>{engine.title}</p>
        {engine.detail && <p className="mt-0.5 text-sm text-muted">{engine.detail}</p>}
      </div>
    </div>
  )
}

/** Errors, warnings, resolved, notes: four plain counts. A zero is quiet. */
export function Counts({ counts }: { counts: View['counts'] }) {
  const one = (n: number, Icon: typeof Info, tone: string, a: string, b: string) => (
    <li className={cn('flex items-center gap-1.5', n ? 'text-ink' : 'text-muted')}>
      <Icon aria-hidden className={n ? tone : undefined} />
      <span className="tnum">{n}</span> {n === 1 ? a : b}
    </li>
  )
  return (
    <ul aria-label="Totals" className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
      {one(counts.errors, CircleAlert, 'text-err', 'error', 'errors')}
      {one(counts.warnings, TriangleAlert, 'text-warn', 'warning', 'warnings')}
      {one(counts.resolved, CircleCheck, 'text-ok', 'resolved', 'resolved')}
      {one(counts.notes, Info, 'text-info', 'note', 'notes')}
    </ul>
  )
}

function IssueRow({ x, selected }: { x: Item; selected: boolean }) {
  return (
    <li data-issue-key={x.key} data-level={x.level} aria-current={selected || undefined}
      className={cn('-mx-2 grid gap-2 rounded-control px-2 py-3 transition-colors duration-150', selected && 'bg-accent-wash')}>
      <div className="flex items-center gap-2">
        <FlagLetter letter={x.letter} level={x.level} />
        <LevelBadge level={x.level} label={x.label} />
        {x.real && <Badge>Real Jinja</Badge>}
      </div>
      <p className={MSG} dangerouslySetInnerHTML={{ __html: x.html }} />
      <Places chips={x.chips} more={x.moreTags} />
      <div className="flex flex-wrap items-center gap-1.5">
        {x.fix && <Button size="sm" onClick={() => runIssueFix(x.fix!.idx)}>{x.fix.label}</Button>}
        {x.act && <Button size="sm" variant="ghost" onClick={() => runCategoryAction(x.cat)}>{x.act}</Button>}
        <Button size="sm" variant="ghost" className="ml-auto" aria-label={`Details${x.letter ? ` for flag ${x.letter}` : ''}`}
          onClick={() => openIssue(x.idx)}>Details<ChevronRight aria-hidden /></Button>
      </div>
    </li>
  )
}

/** The findings, one group per category, worst first. */
export function IssueGroups({ groups, selectedKey }: { groups: View['groups']; selectedKey: string | null }) {
  if (!groups.length) return null
  return (
    <div className="grid gap-5">
      {groups.map((g) => (
        <section key={g.cat} aria-label={g.name} data-cat={g.cat}>
          <h3 className="flex items-center gap-2 text-base font-semibold">
            {g.name}
            <Badge shape="pill" tone={g.errors ? 'err' : g.warnings ? 'warn' : 'neutral'}>{g.items.length}</Badge>
          </h3>
          <ul className="divide-y divide-hairline-soft">
            {g.items.map((x) => <IssueRow key={x.key} x={x} selected={selectedKey === x.key} />)}
          </ul>
        </section>
      ))}
    </div>
  )
}

/** Findings that were fixed since the last check, kept so the flag letters stay meaningful. */
export function Resolved({ items }: { items: View['resolved'] }) {
  if (!items.length) return null
  return (
    <Section title="Resolved" count={items.length} defaultOpen={false}>
      <ul className="grid gap-2">
        {items.map((x) => (
          <li key={x.key} className="flex items-start gap-2 text-base text-muted">
            <CircleCheck aria-hidden className="mt-0.5 text-ok" />
            <span className="min-w-0 break-words">{x.letter && <><FlagLetter letter={x.letter} level="warn" quiet className="mr-1.5 inline-grid align-middle" /></>}{x.text}</span>
          </li>
        ))}
      </ul>
    </Section>
  )
}
