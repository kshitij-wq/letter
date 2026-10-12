import { Sparkles } from 'lucide-react'
import { es, useEngineRev } from '@/hooks/useEngine'
import { Button, Notice } from '@/ui'
import { aiReady, aiSuggestTags } from '../../engine'

/** "Suggest tags with Claude": only when the Letter Studio server has Claude ready (never on claude.ai, never without a key). */
export function ClaudeBar() {
  useEngineRev()
  if (!aiReady()) return null
  const a = es.ai || {}
  const busy = es.aiBusy === 'tags'
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <Button size="sm" icon={<Sparkles aria-hidden />} loading={busy} disabled={!!es.aiBusy && !busy} onClick={() => aiSuggestTags()}>{busy ? 'Asking Claude…' : 'Suggest tags with Claude'}</Button>
        <span className="min-w-0 flex-1 basis-40 text-sm text-muted">Uses the letter's wording, table headings and your data's column names.</span>
      </div>
      {a.tagErr && <Notice tone="err">{a.tagErr}</Notice>}
      {a.tagNotes?.length > 0 && (
        <ul className="flex list-disc flex-col gap-0.5 pl-5 text-sm text-muted">{a.tagNotes.map((n: string, i: number) => <li key={i}>{n}</li>)}</ul>
      )}
    </div>
  )
}
