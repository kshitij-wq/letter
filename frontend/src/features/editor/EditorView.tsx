import { lazy, Suspense } from 'react'
import { Undo2 } from 'lucide-react'
import { useEngineRev } from '@/hooks/useEngine'
import { Button, Notice } from '@/ui'
import { ed, editorSourceId, editorStatusText, keepBlockedChange, restoreBlockedTags, saveEditor, undoEditorChange } from '../../engine'

// The editor library is large: it loads when the Edit letter view is first opened.
const EditorSurface = lazy(() => import('./EditorSurface'))

/** The "Edit letter" view: the status line, the notices for a blocked save, and the editor itself. */
export function EditorView() {
  useEngineRev()
  const id = editorSourceId()
  const status = editorStatusText()
  const blocked = ed.blocked as { missing: string[] } | null

  return (
    <div className="mx-auto flex h-full w-full max-w-[960px] flex-col gap-2 px-1 pb-4">
      <div className="flex min-h-8 shrink-0 flex-wrap items-center gap-2">
        <span role="status" aria-live="polite" data-testid="editor-status" className="text-sm text-muted">{status || 'Edit the letter here. Tags stay as they are.'}</span>
        <span className="ml-auto flex gap-2">
          {ed.prev && <Button size="sm" onClick={() => undoEditorChange()} data-testid="editor-undo"><Undo2 aria-hidden />Undo editor change</Button>}
          <Button size="sm" variant="primary" disabled={ed.status !== 'unsaved' && ed.status !== 'error'} onClick={() => saveEditor()} data-testid="editor-save">Save changes</Button>
        </span>
      </div>
      {blocked && (
        <div data-testid="editor-blocked"><Notice tone="err" action={<><Button size="sm" variant="primary" onClick={restoreBlockedTags} data-testid="editor-restore-tags">Restore those tags</Button><Button size="sm" onClick={() => keepBlockedChange()} data-testid="editor-keep-change">Keep my change</Button></>}>
          This change would remove {blocked.missing.length === 1 ? 'a tag' : `${blocked.missing.length} tags`}: {blocked.missing.slice(0, 4).map((t, i) => <code key={i} className="mx-0.5 rounded-sm bg-hairline-soft px-1 font-mono text-[0.85em]">{t}</code>)}{blocked.missing.length > 4 ? ' and more' : ''}. Nothing was saved.
        </Notice></div>
      )}
      {ed.status === 'error' && <Notice tone="err">{ed.error || 'Could not save the changes.'} Your edits are still in the editor.</Notice>}
      <div className="min-h-0 flex-1">
        <Suspense fallback={<p className="p-3 text-muted" role="status">Opening the editor…</p>}>
          <EditorSurface key={id} />
        </Suspense>
      </div>
    </div>
  )
}
