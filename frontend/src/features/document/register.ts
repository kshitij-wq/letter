import { registerStep } from '../shell/registry'
import { DocStep } from './DocStep'

registerStep('doc', { Panel: DocStep, hint: 'The letter and its employee data.' })
