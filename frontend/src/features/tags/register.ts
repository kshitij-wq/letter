import { es } from '@/hooks/useEngine'
import { flashRow, on, placeAt, setFilter, setTab } from '../../engine'
import { locatePlaceholder } from '../paper/navigate'
import { setPaperHandler } from '../paper/paperEvents'
import { registerInspector, registerStep } from '../shell/registry'
import './commands'
import { TagInspector } from './TagInspector'
import { TagsStep } from './TagsStep'
import { focusCell } from './SalaryTables'
import { markPlace, showRow, type Place } from './locate'
import { openTag, tagNameAt } from './existing'

registerStep('tags', { Panel: TagsStep, hint: 'Tag each placeholder below, or click words in the letter to tag them.' })
registerInspector('tag', { title: 'Placeholder', Panel: TagInspector })

// a click on a placeholder in the letter: go to Tags & fields, show every placeholder, open this one
setPaperHandler('placeholder', ({ id, pid, offset }) => {
  setTab('tags')
  if (es.filter !== 'all') setFilter('all')
  const at = pid != null && offset != null ? placeAt(id, pid, offset) : null
  flashRow(id, at ? { pid: at.pid, s: at.s } : undefined)
})
// a click on a yellow tag the letter already had: Tags & fields opens that tag's row (scrolled into view and highlighted)
setPaperHandler('tag', ({ pid, offset, el }) => {
  const id = tagNameAt(pid, offset)
  if (!id) return
  setTab('tags')
  openTag(id)
  el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1600)
})
// a click on the ghost tag in an empty table cell: open that table and put the cursor in the cell's field
setPaperHandler('cell', ({ t, ri, ci }) => {
  setTab('tags', { open: true })
  focusCell(t, ri, ci)
})

// the engine asks to show a row (flashRow): open its panel (with the cursor in the field if it has none yet) and make sure it is in view in the letter
on('flashRow', ({ id, place }: { id: string; place?: Place }) => {
  const r = (es.rows as any[]).find((x) => x.id === id)
  if (!r || !showRow(id, { focus: !r.key, place })) return
  // a click on one spot of the letter: it is already in view, and it is the spot being edited
  if (place) markPlace(id, place); else locatePlaceholder(id, false, 'nearest')
})
