import { Button } from '@/ui'
import { InspectorBody, InspectorFoot } from '../shell/Inspector'
import type { InspectorPanelProps } from '../shell/registry'

/** R1 placeholder for the issue inspector (one finding in detail, opened from a margin flag). R2 (Validate) replaces this file. */
export function IssueInspector({ args, close }: InspectorPanelProps) {
  return (
    <>
      <InspectorBody><p className="text-muted">Issue {String(args.index ?? '')}</p></InspectorBody>
      <InspectorFoot><Button className="ml-auto" variant="primary" onClick={close}>Done</Button></InspectorFoot>
    </>
  )
}
