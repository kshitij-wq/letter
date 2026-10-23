// The in-app Word editor (SuperDoc, features/editor) and the engine: no DOM here.
// The editor opens the tagged letter, the same bytes Download gives (every mapping, condition and table tag written in).
// A save with changes exports the editor's docx and makes it the new source (an already-tagged letter) with loadDocx; the
// setup goes back with importSetup minus what the opened letter already had written in (bakedNow / unbakedSetup), so nothing
// is tagged twice. A guard first checks that no {{ }} / {% %} tag was lost on the way.
import JSZip from 'jszip'
import { RX_TAG } from './detect.js'
import { notify, toast } from './events.js'
import { parseXml, W } from './helpers.js'
import { loadDocx } from './load.js'
import { builtDocx } from './downloads.js'
import { finalTag } from './rows.js'
import { exportSetup, exportTable, importSetup } from './setup.js'
import { state } from './state.js'
import { tCellTag } from './tables.js'

/** What the editor view shows: status is none | unsaved | saving | saved | blocked | error. */
// knownBuf/knownSig: the source and build the editor view was opened on; base: the docx it opened; baked: what that docx had
// written in (bakedNow); stale: the tags changed elsewhere while the editor had unsaved changes.
export const ed = { status: 'none', savedAt: 0, prev: null, blocked: null, error: '', knownBuf: null, knownSig: null, loadId: 0, lastReport: null, base: null, baked: null, stale: false, prevLoad: 0 }
let handle = null          // set by the editor component: { exportDocx(): Promise<ArrayBuffer>, isDirty(): boolean, markClean(): void }
let saveTimer = null
let running = null         // the save in progress, so a second caller waits for it instead of starting another

export const registerEditor = (h) => { handle = h; if (!h) clearTimeout(saveTimer) }
export const unregisterEditor = (h) => { if (handle === h) handle = null }

/**
 * The id the editor view reloads on: it changes when the letter or its tags changed from outside the editor. A change of
 * tags while the editor has unsaved changes does not reload it (ed.stale: the view offers to reload).
 */
export function editorSourceId() {
  if (running) return ed.loadId          // a save is loading the editor's own letter: apply() says what the editor shows
  const sig = state.built?.sig ?? null
  if (state.srcBuf === ed.knownBuf && sig === ed.knownSig) { ed.stale = false; return ed.loadId }
  if (state.srcBuf === ed.knownBuf && (handle?.isDirty?.() || ed.status === 'blocked')) { ed.stale = true; return ed.loadId }
  ed.knownBuf = state.srcBuf; ed.knownSig = sig; ed.loadId++; ed.status = 'none'; ed.blocked = null; ed.stale = false
  return ed.loadId
}

/** What the tagged letter has written in now: the choices a save must not apply again. */
export function bakedNow() {
  const active = new Set(state.rows.filter((r) => r.enabled && finalTag(r)).map((r) => r.id))
  return {
    rows: [...active],
    edits: Object.entries(state.edits).filter(([id]) => active.has(id)).map(([id, e]) => id + JSON.stringify(e)),
    logic: state.logic.map((l) => l.id),
    switchOps: state.switchOps.map((o) => o.id),
    tagOps: state.tagOps.map((o) => o.id),
    tables: state.tables.filter((t) => t.enabled).map((t) => t.id + JSON.stringify(state.tableEdits[t.id] || null)),
    tableCells: state.tables.filter((t) => t.rows.some((r) => t.cols.some((c) => tCellTag(t, r, c)))).map((t) => t.id),
  }
}

/** The setup without what `baked` says is already written into the letter (choices made since then stay). Pure. */
export function unbakedSetup(setup, baked) {
  const edits = Object.fromEntries(Object.entries(setup.edits || {}).filter(([id, e]) => !baked.edits.includes(id + JSON.stringify(e))))
  return {
    ...setup, edits,
    rowsInfo: (setup.rowsInfo || []).filter((r) => r.id in edits),
    logic: (setup.logic || []).filter((l) => !baked.logic.includes(l.id)),
    switchOps: (setup.switchOps || []).filter((o) => !baked.switchOps.includes(o.id)),
    tagOps: (setup.tagOps || []).filter((o) => !baked.tagOps.includes(o.id)),
  }
}

/** The docx the editor opens: the tagged letter as Download gives it. Remembers what it has written in. */
export async function editorDocx() {
  ed.baked = bakedNow()
  ed.base = await builtDocx()
  return ed.base
}

/** Saving turns tags into text in the letter: true while the editor shows tags that are still choices. */
export const editorConverts = () => !!ed.baked && ['rows', 'logic', 'switchOps', 'tagOps', 'tableCells'].some((k) => ed.baked[k].length > 0)

const CT = 'application/vnd.openxmlformats-officedocument.wordprocessingml'
const NS_W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
/**
 * The letter as the editor should open it. Word always writes a styles part and a relationships part for the document; a
 * hand-made or generated .docx often has neither, and the editor cannot save such a file. Missing ones are added empty (the
 * letter itself is not touched). Returns the same buffer when nothing is missing.
 */
export async function editorInput(buf) {
  const zip = await JSZip.loadAsync(buf)
  const main = zip.file('word/document.xml') ? 'word/document.xml' : null
  if (!main) return buf
  let ct = await zip.file('[Content_Types].xml').async('string')
  let changed = false
  if (!zip.file('word/_rels/document.xml.rels')) {
    zip.file('word/_rels/document.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>')
    changed = true
  }
  if (!zip.file('word/styles.xml')) {
    zip.file('word/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="${NS_W}"><w:docDefaults><w:rPrDefault><w:rPr><w:sz w:val="22"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr/></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>`)
    if (!/PartName="\/word\/styles\.xml"/.test(ct)) ct = ct.replace('</Types>', `<Override PartName="/word/styles.xml" ContentType="${CT}.styles+xml"/></Types>`)
    changed = true
  }
  if (!changed) return buf
  // the relationship that points the document at its styles
  const rels = await zip.file('word/_rels/document.xml.rels').async('string')
  if (!/relationships\/styles"/.test(rels)) zip.file('word/_rels/document.xml.rels', rels.replace('</Relationships>', '<Relationship Id="rIdStyles1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'))
  zip.file('[Content_Types].xml', ct)
  return zip.generateAsync({ type: 'arraybuffer', mimeType: `${CT}.document`, compression: 'DEFLATE' })
}

export const squashSpaces = (s) => s.replace(/\s+/g, ' ').trim()

/** Every tag in the document (all parts, a tag split over runs counts as one), whitespace squashed. */
export async function docTags(buf) {
  const zip = await JSZip.loadAsync(buf)
  const names = Object.keys(zip.files).filter((p) => /^word\/(document|header\d*|footer\d*|footnotes|endnotes)\.xml$/.test(p)).sort()
  const out = []
  for (const p of names) {
    const doc = parseXml(await zip.file(p).async('string'))
    for (const para of doc.getElementsByTagNameNS(W, 'p')) {
      const text = [...para.getElementsByTagNameNS(W, 't')].map((t) => t.textContent).join('')
      for (const m of text.matchAll(RX_TAG)) out.push(squashSpaces(m[0]))
    }
  }
  return out
}

/** The tags in `before` that `after` no longer has (as a multiset: two copies and one left means one is missing). */
export function missingTags(before, after) {
  const left = new Map()
  for (const t of after) left.set(t, (left.get(t) || 0) + 1)
  const gone = []
  for (const t of before) {
    const n = left.get(t) || 0
    if (n > 0) left.set(t, n - 1); else gone.push(t)
  }
  return gone
}

/**
 * The engine changed the letter's own text (a reworded paragraph, text by value, an undo of those): the source docx gets the
 * engine's parts, so it matches state.xml. The editor view reloads on the new source (editorSourceId()) and opens the build.
 */
export async function syncEditorSource() {
  const zip = await JSZip.loadAsync(state.srcBuf)
  let changed = false
  for (const { path } of state.parts) if (zip.file(path) && (await zip.file(path).async('string')) !== state.xml[path]) { zip.file(path, state.xml[path]); changed = true }
  if (!changed) return
  state.srcBuf = await zip.generateAsync({ type: 'arraybuffer', mimeType: `${CT}.document`, compression: 'DEFLATE' })
  notify()
}

const setStatus = (s) => { ed.status = s; notify() }

/** The editor says its text changed. Saves by itself after 2 seconds without typing. */
export function editorChanged() {
  if (ed.status === 'blocked') return
  setStatus('unsaved')
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => { saveEditor().catch(() => {}) }, 2000)
}

async function apply(buf, accept) {
  const before = await docTags(ed.base || state.srcBuf)
  const gone = accept ? [] : missingTags(before, await docTags(buf))
  if (gone.length) { ed.blocked = { missing: gone, buf }; setStatus('blocked'); return false }
  const pvIdx = state.pvIdx, unplaced = state.unplaced
  const prev = { buf: state.srcBuf, name: state.fileName, isSample: state.isSample, pvIdx, setup: exportSetup({ includeSource: true, local: true }) }
  const baked = ed.baked || bakedNow()
  const setup = unbakedSetup(exportSetup({ includeSource: false, local: true }), baked)
  // tables keep only choices not yet written in (a turned-off table stays off)
  setup.tables = state.tables.filter((t) => !baked.tables.includes(t.id + JSON.stringify(state.tableEdits[t.id] || null))).map(exportTable).filter(Boolean)
  ed.knownBuf = buf
  await loadDocx(buf, state.fileName, state.isSample)
  state.pendingRestore = null
  ed.lastReport = importSetup(setup, { noUndo: true })
  state.unplaced = [...state.unplaced, ...unplaced]; state.pvIdx = pvIdx
  // the editor already shows this letter: no reload, unless the build still adds tags to it (choices made elsewhere since it opened)
  ed.knownBuf = state.srcBuf; ed.base = buf; ed.baked = bakedNow()
  if (!editorConverts()) ed.knownSig = state.built?.sig ?? null
  // one undo step for everything saved since the editor opened this letter (it saves by itself while the person types)
  if (!ed.prev || ed.prevLoad !== ed.loadId) { ed.prev = prev; ed.prevLoad = ed.loadId }
  ed.blocked = null; ed.savedAt = Date.now(); state.editedAt = ed.savedAt
  handle?.markClean?.()
  setStatus('saved')
  if (handle?.isDirty?.()) editorChanged()   // typed while the save ran
  return true
}

/** Takes the editor's changes into the letter. Resolves true when nothing is left unsaved. */
export function saveEditor() {
  if (running) return running
  clearTimeout(saveTimer)
  if (!handle || ed.status === 'blocked') return Promise.resolve(ed.status !== 'blocked')
  if (!handle.isDirty()) return Promise.resolve(true)
  setStatus('saving')
  running = (async () => {
    try { return await apply(await handle.exportDocx(), false) }
    catch (e) { console.warn(e); ed.error = e && e.message ? e.message : 'Could not save the changes.'; setStatus('error'); return false }
    finally { running = null; notify() }
  })()
  return running
}

/** Called before anything reads the letter's docx (download, checks, test): pending editor changes go in first. */
export async function flushEditor() { if (handle && (ed.status === 'unsaved' || ed.status === 'saving' || running)) await saveEditor() }

/** The blocked save, kept anyway: the person did mean to delete or change those tags. */
export async function keepBlockedChange() {
  const b = ed.blocked; if (!b) return
  try { await apply(b.buf, true) } catch (e) { ed.error = e.message; setStatus('error') }
}

/** The editor's unsaved changes thrown away: it opens the tagged letter as the engine has it now (also: a blocked save's tags are back). */
export function reloadEditor() {
  clearTimeout(saveTimer)
  ed.blocked = null; ed.status = 'none'; ed.stale = false; ed.knownBuf = null     // editorSourceId() sees a new source and the editor reloads
  handle?.markClean?.()
  notify()
}
export const restoreBlockedTags = reloadEditor

/** One step back: the letter and every choice as they were before the editor's first save since it opened the letter. */
export async function undoEditorChange() {
  const p = ed.prev; if (!p) return false
  ed.knownBuf = null
  await loadDocx(p.buf, p.name, p.isSample)
  state.pendingRestore = null
  importSetup(p.setup, { noUndo: true })
  state.pvIdx = p.pvIdx || 0
  ed.prev = null; ed.status = 'none'; ed.blocked = null
  handle?.markClean?.()
  toast('Undid the last editor change.')
  notify()
  return true
}

/**
 * Words selected in the editor, handed to the engine: saves first, finds the paragraph by its text, and selects those words
 * there ({pid, s, e}) so the same "Selected text" actions as the letter apply. `paraText` is the whole paragraph the words
 * were in; `before` is how many characters of it came before them. Resolves false when the place is not unique enough.
 */
export async function selectEditorWords(words, paraText, before) {
  if (!(await saveEditor())) return false
  const want = squashSpaces(paraText || words), w = words.trim()
  const paras = state.an.paras.filter((p) => !p.fallback && !p.textbox && ['body', 'header', 'footer'].includes(p.kind))
  const exact = paras.filter((p) => squashSpaces(p.model.text) === want)
  const cands = exact.length ? exact : paras.filter((p) => p.model.text.includes(w))
  if (!cands.length) return false
  const p = cands[0], t = p.model.text
  let s = -1
  for (let i = t.indexOf(w); i >= 0; i = t.indexOf(w, i + 1)) { if (s < 0 || Math.abs(i - (before || 0)) < Math.abs(s - (before || 0))) s = i }
  if (s < 0) return false
  state.sel = { pids: [], anchor: null, text: w, range: { pid: p.pid, s, e: s + w.length, text: w } }
  state.inlineUi = null; state.switchUi = null; notify()
  return true
}


export function editorStatusText() {
  switch (ed.status) {
    case 'unsaved': return 'Unsaved changes'
    case 'saving': return 'Saving…'
    case 'saved': return 'Saved in this browser'
    case 'blocked': return 'Not saved: tags would be lost'
    case 'error': return 'Could not save'
    default: return ''
  }
}
