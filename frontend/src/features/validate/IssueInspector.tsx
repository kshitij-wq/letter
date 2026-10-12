import { Search } from 'lucide-react'
import { useEffect } from 'react'
import { useEngineRev } from '@/hooks/useEngine'
import { useUi } from '@/store'
import { Badge, Button } from '@/ui'
import { notify, runIssueFix } from '../../engine'
import { InspectorBody, InspectorFoot } from '../shell/Inspector'
import type { InspectorPanelProps } from '../shell/registry'
import { locateIssue, runCategoryAction } from './actions'
import { FlagLetter, LevelBadge, MSG, Places } from './parts'
import { issueByKey } from './types'

/**
 * One finding in detail. It keeps the finding's stable key (not its index, which moves as findings come and go): when the
 * finding is gone (fixed, or another letter was opened) the panel closes by itself. The flag in the margin follows the panel.
 */
export function IssueInspector({ args, close }: InspectorPanelProps) {
  useEngineRev()
  const x = issueByKey(String(args.key || ''))
  // the margin flag of the open finding gets its ring: tell the letter to redraw when this panel comes and goes
  useEffect(() => { notify(); return () => notify() }, [])
  useEffect(() => { if (!x) useUi.getState().dismissInspector() }, [x])
  if (!x) return null
  return (
    <>
      <InspectorBody>
        <div className="flex flex-wrap items-center gap-2" data-level={x.level}>
          <FlagLetter letter={x.letter} level={x.level} />
          <LevelBadge level={x.level} label={x.label} />
          <span className="text-sm font-semibold text-muted">{x.catName}</span>
          {x.real && <Badge>Real Jinja</Badge>}
        </div>
        <p className={MSG} dangerouslySetInnerHTML={{ __html: x.html }} />
        <section className="grid gap-1.5">
          <h3 className="text-sm font-semibold text-muted">Where</h3>
          {x.hasLocs ? <Places chips={x.chips} more={x.moreTags} onShow={(pid) => locateIssue([pid], true)} /> : <p className="text-sm text-muted">Not tied to one place in the letter.</p>}
        </section>
        <section className="grid gap-1">
          <h3 className="text-sm font-semibold text-muted">Why it matters</h3>
          <p className="text-base leading-snug">{x.why}</p>
        </section>
        <section className="grid gap-1">
          <h3 className="text-sm font-semibold text-muted">How to fix</h3>
          <p className="text-base leading-snug">{x.how}</p>
        </section>
      </InspectorBody>
      <InspectorFoot className="flex-wrap">
        {x.hasLocs && <Button icon={<Search aria-hidden />} onClick={() => locateIssue(x.locs, true)}>Locate in the letter</Button>}
        {x.act && <Button onClick={() => runCategoryAction(x.cat)}>{x.act}</Button>}
        {x.fix && <Button variant="primary" className="ml-auto" onClick={() => runIssueFix(x.fix!.idx)}>{x.fix.label}</Button>}
        {!x.fix && <Button variant="ghost" className="ml-auto" onClick={close}>Done</Button>}
      </InspectorFoot>
    </>
  )
}
