import { CircleAlert, CircleCheck, Download, Play, Square, Table2, TriangleAlert, Upload } from 'lucide-react'
import { es, useEngineRev } from '@/hooks/useEngine'
import { useUi } from '@/store'
import { Badge, Button, Checkbox, EmptyState, Notice, Progress, Section, Spinner, VirtualList, cn } from '@/ui'
import { batchFixDefault, downloadBatchResults, notify, previewEmployee, runBatch, setTab, stopBatch } from '../../engine'
import { LevelBadge, MSG, Places } from './parts'
import { batchView, type BatchDone as Done } from './types'

const pl = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`

/** The full-check line under a finished test: what it did, never more than it confirmed. */
function RealLine({ real }: { real: Done['real'] }) {
  if (real.kind === 'none') return null
  const icon = real.kind === 'passed' ? <CircleCheck aria-hidden className="text-ok" />
    : real.kind === 'failed' || real.kind === 'error' ? <CircleAlert aria-hidden className="text-err" />
    : <Spinner className="text-muted" />
  return (
    <p role="status" data-real={real.kind} className="flex items-start gap-2 text-base">
      <span className="mt-0.5 flex">{icon}</span><span className="min-w-0">{real.text}</span>
    </p>
  )
}

/** Who passed and who did not: one row per employee, problems first. Only the rows in view are drawn (3000+ employees stay smooth). */
function EmployeeTable({ done }: { done: Done }) {
  const list = done.list
  const height = Math.min(list.length, 7) * 38 + 2
  const go = (i: number) => { useUi.getState().setDrawerOpen(false); previewEmployee(i) }
  return (
    <div>
      <div role="presentation" className="grid grid-cols-[1fr_auto_auto] gap-3 border-b border-hairline px-2 pb-1 text-xs font-semibold text-muted">
        <span>Employee</span><span className="w-24">Status</span><span className="w-[68px]"><span className="sr-only">Action</span></span>
      </div>
      <div style={{ height }}>
        <VirtualList items={list} estimateSize={38} getKey={(x) => x.i} label="Employees" className="h-full"
          renderItem={(x) => (
            <div className="grid grid-cols-[1fr_auto_auto] items-center gap-3 border-b border-hairline-soft px-2 py-1">
              <span className="min-w-0 truncate text-base" title={x.label}>{x.label}</span>
              <span className={cn('flex w-24 items-center gap-1.5 text-sm', x.n ? 'text-warn' : 'text-ok')}>
                {x.n ? <TriangleAlert aria-hidden /> : <CircleCheck aria-hidden />}{x.n ? pl(x.n, 'problem') : 'OK'}
              </span>
              <Button size="sm" className="w-[68px]" aria-label={`Preview ${x.label}`} onClick={() => go(x.i)}>Preview</Button>
            </div>
          )} />
      </div>
      {done.hasProblems && done.only && done.bad > 7 && <p className="mt-1 text-sm text-muted">Scroll for the rest.{done.canDownload ? ' Download the results for the full list.' : ''}</p>}
    </div>
  )
}

function Result({ done }: { done: Done }) {
  const toggleOnly = (on: boolean) => { es.batchOnlyBad = on; notify() }
  const rerun = <Button size="sm" onClick={() => runBatch()}>Run again</Button>
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4" data-batch="done">
      {done.stale && <Notice tone="warn" action={rerun}>The template changed after this test. Run it again for the current result.</Notice>}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-1.5">
        <p className="text-sm text-muted">
          {pl(done.total, 'employee')} tested in {done.seconds.toFixed(1)} s{done.cancelled ? ' (stopped early)' : ''}.
        </p>
        <RealLine real={done.real} />
      </div>
      {done.allClear && (
        <Notice tone="ok">
          <b>No problems found</b>
          <p className="mt-0.5 text-sm">Every employee's letter filled without a problem, and CompUp's engine filled them too. Before generating the cycle, preview one employee's PDF in CompUp.</p>
        </Notice>
      )}
      {done.pageOnly && (
        <Notice tone="info">
          <b>No problems found by the page's own test</b>
          <p className="mt-0.5 text-sm">The full check isn't available here, so this used the page's preview engine, not the one CompUp uses. Preview one employee's PDF in CompUp before generating the cycle.</p>
        </Notice>
      )}
      {done.hasProblems ? (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-base font-semibold">Employees</h3>
            <Checkbox checked={done.only} onCheckedChange={toggleOnly} className="text-sm">Only employees with problems</Checkbox>
          </div>
          <EmployeeTable done={done} />
        </div>
      ) : done.total > 0 && (
        <Section title={`Show all ${done.total} employees`} defaultOpen={false}><EmployeeTable done={done} /></Section>
      )}
      {done.groups.length > 0 && (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-1">
          <h3 className="text-base font-semibold">What went wrong</h3>
          <ul className="divide-y divide-hairline-soft">
            {done.groups.map((g, i) => (
              <li key={i} data-level={g.level} className="grid grid-cols-[minmax(0,1fr)] gap-2 py-3">
                <div className="flex items-center gap-2">
                  <LevelBadge level={g.level} label={g.label} />
                  {g.real && <Badge>Full check</Badge>}
                  <b className="tnum ml-auto text-sm">{pl(g.count, 'employee')}</b>
                </div>
                <p className={MSG} dangerouslySetInnerHTML={{ __html: g.html }} />
                {g.fixDefault && <div><Button size="sm" onClick={() => batchFixDefault(g.fixDefault)}>Add | default(0)</Button></div>}
                <Places chips={g.chips} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

/** Test every employee: fills the letter for each row of the data file and lists what would come out wrong. */
export function BatchSection() {
  useEngineRev()
  const v = batchView()
  const running = v.running
  const loadData = () => setTab('doc', { open: true })
  return (
    <Section title="Test every employee" count={v.stats}>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
        <p className="text-sm text-muted">Fills the letter for every employee in your data file and lists what would come out wrong: empty values, text where a number is needed, wrong date formats, placeholders left in, or a file Word can't open.</p>
        {!v.rows ? (
          <EmptyState icon={<Table2 aria-hidden />} title="No employee data loaded" className="rounded-panel border border-dashed border-hairline py-6"
            action={<Button size="sm" icon={<Upload aria-hidden />} onClick={loadData}>Load employee data</Button>}>
            {v.noRowsText}
          </EmptyState>
        ) : (
          <>
            {v.src && (
              <p className="text-sm text-muted" data-batch-src>
                <b className="font-semibold text-ink">{v.src.name}</b> · {pl(v.src.count, 'employee')}{v.src.filter ? ` of ${v.src.of} (only ${v.src.filter.col} = ${v.src.filter.value})` : ''}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="primary" disabled={running} icon={<Play aria-hidden />} onClick={() => runBatch()}>
                {v.rows ? `Test ${pl(v.rows, 'employee')}` : 'Test every employee'}
              </Button>
              {running && <Button icon={<Square aria-hidden />} onClick={() => stopBatch()}>Stop</Button>}
              {v.status === 'done' && v.done?.canDownload && <Button icon={<Download aria-hidden />} onClick={() => downloadBatchResults()}>Download results (.csv)</Button>}
            </div>
            {running && (
              <div className="grid grid-cols-[minmax(0,1fr)] gap-1" data-batch="running">
                <Progress value={v.progress.pct} label="Testing employees" />
                <p aria-live="off" className="tnum text-sm text-muted">{v.progress.done} of {v.progress.total}</p>
              </div>
            )}
            {v.status === 'error' && v.error && (
              <Notice tone="err">
                <b>The template can't be filled</b>
                <p className="mt-0.5 text-sm">{v.error.msg}{v.error.tag ? <> Near <code className="rounded-tag bg-tag-bg px-1 font-mono text-xs text-tag">{v.error.tag}</code>.</> : null}</p>
              </Notice>
            )}
            {v.status === 'done' && v.done && <Result done={v.done} />}
          </>
        )}
      </div>
    </Section>
  )
}
