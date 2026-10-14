// The in-app Word editor (SuperDoc, features/editor) and the engine: no DOM here.
// The engine's docx (state.srcBuf) stays the one template. The editor opens it, and a save exports the editor's docx and
// puts it back with loadDocx + importSetup (the same way a changed letter gets its tags and conditions back), after a guard
// that no {{ }} / {% %} tag was lost on the way.
import JSZip from 'jszip'
import { RX_TAG } from './detect.js'
import { notify, toast } from './events.js'
import { parseXml, W } from './helpers.js'
import { loadDocx } from './load.js'
import { exportSetup, importSetup } from './setup.js'
import { state } from './state.js'

/** What the editor view shows: status is none | unsaved | saving | saved | blocked | error. */
export const ed = { status: 'none', savedAt: 0, prev: null, blocked: null, error: '', knownBuf: null, loadId: 0, lastReport: null }
let handle = null          // set by the editor component: { exportDocx(): Promise<ArrayBuffer>, isDirty(): boolean, markClean(): void }
let saveTimer = null
let running = null         // the save in progress, so a second caller waits for it instead of starting another

export const registerEditor = (h) => { handle = h; if (!h) clearTimeout(saveTimer) }
export const unregisterEditor = (h) => { if (handle === h) handle = null }

/** The id the editor view reloads on: it changes only when the engine's docx changed from outside the editor. */
export function editorSourceId() {
  if (state.srcBuf !== ed.knownBuf) { ed.knownBuf = state.srcBuf; ed.loadId++; ed.status = 'none'; ed.blocked = null }
  return ed.loadId
}

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

const squash =(s) => s.replace(/\s+/g, ' ').trim()

/** Every tag in the document (all parts, a tag split over runs counts as one), whitespace squashed. */
export async function docTags(buf) {
  const zip = await JSZip.loadAsync(buf)
  const names = Object.keys(zip.files).filter((p) => /^word\/(document|header\d*|footer\d*|footnotes|endnotes)\.xml$/.test(p)).sort()
  const out = []
  for (const p of names) {
    const doc = parseXml(await zip.file(p).async('string'))
    for (const para of doc.getElementsByTagNameNS(W, 'p')) {
      const text = [...para.getElementsByTagNameNS(W, 't')].map((t) => t.textContent).join('')
      for (const m of text.matchAll(RX_TAG)) out.push(squash(m[0]))
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
 * The engine changed the letter's own text (a reworded paragraph, text by value, an undo of those): the editor must open the
 * letter as it is now. The source docx gets the engine's parts, and editorSourceId() then reloads the editor view.
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
  const before = await docTags(state.srcBuf)
  const gone = accept ? [] : missingTags(before, await docTags(buf))
  if (gone.length) { ed.blocked = { missing: gone, buf }; setStatus('blocked'); return false }
  const prev = { buf: state.srcBuf, name: state.fileName, isSample: state.isSample, setup: exportSetup({ includeSource: true, local: true }) }
  const setup = exportSetup({ includeSource: false, local: true })
  ed.knownBuf = buf                       // the editor already shows this: no reload
  await loadDocx(buf, state.fileName, state.isSample)
  state.pendingRestore = null
  ed.lastReport = importSetup(setup, { noUndo: true })
  ed.prev = prev; ed.blocked = null; ed.savedAt = Date.now(); state.editedAt = ed.savedAt
  handle?.markClean?.()
  setStatus('saved')
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
    finally { running = null }
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

/** The blocked save, thrown away: the editor goes back to the letter as the engine has it (the tags are back). */
export function restoreBlockedTags() {
  ed.blocked = null; ed.status = 'none'; ed.knownBuf = null     // editorSourceId() sees a new source and the editor reloads
  handle?.markClean?.()
  notify()
}

/** One step back: the letter and every choice as they were before the last save. */
export async function undoEditorChange() {
  const p = ed.prev; if (!p) return false
  ed.knownBuf = null
  await loadDocx(p.buf, p.name, p.isSample)
  state.pendingRestore = null
  importSetup(p.setup, { noUndo: true })
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
  const want = squash(paraText || words), w = words.trim()
  const paras = state.an.paras.filter((p) => !p.fallback && !p.textbox && ['body', 'header', 'footer'].includes(p.kind))
  const exact = paras.filter((p) => squash(p.model.text) === want)
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
