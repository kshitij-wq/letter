import JSZip from 'jszip'
import { beforeEach, describe, expect, it } from 'vitest'
import { build, docTags, ed, editorInput, editorChanged, flushEditor, keepBlockedChange, loadDocx, missingTags, registerEditor, restoreBlockedTags, sampleDocx, saveEditor, setRowKey, state, undoEditorChange, exportSetup } from './index.js'
import { docxFrom } from './testkit.js'

// paragraphs of one run each, or of several runs (an array)
const runs = (p) => `<w:p>${[].concat(p).map((t) => `<w:r><w:t>${t}</w:t></w:r>`).join('')}</w:p>`
const docxOf = (paras, header = '') => docxFrom(paras.map(runs).join(''), header && runs(header))

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
    localStorage.clear(); ed.prev = null; ed.status = 'none'; ed.blocked = null
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

  it('keeps tag choices (a typed tag for a placeholder) across the save', async () => {
    await loadDocx(await docxOf(['Name: [Employee Name]', 'Hello.']), 'p.docx', false)
    const r = state.rows.find((x) => x.find === '[Employee Name]'); setRowKey(r.id, 'custom_schema.who')
    dirty = true; next = await docxOf(['Name: [Employee Name]', 'Hello there.'])
    await saveEditor()
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
  it('saving an unchanged copy changes neither the findings nor the template', async () => {
    localStorage.clear()
    await loadDocx(await sampleDocx(), 's.docx', true); build()
    const xml = state.built.xml['word/document.xml'], rows = state.rows.map((r) => r.find + '|' + r.count), checks = state.built.checks.length
    const same = state.srcBuf
    registerEditor({ exportDocx: async () => same.slice(0), isDirty: () => true, markClean() {} })
    await saveEditor(); build()
    expect(state.built.xml['word/document.xml']).toBe(xml)
    expect(state.rows.map((r) => r.find + '|' + r.count)).toEqual(rows)
    expect(state.built.checks.length).toBe(checks)
  })
})
