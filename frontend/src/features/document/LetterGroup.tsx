import { Upload } from 'lucide-react'
import { Button } from '@/ui'
import { letterSummary } from '../../engine'
import { LETTER_ACCEPT, openLetter, openTagged, pickFile } from '../shell/openFile'
import { DropArea } from './DropArea'

/** The client's letter: its name, what is in it, and the two ways to open another one. A .docx dropped here replaces it. */
export function LetterGroup() {
  const s = letterSummary()
  return (
    <DropArea onFile={openLetter}>
      <h3 className="text-base font-semibold">Client letter</h3>
      {s ? (
        <>
          <p className="mt-1 break-words" data-testid="doc-name">{s.name}{s.isSample && <span className="text-muted"> (sample letter)</span>}</p>
          <p className={s.empty ? 'text-sm text-warn' : 'text-sm text-muted'}>{s.text}</p>
        </>
      ) : <p className="mt-1 text-muted">No letter loaded</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" icon={<Upload aria-hidden />} onClick={() => pickFile(LETTER_ACCEPT, openLetter)}>{s ? 'Replace letter…' : 'Choose a letter…'}</Button>
        <Button size="sm" variant="ghost" onClick={() => pickFile(LETTER_ACCEPT, openTagged)}>Check a tagged template…</Button>
      </div>
      <p className="mt-2 text-sm text-muted">Already tagged? Check it to see every problem with its tags and conditions, and where each one is.</p>
    </DropArea>
  )
}
