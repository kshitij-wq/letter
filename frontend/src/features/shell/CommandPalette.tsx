import { Command } from 'cmdk'
import { Search, Tag } from 'lucide-react'
import { Dialog } from 'radix-ui'
import { useMemo, useState } from 'react'
import { es } from '@/hooks/useEngine'
import { useUi } from '@/store'
import { Kbd, cn } from '@/ui'
import { finalTag, flashRow, rowSearchText, rowStatus, setTab } from '../../engine'
import { collectCommands, type Command as Cmd } from './registry'

const GROUP_ORDER = ['Letter', 'Go to', 'View', 'Check', 'Download', 'Edit', 'Theme']
const itemCls = 'flex min-h-[34px] cursor-default select-none items-center gap-2.5 rounded-control px-2.5 py-1.5 text-base data-[selected=true]:bg-hairline-soft [&_svg]:text-muted'

/**
 * Ctrl/Cmd+K: jump to a step or view, find a placeholder by its text or tag, run a check, download. Only what is available
 * right now is listed. Type to filter, Up/Down to move, Enter to run, Esc to close.
 */
export function CommandPalette() {
  const open = useUi((s) => s.paletteOpen)
  const setOpen = useUi((s) => s.setPaletteOpen)
  const [query, setQuery] = useState('')
  const commands = useMemo(() => (open ? collectCommands() : []), [open])
  const groups = useMemo(() => {
    const m = new Map<string, Cmd[]>()
    for (const c of commands) m.set(c.group, [...(m.get(c.group) || []), c])
    // typing a step name ("valid") and pressing Enter should go to that step, so "Go to" leads once something is typed
    const order = query.trim() ? ['Go to', ...GROUP_ORDER.filter((g) => g !== 'Go to')] : GROUP_ORDER
    const rank = (g: string) => { const i = order.indexOf(g); return i < 0 ? 99 : i }
    return [...m].sort((a, b) => rank(a[0]) - rank(b[0]))
  }, [commands, query])
  // placeholders are only listed once something is typed (a list of fifty rows is not a menu)
  const rows = open && query.trim() && es.an ? (es.rows as any[]).filter((r) => r.count) : []
  const run = (fn: () => void) => { setOpen(false); setQuery(''); setTimeout(fn, 0) }
  // a file picker must start inside the click or key event that asked for it, so those commands run at once
  const runNow = (fn: () => void) => { setOpen(false); setQuery(''); fn() }

  return (
    <Dialog.Root open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQuery('') }}>
      <Dialog.Portal>
        <Dialog.Overlay className="anim-fade fixed inset-0 z-[60] bg-[var(--scrim)]" />
        <Dialog.Content aria-describedby={undefined} className="anim-pop fixed left-1/2 top-[14vh] z-[61] w-[min(560px,calc(100vw-24px))] -translate-x-1/2 overflow-hidden rounded-panel border border-hairline bg-panel shadow-pop outline-none">
          <Dialog.Title className="sr-only">Search and commands</Dialog.Title>
          <Command loop label="Search and commands" filter={(v, s, kw) => (`${v} ${(kw || []).join(' ')}`.toLowerCase().includes(s.toLowerCase().trim()) ? 1 : 0)}>
            <div className="flex items-center gap-2.5 border-b border-hairline-soft px-3.5">
              <Search aria-hidden className="text-muted" />
              <Command.Input value={query} onValueChange={setQuery} autoFocus placeholder={es.an ? 'Search commands and placeholders' : 'Search commands'} aria-label="Search commands"
                className="h-12 w-full bg-transparent text-lg text-ink outline-none placeholder:text-muted" />
              <Kbd>Esc</Kbd>
            </div>
            <Command.List className="max-h-[min(380px,55dvh)] overflow-y-auto overscroll-contain p-1.5">
              <Command.Empty className="px-3 py-8 text-center text-sm text-muted">Nothing matches “{query}”.</Command.Empty>
              {groups.map(([name, list]) => (
                <Command.Group key={name} heading={name}
                  className="[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-muted">
                  {list.map((c) => (
                    <Command.Item key={c.id} value={`${c.group} ${c.label}`} keywords={c.keywords} className={itemCls}
                      onSelect={() => (c.id.startsWith('letter.') ? runNow(c.run) : run(c.run))}>
                      {c.icon}<span className="min-w-0 flex-1 truncate">{c.label}</span>
                      {c.hint && <span className="text-xs text-muted">{c.hint}</span>}
                      {c.shortcut && <span className="text-xs text-muted">{c.shortcut}</span>}
                    </Command.Item>
                  ))}
                </Command.Group>
              ))}
              {rows.length > 0 && (
                <Command.Group heading="Placeholders"
                  className="[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-muted">
                  {rows.slice(0, 300).map((r) => {
                    const tag: string = finalTag(r)
                    const st = rowStatus(r)
                    return (
                      <Command.Item key={r.id} value={`placeholder ${rowSearchText(r)}`} className={itemCls} onSelect={() => run(() => { setTab('tags'); flashRow(r.id) })}>
                        <Tag aria-hidden />
                        <span className="min-w-0 flex-1 truncate font-serif">{r.find}</span>
                        <span className={cn('max-w-[45%] truncate font-mono text-xs', tag ? 'text-muted' : 'text-warn')}>{tag || (st === 'need' ? 'Needs a tag' : '')}</span>
                      </Command.Item>
                    )
                  })}
                </Command.Group>
              )}
            </Command.List>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
