import { Download, Eye, FileText, FileUp, Moon, Monitor, Redo2, ShieldCheck, Sun, Table2, Undo2, Users, Layers } from 'lucide-react'
import { es } from '@/hooks/useEngine'
import { useUi } from '@/store'
import { HISTORY, csvRows, downloadBatchResults, downloadMapping, downloadSetup, loadSample, redo, runBatch, scheduleRealCheck, server, setTab, setView, undo } from '../../engine'
import { runDownloadDocx } from './docx'
import { LETTER_ACCEPT, openLetter, pickFile } from './openFile'
import { registerCommands, type Command } from './registry'
import { revealSide, STEP_NAMES } from './StepBar'
import { isNarrowNow } from './useMedia'

const STEP_ORDER = ['doc', 'tags', 'logic', 'check', 'export'] as const
const VIEW_NAMES = { source: 'Client letter', tagged: 'Tagged template', filled: 'Employee preview' } as const

/** Go to a step and make sure its panel can be seen (unfolds the panel, or opens the drawer on a phone). */
export function goToStep(id: (typeof STEP_ORDER)[number]) { setTab(id); revealSide(isNarrowNow()) }

/** The palette's own commands. Only what is available right now is listed. Features add theirs with registerCommands. */
registerCommands(() => {
  const has = !!es.an
  const out: Command[] = []
  const theme = useUi.getState().theme
  const setTheme = useUi.getState().setTheme

  if (!has) {
    out.push({ id: 'letter.sample', group: 'Letter', label: 'Open the sample letter', icon: <FileText aria-hidden />, run: () => { loadSample() } })
    out.push({ id: 'letter.open', group: 'Letter', label: 'Choose a letter (.docx)…', icon: <FileUp aria-hidden />, run: () => pickFile(LETTER_ACCEPT, openLetter) })
  } else {
    for (const id of STEP_ORDER) if (id !== es.tab) out.push({ id: `step.${id}`, group: 'Go to', label: STEP_NAMES[id], keywords: ['step'], icon: <Layers aria-hidden />, run: () => goToStep(id) })
    for (const v of ['source', 'tagged', 'filled'] as const) if (v !== es.view) out.push({ id: `view.${v}`, group: 'View', label: VIEW_NAMES[v], keywords: ['letter', 'view', 'show'], icon: <Eye aria-hidden />, run: () => setView(v) })
    if (HISTORY.undo.length) out.push({ id: 'edit.undo', group: 'Edit', label: 'Undo', shortcut: 'Ctrl+Z', icon: <Undo2 aria-hidden />, run: undo })
    if (HISTORY.redo.length) out.push({ id: 'edit.redo', group: 'Edit', label: 'Redo', shortcut: 'Ctrl+Shift+Z', icon: <Redo2 aria-hidden />, run: redo })
    if (server.ok) {
      out.push({ id: 'check.real', group: 'Check', label: 'Run the real Jinja check', keywords: ['validate', 'docxtpl'], icon: <ShieldCheck aria-hidden />, run: () => { goToStep('check'); scheduleRealCheck() } })
      if (csvRows().length) out.push({ id: 'check.batch', group: 'Check', label: 'Test every employee', keywords: ['batch', 'employees'], icon: <Users aria-hidden />, run: () => { goToStep('check'); runBatch() } })
    }
    out.push({ id: 'dl.docx', group: 'Download', label: 'Download tagged .docx', keywords: ['export', 'template', 'save'], icon: <Download aria-hidden />, run: () => { runDownloadDocx() } })
    out.push({ id: 'dl.map', group: 'Download', label: 'Export mapping CSV', keywords: ['tags', 'table'], icon: <Table2 aria-hidden />, run: () => { downloadMapping() } })
    out.push({ id: 'dl.setup', group: 'Download', label: 'Download setup file', keywords: ['reuse', 'json'], icon: <Download aria-hidden />, run: () => { downloadSetup() } })
    if (es.batch && !es.batch.running && es.batch.perEmp) out.push({ id: 'dl.batch', group: 'Download', label: 'Download employee test results (.csv)', icon: <Download aria-hidden />, run: () => { downloadBatchResults() } })
    out.push({ id: 'letter.open', group: 'Letter', label: 'Open another letter…', icon: <FileUp aria-hidden />, run: () => pickFile(LETTER_ACCEPT, openLetter) })
  }
  const themes = [['system', 'System', Monitor], ['light', 'Light', Sun], ['dark', 'Dark', Moon]] as const
  for (const [v, name, Icon] of themes) if (v !== theme) out.push({ id: `theme.${v}`, group: 'Theme', label: `Theme: ${name}`, keywords: ['appearance', 'dark', 'light'], icon: <Icon aria-hidden />, run: () => setTheme(v) })
  return out
})
