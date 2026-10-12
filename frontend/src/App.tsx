import { useEffect, useRef, useState } from 'react'
import { useEngineRev } from './hooks/useEngine'
import { loadSample, on, openLetterFile, paperHtml, state } from './engine'

// R0: just enough to prove the wiring (engine -> React -> single file). The real interface comes in R1/R2.
export default function App() {
  useEngineRev()
  const input = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState('')

  useEffect(() => {
    const offError = on('error', (e: { message: string }) => setMessage(e.message))
    const offToast = on('toast', (m: string) => setMessage(m))
    return () => { offError(); offToast() }
  }, [])

  return (
    <div className="shell">
      <header className="bar">
        <h1>Letter Tagger</h1>
        <input
          ref={input}
          type="file"
          accept=".docx"
          aria-label="Choose a letter (.docx)"
          onChange={async (e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) await openLetterFile(f)
          }}
        />
        <button type="button" onClick={() => loadSample()}>Sample letter</button>
        <span className="msg" role="status">{message || (state.an ? state.fileName : '')}</span>
      </header>
      <main>
        {state.an
          ? <div id="paper" className="paper" dangerouslySetInnerHTML={{ __html: paperHtml('source') }} />
          : <p className="empty">Choose a .docx letter, or open the sample letter.</p>}
      </main>
    </div>
  )
}
