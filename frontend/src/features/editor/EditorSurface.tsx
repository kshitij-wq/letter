import { useEffect, useRef, useState } from 'react'
import { SuperDoc } from 'superdoc'
import 'superdoc/style.css'
import { Tag } from 'lucide-react'
import { Button, toast } from '@/ui'
import { setView } from '../../engine'
import { editorChanged, editorDocx, editorInput, finalTag, flushEditor, registerEditor, selectEditorWords, squash, state, subscribe, tagSyntaxProblem, unregisterEditor } from '../../engine'
import { firePaper } from '../paper/paperEvents'
import { installTagChips, type ChipHooks } from './tagChips'
import './editor.css'

type Sel = { text: string; para: string; before: number } | null

/**
 * SuperDoc on the tagged letter (what Download gives). It is made once per letter and build (the parent remounts it when
 * the letter or its tags change from outside); typing marks the engine's editor state "unsaved", and the engine saves it back (engine/editor.js).
 */
export default function EditorSurface() {
  const host = useRef<HTMLDivElement>(null)
  const bar = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState('')
  const [sel, setSel] = useState<Sel>(null)

  useEffect(() => {
    if (!host.current || !bar.current || !state.srcBuf) return
    let base: any = null, exported: any = null, dirty = false, live = true, sd: any = null, stopChips = () => {}, chips: ReturnType<typeof installTagChips> | null = null, unsub = () => {}, fitWatch: ResizeObserver | null = null
    const srcName = state.fileName || 'letter.docx'
    const handle = {
      exportDocx: async () => {
        exported = sd?.activeEditor?.state?.doc ?? null   // what this save holds: words typed while it runs stay unsaved
        const blob: Blob = await sd.export({ exportType: ['docx'], triggerDownload: false, commentsType: 'clean' })
        return blob.arrayBuffer()
      },
      isDirty: () => dirty,
      markClean: () => {
        const doc = sd?.activeEditor?.state?.doc
        base = exported ?? doc ?? base; exported = null
        dirty = !!(doc && base && !doc.eq(base))
      },
    }
    const readSel = () => {
      const ed = sd?.activeEditor
      if (!ed?.state) return
      const { from, to, $from } = ed.state.selection
      if (from === to) { setSel(null); return }
      const text = ed.state.doc.textBetween(from, to, ' ').replace(/\s+/g, ' ').trim()
      if (!text || text.length > 300 || !$from.sameParent(ed.state.selection.$to)) { setSel(null); return }
      setSel({ text, para: $from.parent.textContent, before: $from.parentOffset })
    }
    const hooks: ChipHooks = {
      classify: (tag) => {
        const marks = (state as any).tagMarks as Map<string, { level: string; msg: string }> | undefined
        const bad = tagSyntaxProblem(tag) || (marks?.get(squash(tag))?.level === 'error' ? marks.get(squash(tag))!.msg : '')
        if (bad) return { kind: 'bad', title: bad }
        if (tag.startsWith('{%')) return { kind: 'block', title: 'Condition' }
        if (/custom_schema\./.test(tag)) return { kind: 'custom', title: 'Custom field' }
        return { kind: 'var', title: 'Field' }
      },
      onChip: (tag, el) => {
        if (tag.startsWith('{%')) {
          const e = (state.lg as any[]).find((x) => squash(x.text) === squash(tag))
          if (e) firePaper('logic', { key: e.key, el })
          return
        }
        const r = (state.rows as any[]).find((x) => squash(finalTag(x) || '') === squash(tag))
        if (r) firePaper('placeholder', { id: r.id, el })
      },
    }
    const start = async () => {
      const file = new File([await editorInput(await editorDocx())], srcName, { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
      if (!live) return
      sd = new SuperDoc({
        selector: host.current,
        toolbar: '#editor-toolbar',
        document: file,
        documentMode: 'editing',
        modules: { comments: false },
        rulers: false,
        onReady: () => {
          if (!live) return
          registerEditor(handle)
          setReady(true)
          // the editor settles its own document after opening: what it shows a moment later is the starting point
          setTimeout(() => { if (live) base = sd?.activeEditor?.state?.doc ?? null }, 700)
          ;(window as any).__sd = sd
          chips = installTagChips(host.current!, hooks)
          stopChips = chips.stop
          unsub = subscribe(() => chips?.refresh())
          // a page wider than its frame (Assistant open, a phone) shrinks to fit the frame instead of running off its right edge
          const fit = () => {
            try {
              const narrow = host.current!.clientWidth < 840
              const mode = sd?.getZoomState?.()?.mode
              if (narrow && mode !== 'fit-width') sd?.setZoomMode?.('fit-width')
              else if (!narrow && mode === 'fit-width') { sd?.setZoomMode?.('manual'); sd?.setZoom?.(100) }
              chips?.refresh()
            } catch { /* the editor still scrolls inside its own frame */ }
          }
          fitWatch = new ResizeObserver(fit); fitWatch.observe(host.current!); fit()
        },
        onEditorUpdate: ({ editor }: any) => {
          const doc = editor?.state?.doc ?? sd?.activeEditor?.state?.doc
          if (!live || !base || !doc) return
          if (doc.eq(base)) { dirty = false; return }
          dirty = true; editorChanged()
        },
        onEditorCreate: ({ editor }: any) => { try { editor.on('selectionUpdate', readSel) } catch { /* the toolbar still works */ } },
        onException: (e: any) => { console.warn('SuperDoc', e); if (live && !ready) setFailed('The editor could not open this letter. The other views still work.') },
        onContentError: () => { if (live) setFailed('The editor could not open this letter. The other views still work.') },
      } as any)
    }
    start().catch((e) => { console.warn(e); setFailed('The editor could not start in this browser.') })

    return () => {
      live = false
      stopChips(); unsub(); fitWatch?.disconnect()
      // a save in progress has to finish before the editor goes away
      flushEditor().catch(() => {}).finally(() => { unregisterEditor(handle); try { sd?.destroy() } catch { /* already gone */ } if ((window as any).__sd === sd) (window as any).__sd = null })
    }
  }, [])

  const tagSelection = async () => {
    if (!sel) return
    if (await selectEditorWords(sel.text, sel.para, sel.before)) setView('source')
    else toast("Couldn't match that selection to one place in the letter. Select a few words inside one paragraph.")
  }

  return (
    <div className="editor-wrap" data-testid="editor">
      <div className="editor-tools">
        <div id="editor-toolbar" ref={bar} className="editor-toolbar" />
        {sel && <Button size="sm" onClick={tagSelection} data-testid="editor-tag-text"><Tag aria-hidden />Tag this text</Button>}
      </div>
      {failed && <p role="alert" className="editor-fail">{failed}</p>}
      {!ready && !failed && <p className="editor-loading" role="status">Opening the editor…</p>}
      <div ref={host} id="editor-host" className="editor-host" />
    </div>
  )
}
