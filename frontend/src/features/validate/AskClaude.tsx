import { Sparkles } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { es, useEngineRev } from '@/hooks/useEngine'
import { Button, Input, Section } from '@/ui'
import { aiAsk, aiReady, aiReview, locateTags, placeChips, server } from '../../engine'
import { LevelBadge, Places, type Level } from './parts'

const SEV: Record<string, { level: Level; label: string }> = { fix: { level: 'error', label: 'Fix' }, check: { level: 'warn', label: 'Check' }, idea: { level: 'info', label: 'Idea' } }

type ReviewItem = { severity?: string; title?: string; detail?: string; suggestion?: string; quote?: string }

function Setup() {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
      <p className="text-sm text-muted">Claude can review this letter once it's set up.</p>
      <details className="group text-sm">
        <summary className="inline-flex min-h-7 cursor-pointer list-none items-center text-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-accent">Set up Claude (for whoever runs this tool)</summary>
        <ol className="mt-1 list-decimal space-y-1 pl-5">
          <li>In the <code className="font-mono text-xs">letter-studio</code> folder, create a file named <code className="font-mono text-xs">.env</code> (PyCharm: right-click the folder, then New, then File).</li>
          <li>Put this line in it, with your key from console.anthropic.com: <code className="font-mono text-xs">ANTHROPIC_API_KEY=sk-ant-…</code></li>
          <li>Restart Letter Studio (stop it, then run it again) and refresh this page.</li>
        </ol>
        <p className="mt-2 text-muted">The .env file stays on your computer; git ignores it, so the key never goes to GitHub.</p>
      </details>
    </div>
  )
}

/** Ask Claude: a review of the template and a question box. Only where the back end is (not on claude.ai); a setup note when no key is set. */
export function AskClaude() {
  useEngineRev()
  const [q, setQ] = useState<string>(() => (es.ai && es.ai.q) || '')
  if (!server.ok) return null
  const a = (es.ai || {}) as { review?: { summary?: string; items?: ReviewItem[] }; reviewErr?: string; askErr?: string; answer?: { q: string; answer: string; tags: string[] } }
  const ready = aiReady()
  const model: string = (server.info as { assistant?: { model?: string } } | null)?.assistant?.model || ''
  const busy = es.aiBusy as string
  const ask = (e: FormEvent) => { e.preventDefault(); aiAsk(q) }
  return (
    <Section title="Ask Claude" count={ready ? model : 'not set up'} defaultOpen={false}>
      {!ready ? <Setup /> : (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
          <p className="text-sm text-muted">Sends this letter's text, its tags and your data's column names to Claude with your API key. No employee rows; only the values of columns with a few categories, such as levels or yes/no.</p>
          <div>
            <Button loading={busy === 'review'} disabled={!!busy && busy !== 'review'} icon={<Sparkles aria-hidden />} onClick={() => aiReview()}>
              {busy === 'review' ? 'Claude is reading the letter…' : 'Review this template'}
            </Button>
          </div>
          {a.reviewErr && <p role="alert" className="text-sm text-err">{a.reviewErr}</p>}
          {a.review && (
            <div className="grid grid-cols-[minmax(0,1fr)] gap-2" data-ai="review">
              {a.review.summary && <p className="text-base">{a.review.summary}</p>}
              <ul className="divide-y divide-hairline-soft">
                {(a.review.items || []).map((x, i) => {
                  const s = SEV[x.severity || ''] || { level: 'info' as Level, label: 'Note' }
                  return (
                    <li key={i} className="grid grid-cols-[minmax(0,1fr)] gap-1.5 py-3">
                      <div><LevelBadge level={s.level} label={s.label} /></div>
                      <p className="text-base leading-snug"><b>{x.title}</b> {x.detail}</p>
                      {x.suggestion && <p className="text-sm text-muted">Suggested: <code className="rounded-tag bg-tag-bg px-1 font-mono text-xs text-tag">{x.suggestion}</code></p>}
                      {x.quote && <Places chips={placeChips(locateTags([x.quote], 3))} />}
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
          <form onSubmit={ask} className="flex gap-2">
            <Input value={q} onChange={(e) => setQ(e.target.value)} aria-label="Question for Claude" placeholder="Ask about this letter, e.g. which amounts come from the old salary?" className="min-w-0 flex-1" />
            <Button type="submit" loading={busy === 'ask'} disabled={!!busy && busy !== 'ask'}>{busy === 'ask' ? 'Asking…' : 'Ask'}</Button>
          </form>
          {a.askErr && <p role="alert" className="text-sm text-err">{a.askErr}</p>}
          {a.answer && (
            <div className="grid grid-cols-[minmax(0,1fr)] gap-1.5 rounded-panel bg-hairline-soft px-3 py-2.5" data-ai="answer">
              <p className="text-base font-semibold">{a.answer.q}</p>
              <p className="whitespace-pre-wrap text-base leading-snug">{a.answer.answer}</p>
              {a.answer.tags.length > 0 && <div className="flex flex-wrap gap-1">{a.answer.tags.map((t) => <code key={t} className="rounded-tag bg-tag-bg px-1 font-mono text-xs text-tag">{t}</code>)}</div>}
            </div>
          )}
        </div>
      )}
    </Section>
  )
}
