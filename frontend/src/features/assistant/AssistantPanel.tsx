import { Send, Sparkles, Square, Trash2, Undo2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { es, useEngineRev } from '@/hooks/useEngine'
import { useUi } from '@/store'
import { Button, Chip, IconButton, Notice, Spinner, Switch, Textarea, cn } from '@/ui'
import { agentState, aiReady, canUndoCard, clearConversation, decide, sendMessage, setAutoApply, stopAgent, undoCard } from '../../engine'
import { useIsCompact } from '../shell/useMedia'

const STARTERS = [
  'Insert a tag here', 'Add a promotion condition', 'Fix the selected tag', 'Show this row only when the value is greater than zero',
  'Explain this condition', 'Validate the whole letter',
]

type Line = { page?: string; text: string }
type Item = { id: string; kind: string; text?: string; failed?: boolean; summary?: string; status?: string; error?: string; real?: string; problems?: { text: string }[]; diff?: { removed: Line[]; added: Line[]; more: number } }

/** What the next message is about: the selected paragraphs or words (the model gets the same in its context). */
function usingText() {
  const s = es.sel
  if (s.pids?.length) return s.pids.length === 1 ? 'the selected paragraph' : `${s.pids.length} selected paragraphs`
  if (s.text) return `“${s.text.length > 40 ? s.text.slice(0, 40) + '…' : s.text}”`
  return ''
}

const Lines = ({ title, lines, tone }: { title: string; lines: Line[]; tone: string }) => (
  <div>
    <div className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</div>
    {lines.map((l, i) => <p key={i} className={cn('mt-0.5 rounded-control px-2 py-1 text-sm leading-snug', tone)}>{l.page && <span className="mr-1 text-muted">{l.page}</span>}{l.text}</p>)}
  </div>
)

function Proposal({ it }: { it: Item }) {
  const d = it.diff
  const done = it.status !== 'pending'
  return (
    <div data-testid="proposal-card" data-status={it.status} className="flex flex-col gap-2 rounded-panel border border-hairline bg-panel p-3">
      <p className="text-base font-medium leading-snug">{it.summary}</p>
      {d && (d.removed.length > 0 || d.added.length > 0) && (
        <div className="flex flex-col gap-2">
          {d.removed.length > 0 && <Lines title="Before" lines={d.removed} tone="bg-err-wash" />}
          {d.added.length > 0 && <Lines title="After" lines={d.added} tone="bg-ok-wash" />}
          {d.more > 0 && <p className="text-xs text-muted">and {d.more} more changed lines</p>}
        </div>
      )}
      {!!it.problems?.length && <Notice tone="warn">This would add {it.problems.length === 1 ? 'a problem' : `${it.problems.length} problems`}: {it.problems.map((p) => p.text).join(' ')}</Notice>}
      {it.real && <p className="text-sm text-muted">{it.real}</p>}
      {it.error && <Notice tone="err">{it.error}</Notice>}
      {!done && (
        <div className="flex gap-2">
          <Button size="sm" variant="primary" onClick={() => decide(it.id, 'apply')} data-testid="proposal-apply">Apply</Button>
          <Button size="sm" onClick={() => decide(it.id, 'reject')} data-testid="proposal-reject">Reject</Button>
        </div>
      )}
      {done && (
        <div className="flex items-center gap-2 text-sm text-muted">
          <span data-testid="proposal-status">{{ applied: 'Applied', applying: 'Applying…', rejected: 'Rejected', undone: 'Undone', failed: 'Not applied' }[it.status as string]}</span>
          {canUndoCard(it as never) && <Button size="sm" variant="ghost" icon={<Undo2 aria-hidden />} onClick={() => undoCard(it.id)} data-testid="assistant-undo">Undo</Button>}
        </div>
      )}
    </div>
  )
}

function Row({ it }: { it: Item }) {
  if (it.kind === 'user') return <p className="ml-6 self-end rounded-panel bg-accent-wash px-3 py-2 text-base leading-snug" data-testid="msg-user">{it.text}</p>
  if (it.kind === 'assistant') return <p className="mr-6 whitespace-pre-wrap text-base leading-snug" data-testid="msg-assistant">{it.text}</p>
  if (it.kind === 'proposal') return <Proposal it={it} />
  return <p className={cn('text-sm', it.failed ? 'text-err' : 'text-muted')} data-testid="msg-work">{it.text}</p>
}

/** The Assistant: a chat in the right column. Claude reads the letter with tools and proposes changes; nothing changes until Apply. */
export function AssistantPanel() {
  useEngineRev()
  const close = useUi((s) => s.setAssistantOpen)
  const compact = useIsCompact()
  const [text, setText] = useState('')
  const end = useRef<HTMLDivElement>(null)
  const a = agentState
  const items = a.items as Item[]
  const using = usingText()
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }) }, [items.length, a.busy, a.error])
  const send = (t: string) => { if (t.trim() && !a.busy) { setText(''); sendMessage(t) } }

  return (
    <aside id="assistant" data-testid="assistant-panel" aria-label="Assistant"
      className={cn('enter-right z-40 flex shrink-0 flex-col bg-panel', compact ? 'absolute inset-y-0 right-0 w-[min(380px,100%)] shadow-pop' : 'w-[380px] border-l border-hairline-soft')}>
      <div className="flex h-12 shrink-0 items-center gap-2 pl-4 pr-2">
        <h2 className="flex min-w-0 flex-1 items-center gap-2 text-lg font-semibold"><Sparkles aria-hidden className="text-accent" />Assistant</h2>
        <IconButton label="Clear the conversation" size="sm" disabled={!items.length || a.busy} onClick={clearConversation}><Trash2 aria-hidden /></IconButton>
        <IconButton label="Close the assistant" size="sm" onClick={() => close(false)}><X aria-hidden /></IconButton>
      </div>
      {!aiReady() ? (
        <div className="px-4"><Notice tone="warn">Claude isn't set up yet. Add ANTHROPIC_API_KEY to the .env file in the letter-studio folder and restart.</Notice></div>
      ) : (
        <>
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-4 py-3" data-testid="assistant-log">
            {!items.length && (
              <div className="flex flex-col gap-2">
                <p className="text-sm text-muted">Ask about this letter. Claude reads it and proposes changes; nothing changes until you press Apply.</p>
                <div className="flex flex-wrap gap-1.5">{STARTERS.map((s) => <button key={s} type="button" onClick={() => send(s)} className="rounded-control border border-hairline px-2.5 py-1 text-left text-sm transition-colors hover:bg-hairline-soft">{s}</button>)}</div>
              </div>
            )}
            {items.map((it) => <Row key={it.id} it={it} />)}
            {a.busy && <p className="flex items-center gap-2 text-sm text-muted" role="status"><Spinner />Working… step {a.round}</p>}
            {a.error && <Notice tone="err">{a.error}</Notice>}
            <div ref={end} />
          </div>
          <div className="flex shrink-0 flex-col gap-2 border-t border-hairline-soft px-4 py-3">
            <Switch checked={a.autoApply} onCheckedChange={setAutoApply} className="text-sm">Apply small edits without asking</Switch>
            {using && <div className="text-sm text-muted" data-testid="assistant-using">Using: <Chip>{using}</Chip></div>}
            <Textarea value={text} rows={2} placeholder="Ask Claude about this letter" aria-label="Message to Claude" data-testid="assistant-input" onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(text) } }} />
            {a.busy
              ? <Button icon={<Square aria-hidden />} onClick={stopAgent} data-testid="assistant-stop">Stop</Button>
              : <Button variant="primary" icon={<Send aria-hidden />} disabled={!text.trim()} onClick={() => send(text)} data-testid="assistant-send">Send</Button>}
          </div>
        </>
      )}
    </aside>
  )
}
