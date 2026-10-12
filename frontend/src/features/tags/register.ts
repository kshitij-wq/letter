import { es } from '@/hooks/useEngine'
import { flashRow, on, setFilter, setTab } from '../../engine'
import { locatePlaceholder } from '../paper/navigate'
import { setPaperHandler } from '../paper/paperEvents'
import { openInspector } from '../shell/inspector'
import { registerInspector, registerStep } from '../shell/registry'
import { TagInspector } from './TagInspector'
import { TagsStep } from './TagsStep'

registerStep('tags', { Panel: TagsStep, hint: 'Every placeholder found in the letter, and its tag.' })
registerInspector('tag', { title: 'Placeholder', Panel: TagInspector })

// a click on a placeholder in the letter: go to Tags & fields, show every placeholder, open this one
setPaperHandler('placeholder', ({ id }) => {
  setTab('tags')
  if (es.filter !== 'all') setFilter('all')
  flashRow(id)
})
setPaperHandler('cell', () => { setTab('tags') })

// the engine asks to show a row (flashRow): open its panel and make sure it is in view in the letter
on('flashRow', ({ id }: { id: string }) => {
  openInspector('tag', { id })
  locatePlaceholder(id, false, 'nearest')
})
