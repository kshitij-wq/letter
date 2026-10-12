import { ListChecks, Sparkles } from 'lucide-react'
import { es } from '@/hooks/useEngine'
import { useUi } from '@/store'
import { aiReady, aiReview } from '../../engine'
import { setFlagProvider, setPaperHandler } from '../paper/paperEvents'
import { goToStep } from '../shell/commands'
import { registerCommands, registerInspector, registerStep } from '../shell/registry'
import { goToIssue } from './actions'
import { CheckStep } from './CheckStep'
import { IssueInspector } from './IssueInspector'
import { flagList, issueByKey } from './types'

registerStep('check', { Panel: CheckStep, hint: 'Problems found before the letters go out.' })
registerInspector('issue', {
  title: (args) => { const x = issueByKey(String(args.key || '')); return x && x.letter ? `Issue ${x.letter}` : 'Issue' },
  Panel: IssueInspector,
})

// the lettered flags in the margin of the client letter: one per place a finding points at
setFlagProvider(() => {
  const open = useUi.getState().inspector
  const key = open && open.kind === 'issue' ? String(open.args.key || '') : ''
  return flagList().map((f) => ({ key: f.key, pid: f.pid, letter: f.letter, level: f.level, label: f.label, index: f.index, selected: !!key && key === f.issueKey }))
})
// a click on a flag: the Validate step, with that finding open
setPaperHandler('flag', ({ index }) => goToIssue(index))

registerCommands(() => {
  if (!es.an) return []
  const out = (es.issues || [])
    .filter((x: { level: string }) => x.level === 'error' || x.level === 'warn')
    .slice(0, 30)
    .map((x: { idx: number; key: string; letter: string; level: string; cat: string }) => {
      const it = issueByKey(x.key)
      return { id: `issue.${x.key}`, group: 'Issues', label: `${x.letter ? `${x.letter}: ` : ''}${it ? it.text.slice(0, 80) : 'Issue'}`, keywords: ['problem', 'error', 'warning', it ? it.catName : ''], icon: <ListChecks aria-hidden />, run: () => { goToStep('check'); goToIssue(x.idx) } }
    })
  if (aiReady()) out.push({ id: 'check.claude', group: 'Check', label: 'Review this template with Claude', keywords: ['ask', 'ai'], icon: <Sparkles aria-hidden />, run: () => { goToStep('check'); aiReview() } })
  return out
})
