// The in-app Word editor (SuperDoc, features/editor) and the engine: no DOM here.
// The engine's docx (state.srcBuf) stays the one template. The editor opens it, and a save exports the editor's docx and
// puts it back with loadDocx + importSetup (the same way a changed letter gets its tags and conditions back), after a guard
// that no {{ }} / {% %} tag was lost on the way.
import JSZip from 'jszip'
import { RX_TAG } from './detect.js'
import { notify, toast } from './events.js'
import { parseXml, W } from './helpers.js'
import { loadDocx } from './load.js'
import { exportSetup, importSetup, setupReportText } from './setup.js'
import { state } from './state.js'

/** What the editor view shows: status is none | unsaved | saving | saved | blocked | error. */
export const ed = { status: 'none', savedAt: 0, prev: null, blocked: null, error: '', knownBuf: null, loadId: 0, lastReport: null }
let handle = null          // set by the editor component: { exportDocx(): Promise<ArrayBuffer>, isDirty(): boolean, markClean(): void }
let saveTimer = null
let running = null         // the save in progress, so a second caller waits for it instead of starting another

export const registerEditor = (h) => { handle = h; if (!h) clearTimeout(saveTimer) }
export const editorActive = () => !!handle

/** The id the editor view reloads on: it changes only when the engine's docx changed from outside the editor. */
export function editorSourceId() {
  if (state.srcBuf !== ed.knownBuf) { ed.knownBuf = state.srcBuf; ed.loadId++; ed.status = 'none'; ed.blocked = null }
  return ed.loadId
}

const squash = (s) => s.replace(/\s+/g, ' ').trim()

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
  ed.prev = prev; ed.blocked = null; ed.savedAt = Date.now()
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

export const editorReportText = () => (ed.lastReport ? setupReportText(ed.lastReport) : '')

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
