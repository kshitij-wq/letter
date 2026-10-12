import { setTab } from '../../engine'
import { setPaperHandler } from '../paper/paperEvents'
import { openInspector } from '../shell/inspector'
import { registerInspector, registerStep } from '../shell/registry'
import { isNarrowNow } from '../shell/useMedia'
import { CheckStep } from './CheckStep'
import { IssueInspector } from './IssueInspector'

registerStep('check', { Panel: CheckStep, hint: 'Problems found before the letters go out.' })
registerInspector('issue', { title: 'Issue', Panel: IssueInspector })

// R2 (Validate): setFlagProvider(() => [...]) from '../paper/paperEvents' draws the lettered flags; this opens one.
setPaperHandler('flag', ({ index }) => {
  setTab('check', isNarrowNow() ? undefined : { open: true })
  openInspector('issue', { index })
})
