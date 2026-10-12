import { GitBranch } from 'lucide-react'
import { es, useEngineRev } from '@/hooks/useEngine'
import { Badge, Button, EmptyState } from '@/ui'
import { lgInfo, lgWord } from '../../engine'
import { showPid } from '../paper/navigate'

/** R1 placeholder for Conditions: the condition lines found in the letter. R2 replaces this file. */
export function LogicStep() {
  useEngineRev()
  const list = (es.lg as any[]).filter((e) => e.sub === undefined || e.sub === 0)
  if (!list.length) {
    return (
      <EmptyState icon={<GitBranch aria-hidden />} title="No conditions yet"
        action={<Button onClick={() => {
          const all = [...document.querySelectorAll<HTMLElement>('#paper p.lp.body')]
          const p = all.find((x) => (x.textContent || '').replace(/ /g, ' ').trim().length > 25) || all[0]
          if (p) showPid(p.dataset.pid as string)
        }}>Select a paragraph</Button>}>
        Pick a paragraph in the letter, then choose who should see it.
      </EmptyState>
    )
  }
  return (
    <ul className="grid gap-1">
      {list.map((e) => {
        const { en, label } = lgInfo(e) as { en: string; label: string }
        return (
          <li key={e.key}>
            <button type="button" onClick={() => showPid(e.pid)} className="flex w-full items-start gap-2 rounded-control px-2 py-2 text-left transition-colors duration-150 hover:bg-hairline-soft">
              <Badge tone="cond" className="mt-0.5">{lgWord(e.kw)}</Badge>
              <span className="min-w-0 flex-1 break-words text-base">{en || <code className="font-mono text-sm">{e.text}</code>}</span>
              {label && <Badge tone="err">{label}</Badge>}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
