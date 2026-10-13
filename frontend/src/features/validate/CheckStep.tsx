import { FileUp, RefreshCw } from 'lucide-react'
import { useEngineRev } from '@/hooks/useEngine'
import { useUi } from '@/store'
import { Button, EmptyState, IconButton, Notice, Section } from '@/ui'
import { realCheck, server } from '../../engine'
import { LETTER_ACCEPT, openTagged, pickFile } from '../shell/openFile'
import { AskClaude } from './AskClaude'
import { BatchSection } from './BatchSection'
import { Counts, EngineLine, IssueGroups, Resolved } from './IssueList'
import { checkView } from './types'

/** Validate: the template's problems (the page's own checks and real Jinja's), then the test of every employee, then Claude. */
export function CheckStep() {
  useEngineRev()
  const v = checkView()
  const inspector = useUi((s) => s.inspector)
  const selectedKey = inspector?.kind === 'issue' ? (inspector.args.key as string) : null

  if (!v.hasLetter) return <EmptyState title="No letter yet">Open a letter in the Document step, then its problems are listed here.</EmptyState>

  return (
    <div className="grid gap-8">
      <Section title="Template check" count={v.stats}>
        <div className="grid gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" icon={<FileUp aria-hidden />} onClick={() => pickFile(LETTER_ACCEPT, openTagged)}>Check another tagged template…</Button>
            {server.ok && (
              <IconButton label="Re-check with real Jinja" size="sm" className="ml-auto" loading={server.checking} onClick={() => realCheck()}><RefreshCw aria-hidden /></IconButton>
            )}
          </div>
          <p className="text-sm text-muted">Problems with tags and conditions in this letter. A lettered flag in the letter's margin marks each one.</p>
          <EngineLine engine={v.engine} />
          <Counts counts={v.counts} />
          {v.clean && (
            <Notice tone="ok">
              <b>No problems found</b>
              <p className="mt-0.5 text-sm">{v.cleanText}</p>
            </Notice>
          )}
          <IssueGroups groups={v.groups} selectedKey={selectedKey} />
          <Resolved items={v.resolved} />
          {v.summary && <p className="text-sm text-muted">{v.summary}</p>}
        </div>
      </Section>
      <BatchSection />
      <AskClaude />
    </div>
  )
}
