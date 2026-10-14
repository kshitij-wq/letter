import { useUi } from '@/store'
import { confirm } from '@/ui'
import { downloadTemplate, exportGate } from '../../engine'
import { goToStep } from './commands'

let timer: ReturnType<typeof setTimeout> | undefined

type Left = { label: string; text: string; step: string }
const list = (xs: Left[]) => <ul className="mt-2 grid gap-1 text-left">{xs.map((x) => <li key={x.label}><b className="font-semibold">{x.label}</b>: {x.text}</li>)}</ul>

/** Errors block the download (and point at Validate); open warnings ask first. False means it was not saved. */
async function passGate(): Promise<boolean> {
  const { errors, warnings } = exportGate() as { errors: Left[]; warnings: Left[] }
  if (errors.length) {
    const go = await confirm({ title: 'Fix the errors first', body: <>These would break the letters, so the file is not downloaded yet.{list(errors)}</>, confirmLabel: 'Go to Validate', cancelLabel: 'Close' })
    if (go) goToStep('check')
    return false
  }
  if (!warnings.length) return true
  return confirm({ title: 'Download anyway?', body: <>Some things are still open:{list(warnings)}</>, confirmLabel: 'Download anyway', cancelLabel: 'Go back' })
}

/**
 * Build and save the tagged .docx, after the gate above. The header button, the Preview & export step and the palette all call this, so they
 * show the same state: Building…, then a 2 second Downloaded. The engine toasts when errors will remain in the file.
 */
export async function runDownloadDocx(): Promise<boolean> {
  const { docx, setDocx } = useUi.getState()
  if (docx === 'busy' || !(await passGate())) return false
  clearTimeout(timer)
  setDocx('busy')
  let saved = false
  try { saved = await downloadTemplate() } finally {
    if (saved) { setDocx('done'); timer = setTimeout(() => useUi.getState().setDocx('idle'), 2000) } else setDocx('idle')
  }
  return saved
}
