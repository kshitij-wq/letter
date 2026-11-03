import { beforeEach, describe, expect, it } from 'vitest'
import {
  canConfirm, confirmRow, fieldPickerGroups, formatOptions, inventoryItems, inventoryStats, isPatternKey, joinKey, keySlots, loadDocx, rowEdited, rowNote, rowStatus,
  sampleDocx, setFilter, setKeyPart, setRowFormat, setRowKey, setRowTag, setSearch, state, tableCellView, tableHideExample, tableRowHide, tableSummary, tablesOverview, tagOpParts,
  typeTableCellKey, setTableHideOn, clearFilters,
} from './index.js'
import { rowFor } from './testkit.js'


beforeEach(async () => {
  localStorage.clear(); state.learned = {}; state.learnedCells = {}
  await loadDocx(await sampleDocx(), 'sample-appraisal-letter.docx', true)
  clearFilters()
})

describe('the placeholder list', () => {
  it('counts what each filter chip shows and filters the list the same way', () => {
    const s = inventoryStats()
    expect(s.all).toBe(state.rows.length)
    expect(s.inDoc).toBe(state.rows.filter((r) => r.count).length)
    expect(s.need + s.check + s.tagged + s.off).toBe(s.inDoc)
    setFilter('need'); expect(inventoryItems()).toHaveLength(s.need)
    setFilter('check'); expect(inventoryItems()).toHaveLength(s.check)
    setFilter('tagged'); expect(inventoryItems().every((i) => i.status === 'tagged')).toBe(true)
    setFilter('all'); expect(inventoryItems()).toHaveLength(s.all)
  })

  it('searches the text, the field and the tag', () => {
    setSearch('employee code')
    const hits = inventoryItems()
    expect(hits.length).toBeGreaterThan(0)
    expect(hits.some((i) => i.find === '[Employee Code]')).toBe(true)
    setSearch('zzz nothing like this')
    expect(inventoryItems()).toHaveLength(0)
  })

  it('describes a row for the list: its field, or that it is not mapped', () => {
    const it1 = inventoryItems().find((i) => i.find === '[Employee Code]')
    expect(it1.field.key).toBe('emp_code')
    expect(it1.field.label).toBe('Employee ID')
    expect(it1.kindShown).toBeTruthy()
    const r = rowFor('[Employee Code]')
    setRowKey(r.id, '')
    const none = inventoryItems().find((i) => i.find === '[Employee Code]')
    expect(none.field).toBeNull()
    expect(none.status).toBe('need')
  })
})

describe('the field picker', () => {
  it('groups the choices and keeps each one once per group', () => {
    const g = fieldPickerGroups()
    expect(g.map((x) => x.heading)).toContain('CompUp · Personal')
    expect(g.find((x) => x.heading === 'CompUp · Personal').options.find((o) => o.value === 'emp_code')).toMatchObject({ label: 'Employee ID', hint: 'emp_code' })
    for (const x of g) expect(new Set(x.options.map((o) => o.value)).size).toBe(x.options.length)
    expect(g.flatMap((x) => x.options).some((o) => o.value.startsWith('fx:'))).toBe(true)
    expect(fieldPickerGroups(false).flatMap((x) => x.options).some((o) => o.value.startsWith('fx:'))).toBe(false)
  })

  it('splits and joins fields printed side by side', () => {
    expect(keySlots('first_name + last_name')).toEqual(['first_name', 'last_name'])
    expect(keySlots('ctc')).toEqual(['ctc'])
    expect(keySlots('')).toEqual([])
    expect(keySlots("{{ x | default('a + b') }}")).toHaveLength(1)
    expect(setKeyPart('first_name', 1, 'last_name')).toBe('first_name + last_name')
    expect(setKeyPart('first_name + last_name', 0, 'emp_code')).toBe('emp_code + last_name')
    expect(setKeyPart('first_name + last_name', 1, '')).toBe('first_name')
    expect(joinKey(['a', ' ', 'b'])).toBe('a + b')
    expect(isPatternKey('custom_schema.column_heading')).toBe(true)
    expect(isPatternKey('ctc')).toBe(false)
  })
})

describe('the placeholder panel', () => {
  it('names the format Auto comes to', () => {
    const r = rowFor('XXXX') || state.rows.find((x) => x.key === 'ctc')
    const opts = formatOptions(r)
    expect(opts[0]).toEqual({ value: 'auto', label: expect.stringMatching(/^Auto \(.+\)$/) })
    setRowFormat(r.id, 'upper')
    expect(formatOptions(state.rows.find((x) => x.id === r.id))[0].label).toMatch(/^Auto/)
  })

  it('knows a typed tag from a generated one, and what can be confirmed', () => {
    const r = rowFor('[Employee Code]')
    expect(rowEdited(r)).toBe(false)
    setRowTag(r.id, '{{ emp_code | upper }}')
    expect(rowEdited(rowFor('[Employee Code]'))).toBe(true)
    const sug = state.rows.find((x) => x.count && rowStatus(x) === 'check')
    if (sug) {
      expect(canConfirm(sug)).toBe(true)
      confirmRow(sug.id)
      expect(canConfirm(state.rows.find((x) => x.id === sug.id))).toBe(false)
      expect(rowNote(state.rows.find((x) => x.id === sug.id))).toMatch(/^Reviewed/)
    }
  })

  it('writes the note in plain text', () => {
    for (const r of state.rows.filter((x) => x.count)) expect(rowNote(r)).not.toMatch(/[<>]|&amp;/)
    const r = rowFor('[Employee Code]')
    setRowKey(r.id, 'custom_schema.empid')
    expect(rowNote(rowFor('[Employee Code]'))).toMatch(/^Set by you/)
  })

  it('writes the clean-up changes as parts', () => {
    expect(tagOpParts({ type: 'rename', from: 'a', to: 'b' })).toEqual([{ t: 'Renamed ' }, { c: 'a' }, { t: ' to ' }, { c: 'b' }])
    expect(tagOpParts({ type: 'replace', find: 'x', repl: 'y', regex: true }).at(-1)).toEqual({ t: ' (pattern)' })
  })
})

describe('salary tables', () => {
  it('counts cells, summarises options and describes a cell', () => {
    expect(state.tables.length).toBeGreaterThan(0)
    const t = state.tables[0]
    const total = tablesOverview()
    expect(total.all).toBeGreaterThan(0)
    expect(total.done).toBeLessThanOrEqual(total.all)
    expect(tableSummary(t).hide).toMatch(/^(hides empty rows \(checks .+\)|shows every row)$/)
    const row = t.rows[0], col = t.cols.find((c) => row.empties.includes(c.ci))
    const v = tableCellView(t, row, col)
    expect(v.na).toBe(false)
    expect(v).toMatchObject({ key: expect.any(String), tag: expect.any(String), needs: v.tag === '' })
    typeTableCellKey(t, row, col.ci, 'custom_schema.basic1')
    const w = tableCellView(t, row, col)
    expect(w.key).toBe('custom_schema.basic1')
    expect(w.tag).toContain('custom_schema.basic1')
    expect(w.needs).toBe(false)
    const other = t.cols.find((c) => !row.empties.includes(c.ci))
    if (other) expect(tableCellView(t, row, other)).toEqual({ na: true })
  })

  it('says how a row is hidden, with an example of the condition', () => {
    const t = state.tables[0]
    setTableHideOn(t, true)
    const row = t.rows.find((r) => r.hide) || t.rows[0]
    const h = tableRowHide(t, row)
    expect(h.text).toMatch(/Hide if 0|Always show/)
    const ex = tableHideExample(t)
    if (ex) expect(ex.expr).toMatch(/default\(0\)/)
  })
})
