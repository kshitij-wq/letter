import JSZip from 'jszip'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  addManual, build, canBeCustom, customReason, editPlace, finalTag, inventoryItems, inventoryStats, isCustomKey, loadDocx, mergePlace, placeLabel, removeRow, restoreRow, rowPlaces,
  rowStatus, selectWords, setCustomKey, setFilter, setRowKey, setRowKeyAt, state, stepInfo, tagSelectedWords, tagsTodo, tableCellsTodo, exportSetup, importSetup, setTab,
} from './index.js'
import { HISTORY, undo } from './undo.js'

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
const para = (p) => `<w:p>${Array.isArray(p) ? p.map((t) => `<w:r><w:t xml:space="preserve">${t}</w:t></w:r>`).join('') : `<w:r><w:t xml:space="preserve">${p}</w:t></w:r>`}</w:p>`
const cell = (t) => `<w:tc><w:p>${t ? `<w:r><w:t>${t}</w:t></w:r>` : ''}</w:p></w:tc>`
const table = (rows) => `<w:tbl>${rows.map((r) => `<w:tr>${r.map(cell).join('')}</w:tr>`).join('')}</w:tbl>`
async function docxOf(body, header = '') {
  const z = new JSZip()
  z.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
  z.file('word/document.xml', `<?xml version="1.0"?><w:document ${W}><w:body>${body}</w:body></w:document>`)
  if (header) z.file('word/header1.xml', `<?xml version="1.0"?><w:hdr ${W}>${para(header)}</w:hdr>`)
  return z.generateAsync({ type: 'arraybuffer' })
}
const LETTER = () => docxOf(
  para('Expleo/HR/PF/26-27/001') + para('Name') + para('Emp ID') + para('Dear Name,') + para('Your [Insert Name] is revised.') +
  table([['Component', 'Monthly', 'Annual'], ['Basic', '', ''], ['HRA', '', '']]),
  'Expleo header text')
const rowFor = (find) => state.rows.find((r) => r.find === find)
const doc = () => state.built.xml['word/document.xml']
const textOf = (xml) => xml.replace(/<[^>]+>/g, '')

beforeEach(async () => {
  localStorage.clear(); state.learned = {}; state.learnedCells = {}
  await loadDocx(await LETTER(), 'expleo.docx', false)
  setFilter('all')
})

describe('step badge and list agree', () => {
  it('the badge is the placeholders to do plus the empty table cells, both are findable', () => {
    const t = tagsTodo()
    const rows = state.rows.filter((r) => r.count && ['need', 'check'].includes(rowStatus(r))).length
    expect(t.rows).toBe(rows)
    expect(t.cells).toBe(4)
    expect(t.total).toBe(rows + 4)
    expect(stepInfo().info.tags.n).toBe(t.total)
    expect(tableCellsTodo().tables.length).toBe(1)
    expect(tableCellsTodo().tables[0].todo).toBe(4)
  })
})

describe('Not a placeholder', () => {
  it('takes a detected row out: plain text, not counted, stays out, restorable, one undo', () => {
    const r = rowFor('[Insert Name]')
    expect(r).toBeTruthy()
    const before = tagsTodo().total
    const marks = (s) => (s.match(/class="ph /g) || []).length
    const depth = HISTORY.undo.length
    expect(removeRow(r.id)).toBe(true)
    expect(HISTORY.undo.length).toBe(depth + 1)
    expect(rowFor('[Insert Name]')).toBeUndefined()
    expect(tagsTodo().total).toBe(before - 1)
    expect(inventoryStats().removed).toBe(1)
    // the letter keeps the words, with no placeholder around them
    build()
    expect(textOf(doc())).toContain('[Insert Name]')
    expect(doc()).not.toContain('{{')
    // it is not found again when the letter is read again, and it is saved in the setup
    const setup = JSON.parse(JSON.stringify(exportSetup()))
    expect(setup.edits[r.id].removed).toBe(true)
    importSetup(setup)
    expect(rowFor('[Insert Name]')).toBeUndefined()
    // the Removed list shows it and puts it back
    setFilter('removed')
    expect(inventoryItems().map((x) => x.find)).toEqual(['[Insert Name]'])
    setFilter('all')
    expect(restoreRow(r.id)).toBe(true)
    expect(rowFor('[Insert Name]')).toBeTruthy()
    expect(tagsTodo().total).toBe(before)
    expect(marks('')).toBe(0)
  })

  it('undo brings a removed row back in one step', () => {
    const r = rowFor('[Insert Name]')
    const before = tagsTodo().total
    removeRow(r.id)
    undo()
    expect(rowFor('[Insert Name]')).toBeTruthy()
    expect(tagsTodo().total).toBe(before)
  })

  it('a row the person added is deleted, not listed as removed', () => {
    addManual('Basic')
    const id = rowFor('Basic').id
    removeRow(id)
    expect(rowFor('Basic')).toBeUndefined()
    expect(inventoryStats().removed).toBe(0)
  })

  it('adding the same words again brings a removed row back', () => {
    const r = rowFor('[Insert Name]')
    removeRow(r.id)
    addManual('[Insert Name]')
    expect(rowFor('[Insert Name]')).toBeTruthy()
  })
})

describe('tag any text, anywhere', () => {
  const rangeOf = (needle, nth = 0) => {
    let n = 0
    for (const p of state.an.paras) {
      const t = p.model.text; let i = -1
      while ((i = t.indexOf(needle, i + 1)) >= 0) if (n++ === nth) return { pid: p.pid, s: i, e: i + needle.length, text: needle }
    }
    return null
  }
  it('words inside a detected placeholder get a tag of their own at that spot', () => {
    const r = rangeOf('Insert')
    selectWords('Insert', r)
    const id = tagSelectedWords()
    expect(id).toBe(`o:${r.pid}:${r.s}`)
    expect(rowFor('Insert')).toBeTruthy()
    expect(rowFor('[Insert Name]')).toBeTruthy()   // the placeholder is still there
  })
  it('words in a table cell and in a header can be tagged', () => {
    for (const w of ['Basic', 'Expleo header text']) {
      const r = rangeOf(w); expect(r).toBeTruthy()
      selectWords(w, r)
      const id = tagSelectedWords()
      expect(id).toBeTruthy()
      expect(rowFor(w)).toBeTruthy()
    }
  })
  it('selecting exactly a placeholder opens it; selecting text tagged elsewhere keeps the other tags', () => {
    addManual('Name')
    const r1 = rangeOf('Name', 0); selectWords('Name', r1)
    expect(tagSelectedWords()).toBe('g:Name')
    // a second tagging of a part of a word that another row covers
    const r2 = rangeOf('Name', 2); selectWords('Name', r2)
    tagSelectedWords()
    expect(state.rows.filter((r) => r.find === 'Name' && r.id.startsWith('g:')).length).toBe(1)
  })
})

describe('one place only', () => {
  const nameRow = () => { addManual('Name'); return rowFor('Name') }
  it('lists the spots in letter order and labels them', () => {
    const r = nameRow()
    setRowKey(r.id, 'fx:full_name')
    const places = rowPlaces(r.id).filter((p) => /^(Name|Dear Name,)$/.test(placeLabel(p)) || true)
    expect(places.length).toBeGreaterThanOrEqual(2)
    expect(placeLabel(places.find((p) => p.before.endsWith('Dear ')))).toBe('Dear Name,')
  })
  it('editPlace changes one spot, keeps the others, is one undo step, and the built letter differs', () => {
    const r = nameRow()
    setRowKey(r.id, 'fx:full_name')
    const places = rowPlaces(r.id)
    const dear = places.find((p) => p.before.endsWith('Dear '))
    const count0 = state.rows.find((x) => x.id === r.id).count
    const depth = HISTORY.undo.length
    const nid = setRowKeyAt(r.id, { pid: dear.pid, s: dear.s }, 'first_name')
    expect(HISTORY.undo.length).toBe(depth + 1)
    expect(nid).toBe(`o:${dear.pid}:${dear.s}`)
    expect(finalTag(state.rows.find((x) => x.id === nid))).toBe('{{ first_name }}')
    expect(finalTag(rowFor('Name') || state.rows.find((x) => x.id === r.id))).toContain('last_name')
    build()
    const xml = doc()
    expect(xml).toMatch(/Dear \{\{ first_name \}\},/)
    expect(xml).toContain('{{ first_name }} {{ last_name }}')
    // the other spot kept the full name, and the row's count went down by the spot that moved
    expect(state.rows.find((x) => x.id === r.id).count).toBe(count0 - 1)
    undo()
    build()
    expect(doc()).not.toMatch(/Dear \{\{ first_name \}\},/)
    expect((doc().match(/\{\{ first_name \}\} \{\{ last_name \}\}/g) || []).length).toBe(places.length + 1)   // + the [Insert Name] placeholder
  })
  it('goes back to the tag of the other spots', () => {
    const r = nameRow(); setRowKey(r.id, 'fx:full_name')
    const dear = rowPlaces(r.id).find((p) => p.before.endsWith('Dear '))
    const nid = editPlace(r.id, { pid: dear.pid, s: dear.s }, { key: 'first_name' })
    expect(mergePlace(nid)).toBe(true)
    build()
    expect(doc()).not.toMatch(/Dear \{\{ first_name \}\},/)
    expect(state.rows.find((x) => x.id === nid)).toBeUndefined()
  })
  it('does nothing for a row with one spot', () => {
    const r = rowFor('[Insert Name]')
    expect(editPlace(r.id, { pid: 'x', s: 0 }, { key: 'first_name' })).toBe(r.id)
  })
})

describe('custom tag switch', () => {
  it('works on the full name (both plain fields) and says why when it cannot apply', () => {
    expect(canBeCustom('fx:full_name')).toBe(true)
    expect(setCustomKey('fx:full_name', true)).toBe('custom_schema.first_name + custom_schema.last_name')
    expect(isCustomKey('custom_schema.first_name + custom_schema.last_name')).toBe(true)
    expect(setCustomKey('custom_schema.first_name + custom_schema.last_name', false)).toBe('first_name + last_name')
    expect(canBeCustom('first_name')).toBe(true)
    expect(canBeCustom('{{ x | upper }}')).toBe(false)
    expect(customReason('{{ x | upper }}')).toMatch(/wrote yourself/)
    expect(customReason('employee_schema.rating')).toBe('')
    expect(customReason('fx:hike_pct')).toMatch(/formula/)
    expect(customReason('first_name')).toBe('')
  })
})

describe('the tab', () => {
  it('stays put', () => { setTab('tags'); expect(state.tab).toBe('tags') })
})
