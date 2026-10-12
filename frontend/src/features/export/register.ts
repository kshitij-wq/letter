import { registerCanvasSlot, registerStep } from '../shell/registry'
import { ExportStep } from './ExportStep'
import { PreviewBar } from './PreviewBar'

registerStep('export', { Panel: ExportStep, hint: 'Check the letter with an employee, then download it.' })
registerCanvasSlot('previewBar', PreviewBar)
