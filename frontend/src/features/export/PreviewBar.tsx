import { ArrowLeft, ChevronDown, ChevronLeft, ChevronRight, CircleAlert, CircleCheck, Table2, TriangleAlert } from 'lucide-react'
import { useEffect, useId, useMemo, useState } from 'react'
import { useEngineRev } from '@/hooks/useEngine'
import { useUi } from '@/store'
import { Badge, Button, IconButton, SearchInput, Spinner, cn } from '@/ui'
import { csvRows, empLabel, previewBarInfo, pvStep, setPvIdx, setPvQuery, setTab, setView, togglePvIssues } from '../../engine'
import { DATA_ACCEPT, openData, pickFile } from '../shell/openFile'

const LEVEL = { error: ['Fix', 'err'], warn: ['Check', 'warn'], info: ['Note', 'info'] } as const
type Info = ReturnType<typeof previewBarInfo>

/**
 * The employee list. A native select: it keeps the arrow keys, type-ahead and the phone's own picker, and it copes with a
 * few thousand people. Labels are worked out once per list, not on every step.
 */
function EmployeePick({ info }: { info: Info }) {
  const id = useId()
  const rows = csvRows()
  const { shown } = info.picker as { shown: number[] }
  const labels = useMemo(() => shown.map((i) => [i, empLabel(i)] as const), [rows, info.query, shown.length ? shown[0] : -1, shown.length]) // eslint-disable-line react-hooks/exhaustive-deps
  const cur = info.index
  const hasCur = labels.some(([i]) => i === cur)
  return (
    <div className="relative min-w-0 flex-1 basis-40">
      <select id={id} aria-label="Employee" value={shown.length ? cur : ''} disabled={!shown.length} onChange={(e) => setPvIdx(+e.target.value)}
        className="h-10 w-full appearance-none rounded-control border border-hairline bg-panel pl-2.5 pr-8 text-base text-ink transition-colors duration-150 hover:border-muted/50 focus-visible:border-accent focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-accent disabled:opacity-55">
        {!shown.length && <option value="">No employee matches</option>}
        {labels.map(([i, l]) => <option key={i} value={i}>{l}</option>)}
        {shown.length > 0 && !hasCur && <option value={cur}>{empLabel(cur)}</option>}
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-muted" />
    </div>
  )
}

/** The search box keeps its own text while you type: the engine's copy follows a moment later and must not move the cursor. */
function EmployeeSearch({ query }: { query: string }) {
  const [q, setQ] = useState(query)
  useEffect(() => { setQ(query) }, [query])
  return <SearchInput value={q} onChange={(v) => { setQ(v); setPvQuery(v) }} placeholder="Search employees" label="Search employees" autoComplete="off" spellCheck={false} className="min-w-[140px] flex-1 basis-40" />
}

function Status({ info }: { info: Info }) {
  const s = info.status
  if (s === 'loading') return <span className="inline-flex items-center gap-1.5 text-muted" role="status"><Spinner />Filling the letter…</span>
  if (s === 'error') return <span className="inline-flex items-center gap-1.5 font-semibold text-err" role="status"><CircleAlert aria-hidden />Can't fill the letter</span>
  if (s === 'bad' || s === 'meh') {
    const Icon = s === 'bad' ? CircleAlert : TriangleAlert
    return (
      <span className={cn('inline-flex items-center gap-1.5 font-semibold tnum', s === 'bad' ? 'text-err' : 'text-warn')} role="status">
        <Icon aria-hidden />{info.errs ? `${info.errs} problem${info.errs > 1 ? 's' : ''}` : ''}{info.errs && info.warns ? ' · ' : ''}{info.warns ? `${info.warns} to check` : ''}
      </span>
    )
  }
  return <span className="inline-flex items-center gap-1.5 text-ok" role="status"><CircleCheck aria-hidden />Looks fine</span>
}

/**
 * The bar above the Employee preview. It says whether the values are real or made up (never claims real data it does not
 * have), who is shown (search, previous, next), how the filled letter looks, and where to change the values.
 */
export function PreviewBar() {
  useEngineRev()
  const info = previewBarInfo()
  const issuesId = useId()
  const real = info.real
  return (
    <section aria-label="Employee preview" className="grid gap-2.5 rounded-panel bg-panel px-3 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        {real
          ? <Badge tone="ok" className="h-6 max-w-full px-2 text-sm"><CircleCheck aria-hidden /><span className="truncate">Real data · {info.csvName}</span></Badge>
          : <Badge tone="warn" className="h-6 px-2 text-sm"><TriangleAlert aria-hidden />SAMPLE DATA · made-up values</Badge>}
        <Button size="sm" variant="ghost" icon={<ArrowLeft aria-hidden />} onClick={() => setView('tagged')}>Back to tagged template</Button>
      </div>

      {real && (
        <div className="flex flex-wrap items-center gap-2">
          <EmployeeSearch query={info.query} />
          <div className="flex min-w-0 flex-[2_1_260px] items-center gap-1">
            <IconButton label="Previous employee" disabled={!info.canStep} onClick={() => pvStep(-1)}><ChevronLeft aria-hidden /></IconButton>
            <EmployeePick info={info} />
            <IconButton label="Next employee" disabled={!info.canStep} onClick={() => pvStep(1)}><ChevronRight aria-hidden /></IconButton>
          </div>
          {info.count && <span className="text-sm text-muted tnum" aria-live="polite" data-testid="pv-count">{info.count}</span>}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-base">
        <Status info={info} />
        {info.hasIssues && (
          <button type="button" aria-expanded={info.open} aria-controls={issuesId} disabled={!!info.error} onClick={togglePvIssues}
            className="rounded-control px-1 text-sm text-accent underline underline-offset-2 hover:text-accent-hover disabled:text-muted disabled:no-underline">
            {info.open ? 'Hide' : 'Show'} problems
          </button>
        )}
        <Button size="sm" className="ml-auto" icon={<Table2 aria-hidden />} aria-label="Show and change the values used in this preview"
          onClick={() => { useUi.getState().setValuesWanted(true); setTab('export', { open: true }) }}>Values</Button>
      </div>

      {info.open && (
        <ul id={issuesId} className="grid gap-2 text-sm">
          {info.error && (
            <li className="flex items-start gap-2"><Badge tone="err">Fix</Badge><span>{info.error.msg}{info.error.tag ? <> Near <code className="font-mono text-xs">{info.error.tag}</code>.</> : null}</span></li>
          )}
          {info.issues.map((x: { level: keyof typeof LEVEL; msg: string }, k: number) => (
            <li key={k} className="flex items-start gap-2"><Badge tone={LEVEL[x.level][1]}>{LEVEL[x.level][0]}</Badge><span className="min-w-0 break-words [&_code]:font-mono [&_code]:text-xs" dangerouslySetInnerHTML={{ __html: x.msg }} /></li>
          ))}
          {info.moreIssues > 0 && <li className="text-muted">and {info.moreIssues} more</li>}
        </ul>
      )}

      {real
        ? info.usedSample > 0 && <p className="text-sm text-muted">{info.usedSample} field{info.usedSample > 1 ? 's' : ''} in this letter {info.usedSample > 1 ? 'are' : 'is'} not in your data and use{info.usedSample > 1 ? '' : 's'} made-up sample values (dotted underline).</p>
        : (
          <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted">
            <span>Every value here is made up.{info.csvNoRows ? ' Your data file has no employee rows.' : ''}</span>
            <Button size="sm" variant="ghost" onClick={() => pickFile(DATA_ACCEPT, (f) => openData(f))}>Add employee data…</Button>
          </p>
        )}
    </section>
  )
}
