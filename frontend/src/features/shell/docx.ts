import { downloadTemplate } from '../../engine'
import { useUi } from '@/store'

let timer: ReturnType<typeof setTimeout> | undefined

/**
 * Build and save the tagged .docx. The header button, the Preview & export step and the palette all call this, so they
 * show the same state: Building…, then a 2 second Downloaded. The engine toasts when errors will remain in the file.
 */
export async function runDownloadDocx(): Promise<boolean> {
  const { docx, setDocx } = useUi.getState()
  if (docx === 'busy') return false
  clearTimeout(timer)
  setDocx('busy')
  let saved = false
  try { saved = await downloadTemplate() } finally {
    if (saved) { setDocx('done'); timer = setTimeout(() => useUi.getState().setDocx('idle'), 2000) } else setDocx('idle')
  }
  return saved
}
