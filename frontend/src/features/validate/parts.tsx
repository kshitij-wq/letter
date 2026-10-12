import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react'
import { Badge, cn } from '@/ui'
import { showPid } from '../paper/navigate'
import type { Chip } from './types'

/** The wording of a finding comes from the engine as HTML (escaped text with <code> around tags): style the tags like the letter does. */
export const MSG = 'break-words text-base leading-snug text-ink [&_code]:rounded-tag [&_code]:bg-tag-bg [&_code]:px-1 [&_code]:py-px [&_code]:font-mono [&_code]:text-xs [&_code]:text-tag'

export type Level = 'error' | 'warn' | 'info' | 'fixed'
export const LEVEL_TONE = { error: 'err', warn: 'warn', info: 'info', fixed: 'ok' } as const

/** Fix / Check / Note: the word is always there, the colour only repeats it. */
export function LevelBadge({ level, label }: { level: Level; label: string }) {
  return <Badge tone={LEVEL_TONE[level]}>{label}</Badge>
}

/** The lettered pennant, drawn like the one in the letter's margin so the two are easy to match. */
export function FlagLetter({ letter, level, quiet, className }: { letter: string; level: Level; quiet?: boolean; className?: string }) {
  if (!letter) return null
  return (
    <b role="img" aria-label={`Flag ${letter}${quiet ? ', resolved' : ''}`}
      className={cn('grid h-[16px] min-w-[18px] shrink-0 place-items-center pl-1 pr-[7px] text-[10.5px] font-bold leading-none text-panel [clip-path:polygon(0_0,76%_0,100%_50%,76%_100%,0_100%)]',
        quiet ? 'bg-muted' : level === 'error' ? 'bg-err' : 'bg-warn', className)}>
      {letter}
    </b>
  )
}

export const LEVEL_ICON = { error: CircleAlert, warn: TriangleAlert, info: Info, fixed: CircleCheck } as const
export const LEVEL_TEXT = { error: 'text-err', warn: 'text-warn', info: 'text-info', fixed: 'text-ok' } as const

/** Where a finding is: one button per paragraph (page, then the start of its text). Click to scroll the letter there. */
export function Places({ chips, more, onShow }: { chips: Chip[]; more?: boolean; onShow?: (pid: string) => void }) {
  if (!chips.length) return null
  return (
    <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Where in the letter">
      {chips.map((c) => (
        <button key={c.pid} type="button" title="Show in the letter" onClick={() => (onShow || showPid)(c.pid)}
          className="inline-flex h-6 max-w-full items-center gap-1 rounded-control bg-hairline-soft px-2 text-sm text-ink transition-colors duration-150 hover:bg-accent-wash hover:text-accent">
          {c.page && <b className="shrink-0 font-semibold">{c.page}</b>}
          <span className="truncate">{c.text}</span>
        </button>
      ))}
      {more && <span className="text-sm text-muted">and more</span>}
    </div>
  )
}
