import { es, useEngineRev } from '@/hooks/useEngine'
import { Button } from '@/ui'
import { cancelCondEdit, cbFacts, cbNew, condEnglish, parseLogic, saveCondEdit } from '../../engine'
import { InspectorBody, InspectorFoot } from '../shell/Inspector'
import { ConditionBuilder, ConditionResult, type Cb } from './ConditionBuilder'
import { Code, Part, SelSummary } from './parts'
import { useBump } from './hooks'

/** Change the condition of an if / else if that is already in the letter. */
export function CondEditForm() {
  useEngineRev()
  const bump = useBump()
  const ce = es.condEdit
  if (!ce) return null
  if (!es.cb) es.cb = cbNew('')
  const cb = es.cb as Cb
  const facts = cbFacts(cb)
  const elif = ce.kw === 'elif'
  const en = condEnglish(parseLogic(ce.tag).expr) as string
  return (
    <>
      <InspectorBody>
        <SelSummary title={<><b className="font-semibold">{elif ? 'Else if' : 'If'}</b> condition now{en ? <>: shown when {en}</> : ''}</>}
          ctx={<Code className="bg-tag-bg text-tag">{ce.tag.slice(0, 100)}</Code>} />
        <Part title={elif ? 'Else show this part only when' : 'Show this part only when'}>
          <ConditionBuilder cb={cb} change={bump} facts={facts} />
        </Part>
        <ConditionResult cb={cb} facts={facts} />
      </InspectorBody>
      <InspectorFoot>
        <Button variant="primary" onClick={saveCondEdit}>Save condition</Button>
        <Button variant="ghost" onClick={cancelCondEdit}>Cancel</Button>
      </InspectorFoot>
    </>
  )
}
