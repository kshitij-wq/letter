import { readFileSync } from 'node:fs'
import process from 'node:process'
import JSZip from 'jszip'
import { beforeEach, describe, expect, it } from 'vitest'
import { ingestCsv, applyParaCondition, bakedNow, build, builtDocx, cbNew, clickParagraph, docTags, ed, editorDocx, editorConverts, editorSourceId, editorInput, unbakedSetup, editorChanged, flushEditor, keepBlockedChange, loadDocx, missingTags, registerEditor, restoreBlockedTags, sampleDocx, saveEditor, setRowKey, state, undoEditorChange, exportSetup } from './index.js'

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
const docxOf = async (paras, header = '') => {
  const z = new JSZip()
  z.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
  z.file('word/document.xml', `<?xml version="1.0"?><w:document ${W}><w:body>${paras.map((p) => `<w:p>${Array.isArray(p) ? p.map((t) => `<w:r><w:t>${t}</w:t></w:r>`).join('') : `<w:r><w:t>${p}</w:t></w:r>`}</w:p>`).join('')}</w:body></w:document>`)
  if (header) z.file('word/header1.xml', `<?xml version="1.0"?><w:hdr ${W}><w:p><w:r><w:t>${header}</w:t></w:r></w:p></w:hdr>`)
  return z.generateAsync({ type: 'arraybuffer' })
}

describe('tag guard', () => {
  it('finds tags in every part, also when a tag is split over runs', async () => {
    const buf = await docxOf(['Dear {{ first_name }},', ['{{ ctc ', '| indian_comma }}'], '{% if a == 1 %}x{% endif %}'], 'Ref {{ emp_code }}')
    expect(await docTags(buf)).toEqual(['{{ first_name }}', '{{ ctc | indian_comma }}', '{% if a == 1 %}', '{% endif %}', '{{ emp_code }}'])
  })

  it('missingTags counts copies and ignores added tags', () => {
    expect(missingTags(['{{ a }}', '{{ a }}', '{{ b }}'], ['{{ a }}', '{{ c }}'])).toEqual(['{{ a }}', '{{ b }}'])
    expect(missingTags(['{{ a }}'], ['{{ a }}', '{{ a }}'])).toEqual([])
  })
})

describe('editorInput', () => {
  it('adds the styles and relationships parts a hand-made letter lacks, and leaves the text alone', async () => {
    const buf = await docxOf(['Dear {{ first_name }},'])
    const out = await editorInput(buf)
    const z = await JSZip.loadAsync(out)
    expect(z.file('word/styles.xml')).toBeTruthy()
    expect(z.file('word/_rels/document.xml.rels')).toBeTruthy()
    expect(await z.file('[Content_Types].xml').async('string')).toContain('/word/styles.xml')
    expect(await docTags(out)).toEqual(['{{ first_name }}'])
  })
  it('returns a complete letter unchanged', async () => {
    const once = await editorInput(await docxOf(['x']))
    expect(await editorInput(once)).toBe(once)
  })
})

describe('saving the editor into the engine', () => {
  const sourceOf = async () => { await loadDocx(await docxOf(['Dear {{ first_name }},', 'Your pay is {{ ctc }}.', 'Plain words here.'], 'Ref {{ emp_code }}'), 'l.docx', false); state.pendingRestore = null }
  let next, dirty
  beforeEach(async () => {
    localStorage.clear(); ed.prev = null; ed.status = 'none'; ed.blocked = null; ed.base = null; ed.baked = null
    await sourceOf()
    dirty = true; next = null
    registerEditor({ exportDocx: async () => next, isDirty: () => dirty, markClean: () => { dirty = false } })
  })

  it('an edit that keeps every tag goes in and the engine paper shows it', async () => {
    next = await docxOf(['Dear {{ first_name }},', 'Your pay is {{ ctc }}.', 'Changed words here.'], 'Ref {{ emp_code }}')
    expect(await saveEditor()).toBe(true)
    expect(ed.status).toBe('saved')
    expect(state.an.paras.some((p) => p.model.text === 'Changed words here.')).toBe(true)
  })

  it('keeps a tag choice made after the editor opened (it is not in the editor yet)', async () => {
    await loadDocx(await docxOf(['Name: [Employee Name]', 'Hello.']), 'p.docx', false)
    await editorDocx()
    const r = state.rows.find((x) => x.find === '[Employee Name]'); setRowKey(r.id, 'custom_schema.who')
    dirty = true; next = await docxOf(['Name: [Employee Name]', 'Hello there.'])
    await saveEditor()
    expect(state.rows.find((x) => x.find === '[Employee Name]').key).toBe('custom_schema.who')
  })

  it('a tag the editor showed becomes text in the letter: no mapping left, not tagged twice', async () => {
    await loadDocx(await docxOf(['Name: [Employee Name]', 'Hello.']), 'p.docx', false)
    const r = state.rows.find((x) => x.find === '[Employee Name]'); setRowKey(r.id, 'custom_schema.who'); build()
    const open = await editorDocx()
    expect(editorConverts()).toBe(true)
    expect(await docTags(open)).toEqual(['{{ custom_schema.who }}'])
    dirty = true; next = open.slice(0)
    await saveEditor(); build()
    expect(state.rows.some((x) => x.find === '[Employee Name]')).toBe(false)
    expect(Object.keys(state.edits)).toEqual([])
    expect(await docTags(await builtDocx())).toEqual(['{{ custom_schema.who }}'])
    expect(editorConverts()).toBe(false)
    await undoEditorChange()
    expect(state.rows.find((x) => x.find === '[Employee Name]').key).toBe('custom_schema.who')
  })

  it('a save that loses a tag is blocked until the person decides; restoring keeps the old letter', async () => {
    const before = state.srcBuf
    next = await docxOf(['Dear Sir,', 'Your pay is {{ ctc }}.', 'Plain words here.'], 'Ref {{ emp_code }}')
    expect(await saveEditor()).toBe(false)
    expect(ed.status).toBe('blocked')
    expect(ed.blocked.missing).toEqual(['{{ first_name }}'])
    expect(state.srcBuf).toBe(before)
    restoreBlockedTags()
    expect(ed.status).toBe('none')
    expect(state.srcBuf).toBe(before)
  })

  it('"keep my change" takes the save without the tag', async () => {
    next = await docxOf(['Dear Sir,', 'Your pay is {{ ctc }}.', 'Plain words here.'], 'Ref {{ emp_code }}')
    await saveEditor(); await keepBlockedChange()
    expect(ed.status).toBe('saved')
    expect(await docTags(state.srcBuf)).not.toContain('{{ first_name }}')
  })

  it('a changed tag counts as a lost tag', async () => {
    next = await docxOf(['Dear {{ first_name }},', 'Your pay is {{ ctc | indian_comma }}.', 'Plain words here.'], 'Ref {{ emp_code }}')
    expect(await saveEditor()).toBe(false)
    expect(ed.blocked.missing).toEqual(['{{ ctc }}'])
  })

  it('undo editor change restores the letter and the setup exactly', async () => {
    const before = state.srcBuf, beforeSetup = JSON.stringify(exportSetup().edits)
    next = await docxOf(['Dear {{ first_name }},', 'Your pay is {{ ctc }}.', 'Other.'], 'Ref {{ emp_code }}')
    await saveEditor()
    expect(state.srcBuf).not.toBe(before)
    expect(await undoEditorChange()).toBe(true)
    expect(state.srcBuf).toBe(before)
    expect(JSON.stringify(exportSetup().edits)).toBe(beforeSetup)
    expect(ed.prev).toBe(null)
  })

  it('flushEditor saves pending changes (downloads and checks call it first)', async () => {
    next = await docxOf(['Dear {{ first_name }},', 'Your pay is {{ ctc }}.', 'Flushed.'], 'Ref {{ emp_code }}')
    editorChanged()
    await flushEditor()
    expect(ed.status).toBe('saved')
    build()
    expect(state.built.xml['word/document.xml']).toContain('Flushed.')
  })

  it('an export that throws shows an error and leaves the letter alone', async () => {
    const before = state.srcBuf
    registerEditor({ exportDocx: async () => { throw new Error('boom') }, isDirty: () => true, markClean() {} })
    expect(await saveEditor()).toBe(false)
    expect(ed.status).toBe('error'); expect(state.srcBuf).toBe(before)
  })

  it('a save with no changes does nothing', async () => {
    dirty = false
    const before = state.srcBuf
    expect(await saveEditor()).toBe(true)
    expect(state.srcBuf).toBe(before)
  })
})

describe('round trip with the sample letter', () => {
  it('saving the tagged letter unchanged gives the same template: nothing tagged twice, undo puts every choice back', async () => {
    localStorage.clear(); ed.prev = null; ed.status = 'none'; ed.blocked = null
    await loadDocx(await sampleDocx(), 's.docx', true); build()
    const p = state.an.paras.find((x) => x.kind === 'body' && !x.fallback && !x.textbox && x.model.text.trim().length > 30)
    clickParagraph(p.pid, false); state.cb = cbNew('promotion == "yes"'); applyParaCondition(); state.cb = null; build()
    const setup = JSON.stringify(exportSetup()), rowsBefore = state.rows.length
    const open = await editorDocx()
    const tags = await docTags(open), xml = state.built.xml
    expect(tags.some((t) => t.startsWith('{% if promotion'))).toBe(true)
    registerEditor({ exportDocx: async () => open.slice(0), isDirty: () => true, markClean() {} })
    await saveEditor(); build()
    expect(ed.status).toBe('saved')
    expect(state.built.xml).toEqual(xml)
    expect(await docTags(await builtDocx())).toEqual(tags)
    expect(state.logic).toEqual([])
    expect(state.lg.some((e) => e.kw === 'if')).toBe(true)   // the condition is now a tag in the letter's text
    expect(state.rows.length).toBeLessThan(rowsBefore)
    await undoEditorChange(); build()
    expect(JSON.stringify({ ...exportSetup(), savedAt: 0 })).toBe(JSON.stringify({ ...JSON.parse(setup), savedAt: 0 }))
  })
})

describe('round trip with the test letters and data', () => {
  const fixture = (name) => { const b = readFileSync(`${process.cwd()}/../tests_ui/fixtures/${name}`); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) }
  for (const name of ['ACME Letter - MHPromotion.docx', 'acme_tagged.docx', 'conditions_tagged.docx', 'with_header.docx', 'northwind.docx', 'letterA.docx', 'oldtemplate.docx']) {
    it(`${name}: the saved tagged letter builds to the same template`, async () => {
      localStorage.clear(); ed.prev = null; ed.status = 'none'; ed.blocked = null
      await loadDocx(fixture(name), name, false); state.pendingRestore = null
      ingestCsv(readFileSync(`${process.cwd()}/../tests_ui/fixtures/emps.csv`, 'utf8'), 'emps.csv'); build()
      const open = await editorDocx(), xml = state.built.xml, tags = await docTags(open)
      registerEditor({ exportDocx: async () => open.slice(0), isDirty: () => true, markClean() {} })
      expect(await saveEditor()).toBe(true); build()
      expect(state.built.xml).toEqual(xml)
      expect(await docTags(await builtDocx())).toEqual(tags)
    })
  }
})

describe('editor reload', () => {
  it('reloads when the tags change, but not over unsaved changes', async () => {
    localStorage.clear()
    await loadDocx(await docxOf(['Name: [Employee Name]', 'Hello.']), 'p.docx', false); build()
    let dirty = false
    registerEditor({ exportDocx: async () => null, isDirty: () => dirty, markClean() { dirty = false } })
    const id = editorSourceId()
    expect(editorSourceId()).toBe(id)
    const r = state.rows.find((x) => x.find === '[Employee Name]'); setRowKey(r.id, 'custom_schema.reload_a'); build()
    expect(editorSourceId()).toBe(id + 1)
    dirty = true; setRowKey(r.id, 'custom_schema.reload_b'); build()
    expect(editorSourceId()).toBe(id + 1)
    expect(ed.stale).toBe(true)
    dirty = false
    expect(editorSourceId()).toBe(id + 2)
    expect(ed.stale).toBe(false)
  })
})

describe('unbakedSetup', () => {
  it('drops what was written in and keeps what changed since', () => {
    const baked = { edits: ['g:a{"key":"x"}', 'g:b{"key":"y"}'], logic: ['l1'], switchOps: ['s1'], tagOps: ['o1'], tables: [] }
    const setup = { edits: { 'g:a': { key: 'x' }, 'g:b': { key: 'z' }, 'g:c': { enabled: false } }, rowsInfo: [{ id: 'g:a' }, { id: 'g:c' }], logic: [{ id: 'l1' }, { id: 'l2' }], switchOps: [{ id: 's1' }], tagOps: [{ id: 'o1' }, { id: 'o2' }], settings: { a: 1 } }
    const out = unbakedSetup(setup, baked)
    expect(out.edits).toEqual({ 'g:b': { key: 'z' }, 'g:c': { enabled: false } })
    expect(out.rowsInfo).toEqual([{ id: 'g:c' }])
    expect(out.logic).toEqual([{ id: 'l2' }]); expect(out.switchOps).toEqual([]); expect(out.tagOps).toEqual([{ id: 'o2' }])
    expect(out.settings).toEqual({ a: 1 })
  })
  it('bakedNow lists only active rows', async () => {
    await loadDocx(await docxOf(['Name: [Employee Name]']), 'p.docx', false)
    const r = state.rows.find((x) => x.find === '[Employee Name]'); setRowKey(r.id, 'custom_schema.who')
    expect(bakedNow().edits.length).toBe(1)
  })
})
