import { useState } from 'react'
import { useEngineRev } from '@/hooks/useEngine'
import { useUi } from '@/store'
import { Button, Notice } from '@/ui'
import { DataGroup } from './DataGroup'
import { LetterGroup } from './LetterGroup'
import { SaveGroup, type Report } from './SaveGroup'
import { TeamGroup } from './TeamGroup'

/**
 * The Document step: the client's letter, the employee data, what is saved, and (on claude.ai) the team library.
 * Groups are separated by space, not boxed. A file error from the engine shows at the top until the next file.
 */
export function DocStep() {
  useEngineRev()
  const error = useUi((s) => s.error)
  const setError = useUi((s) => s.setError)
  const [report, setReport] = useState<Report>(null)
  return (
    <div className="grid gap-10">
      {error && <Notice tone="err" action={<Button size="sm" variant="ghost" onClick={() => setError(null)}>Dismiss</Button>}>{error.message}</Notice>}
      <section aria-label="Client letter"><LetterGroup /></section>
      <section aria-label="Employee data"><DataGroup /></section>
      <section aria-label="Save your work"><SaveGroup report={report} onReport={setReport} /></section>
      <section aria-label="Team library"><TeamGroup onReport={(text) => setReport({ text })} /></section>
    </div>
  )
}
