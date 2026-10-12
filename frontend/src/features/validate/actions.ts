import { es } from '@/hooks/useEngine'
import { useUi } from '@/store'
import { toast } from '@/ui'
import { cancelCondEdit, cancelSwitch, clearSelection, flashRow, rowStatus, setFilter, setTab } from '../../engine'
import { showPid } from '../paper/navigate'
import { closeInspector, openInspector } from '../shell/inspector'
import { isNarrowNow } from '../shell/useMedia'

/** What a category's button does (the old ckRunAct): go to the step where the problem is fixed, with the right list showing. */
export function runCategoryAction(cat: string) {
  const open = { open: true }
  if (cat === 'mapping' || cat === 'review') {
    const want = cat === 'mapping' ? 'need' : 'check'
    setTab('tags', open); setFilter(want)
    const r = (es.rows as { id: string; count: number }[]).find((r) => r.count && rowStatus(r) === want)
    if (r) flashRow(r.id)
  } else if (cat === 'fields') {
    setTab('tags', open); setFilter('all')
  } else if (cat === 'cells') {
    setTab('tags', open)
    // the salary tables are a section of the Tags & fields step: bring it into view once the step is drawn
    requestAnimationFrame(() => requestAnimationFrame(() => document.querySelector('[data-section="tables"], #salary-tables, #tablesBlock')?.scrollIntoView({ block: 'start', behavior: 'smooth' })))
  } else if (cat === 'conditions') {
    setTab('logic', open)
  }
}

/** Show the first place of a finding in the letter. On a phone the open panel would cover it, so it closes. */
export function locateIssue(locs: string[], alsoClose?: boolean) {
  if (!locs.length) return
  showPid(locs[0])
  if (alsoClose && isNarrowNow()) closeInspector()
}

const selecting = () => !!(es.sel.pids.length || es.sel.text || es.switchUi || es.inlineUi || es.condEdit)

/** Open one finding in the inspector (and bring its row into view in the list). Returns false when the letter is busy with something else. */
export function openIssue(index: number): boolean {
  const x = (es.issues || [])[index]
  if (!x) return false
  if (es.closing || es.placing) { toast('Finish or cancel what you are doing in the letter first.'); return false }
  if (selecting()) { cancelSwitch(); cancelCondEdit(); clearSelection(); es.inlineUi = null }
  if (isNarrowNow()) useUi.getState().setDrawerOpen(false)   // on a phone the step drawer would cover the panel
  openInspector('issue', { index, key: x.key })
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const li = [...document.querySelectorAll<HTMLElement>('[data-issue-key]')].find((e) => e.dataset.issueKey === x.key)
    if (!li) return
    li.scrollIntoView({ block: 'nearest', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
    li.classList.remove('flash'); void li.offsetWidth; li.classList.add('flash')
  }))
  return true
}

/** The Validate step: from a margin flag, a palette command or anywhere else. */
export function goToIssue(index: number) {
  setTab('check', isNarrowNow() ? undefined : { open: true })
  openIssue(index)
}
