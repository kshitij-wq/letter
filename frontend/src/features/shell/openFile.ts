import { confirm } from '@/ui'
import { es } from '@/hooks/useEngine'
import { useUi } from '@/store'
import { applyCombine, letterFileProblem, loadVersions, loadDataFile, loadSample, openLetterFile, openTaggedTemplate, replaceWarning, reportError, setView } from '../../engine'

/**
 * Opening files, with the same rules as the old page: a real letter with changes open asks before it is replaced
 * (its work is flushed to this browser's autosave first); the autosave-failed variant says the changes will be lost.
 */
async function okToReplace(): Promise<boolean> {
  const w = replaceWarning() as { lost: boolean; fileName: string } | null
  if (!w) return true
  return confirm({
    title: 'Replace the open letter?', confirmLabel: 'Replace letter', danger: w.lost,
    body: w.lost
      ? `Your changes to ${w.fileName} are not saved in this browser and will be lost.`
      : `Your work on ${w.fileName} stays in this browser's autosave and comes back if you open the same file again. The new letter starts fresh.`,
  })
}

/** The client's letter (a .docx). Resolves true when it was opened. */
export async function openLetter(file: File): Promise<boolean> {
  useUi.getState().setError(null)
  const bad = letterFileProblem(file.name)
  if (bad) { reportError(bad, 'letter'); return false }
  if (!(await okToReplace())) return false
  const ok = await openLetterFile(file)
  if (ok) setView('edit')   // a letter that was just opened starts in the editor
  return ok
}

/** The built-in sample letter, opened the same way. */
export async function openSample(): Promise<boolean> {
  const ok = await loadSample()
  if (ok) setView('edit')
  return ok
}

/** A template that is already tagged: opened straight into Validate. */
export async function openTagged(file: File): Promise<boolean> {
  useUi.getState().setError(null)
  if (!/\.docx$/i.test(file.name)) { reportError('Upload the tagged template as a Word .docx file.', 'letter'); return false }
  if (!(await okToReplace())) return false
  return openTaggedTemplate(file)
}

/** Employee data (.csv, .xlsx, .xls). `extra` adds a further file next to the first. */
export function openData(file: File, extra = false) { useUi.getState().setError(null); return loadDataFile(file, extra) }

/** Several client versions of one letter: opens the Combine screen. Resolves true when at least one file could be read. */
export async function openVersions(files: File[]): Promise<boolean> {
  useUi.getState().setError(null)
  const r = (await loadVersions(files)) as { added: number; errors: string[] }
  if (!r.added && !es.combine) { reportError(r.errors.join(' ') || 'Choose the versions as Word .docx files.', 'letter'); return false }
  return true
}

/** "Combine into one template": asks first when a letter with changes is open, then builds it. */
export async function combineNow(): Promise<boolean> {
  if (!(await okToReplace())) return false
  return !!(await applyCombine())
}

/** Opens the system file picker. Call it straight from a click or key handler (browsers only allow it then). */
export function pickFile(accept: string, onFile: (f: File) => void) {
  const input = document.createElement('input')
  input.type = 'file'; input.accept = accept
  input.onchange = () => { const f = input.files?.[0]; if (f) onFile(f) }
  input.click()
}

/** The same with several files allowed. */
export function pickFiles(accept: string, onFiles: (f: File[]) => void) {
  const input = document.createElement('input')
  input.type = 'file'; input.accept = accept; input.multiple = true
  input.onchange = () => { const f = [...(input.files || [])]; if (f.length) onFiles(f) }
  input.click()
}

export const LETTER_ACCEPT = '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document'
export const DATA_ACCEPT = '.csv,.xlsx,.xlsm,.xls,text/csv'
