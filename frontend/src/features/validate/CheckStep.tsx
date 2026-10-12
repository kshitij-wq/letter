import { CircleAlert, CircleCheck, TriangleAlert } from 'lucide-react'
import { es, useEngineRev } from '@/hooks/useEngine'
import { Button, Notice } from '@/ui'
import { decodeXmlText, scheduleRealCheck, server, stepInfo } from '../../engine'

const plain = (html: string) => decodeXmlText(String(html || '').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim()

/** R1 placeholder for Validate: the counts and the messages the page's own checks found. R2 replaces this file. */
export function CheckStep() {
  useEngineRev()
  const { info, done } = stepInfo() as { info: Record<string, { title: string }>; done: Record<string, boolean> }
  const checks = ((es.built && es.built.checks) || []) as { level: string; html: string }[]
  return (
    <div className="grid gap-4">
      <Notice tone={done.check ? 'ok' : checks.some((c) => c.level === 'error') ? 'err' : 'info'}>{info.check.title}</Notice>
      {server.ok && <div><Button disabled={server.checking} loading={server.checking} onClick={() => scheduleRealCheck()}>Check again with real Jinja</Button></div>}
      <ul className="grid gap-2">
        {checks.slice(0, 12).map((c, i) => {
          const Icon = c.level === 'error' ? CircleAlert : c.level === 'warn' ? TriangleAlert : CircleCheck
          return (
            <li key={i} className="flex items-start gap-2 text-base">
              <Icon aria-hidden className={c.level === 'error' ? 'mt-0.5 text-err' : c.level === 'warn' ? 'mt-0.5 text-warn' : 'mt-0.5 text-info'} />
              <span className="min-w-0 break-words">{plain(c.html)}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
