import { es } from '@/hooks/useEngine'
import { flashRow, on, setFilter, setTab } from '../../engine'
import { locatePlaceholder } from '../paper/navigate'
import { setPaperHandler } from '../paper/paperEvents'
import { registerInspector, registerStep } from '../shell/registry'
import './commands'
import { TagInspector } from './TagInspector'
import { TagsStep } from './TagsStep'
import { focusCell } from './SalaryTables'
import { showRow } from './locate'

registerStep('tags', { Panel: TagsStep, hint: 'Every placeholder in the letter and its tag. Click a word in the letter to tag it, or drag across several words.' })
registerInspector('tag', { title: 'Placeholder', Panel: TagInspector })

// a click on a placeholder in the letter: go to Tags & fields, show every placeholder, open this one
setPaperHandler('placeholder', ({ id }) => {
  setTab('tags')
  if (es.filter !== 'all') setFilter('all')
  flashRow(id)
})
// a click on the ghost tag in an empty table cell: open that table and put the cursor in the cell's field
setPaperHandler('cell', ({ t, ri, ci }) => {
  setTab('tags', { open: true })
  focusCell(t, ri, ci)
})

// the engine asks to show a row (flashRow): open its panel (with the cursor in the field if it has none yet) and make sure it is in view in the letter
on('flashRow', ({ id }: { id: string }) => {
  const r = (es.rows as any[]).find((x) => x.id === id)
  if (r && showRow(id, { focus: !r.key })) locatePlaceholder(id, false, 'nearest')
})
