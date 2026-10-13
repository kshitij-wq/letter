import { Check, Command, Download, Ellipsis, Redo2, Sparkles, Table2, Undo2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { es, useEngineRev } from '@/hooks/useEngine'
import { useUi } from '@/store'
import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger, IconButton, Kbd, modKey } from '@/ui'
import { HISTORY, downloadMapping, redo, saveStatusText, server, undo } from '../../engine'
import { runDownloadDocx } from './docx'
import { THEMES, ThemeMenu } from './ThemeMenu'

/** The CompUp mark: a rounded square in the accent with the C. */
export function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 18 18" aria-hidden className={className ?? 'size-[18px] shrink-0'}>
      <rect width="18" height="18" rx="4" fill="var(--accent)" />
      <path d="M12.25 6.4a4.1 4.1 0 1 0 0 5.2" fill="none" stroke="var(--accent-ink)" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

/** Button label that follows the .docx download: Download, Building…, Downloaded. */
function DocxLabel() {
  const docx = useUi((s) => s.docx)
  if (docx === 'busy') return <>Building…</>
  if (docx === 'done') return <>Downloaded</>
  return <>Download<span className="@max-[380px]:hidden"> tagged .docx</span></>
}

/** The top bar: brand, the open letter and what this browser has saved, search, theme, undo/redo and the two downloads. */
export function Header() {
  useEngineRev()
  const has = !!es.an
  const docx = useUi((s) => s.docx)
  const setPalette = useUi((s) => s.setPaletteOpen)
  const assistant = useUi((s) => s.assistantOpen)
  const setAssistant = useUi((s) => s.setAssistantOpen)
  const theme = useUi((s) => s.theme)
  const setTheme = useUi((s) => s.setTheme)
  // "Saved in this browser · 2 min ago" ages on its own
  const [, tick] = useState(0)
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 30000); return () => clearInterval(t) }, [])

  return (
    <header className="@container flex h-[52px] shrink-0 items-center gap-3 bg-panel px-4">
      <div className="flex min-w-0 items-center gap-2.5">
        <Mark />
        <span className="hidden font-semibold text-muted min-[640px]:inline">CompUp</span>
        <span aria-hidden className="hidden h-[18px] w-px bg-hairline min-[640px]:block" />
        <span className="text-lg font-semibold leading-none">Letter Tagger</span>
      </div>
      {has && (
        <div className="ml-2 hidden min-w-0 flex-1 flex-col justify-center leading-tight min-[640px]:flex">
          <span className="truncate text-base text-ink" title={es.fileName}>{es.fileName}</span>
          <span className="truncate text-xs text-muted" role="status">{saveStatusText()}</span>
        </div>
      )}
      <div className="ml-auto flex shrink-0 items-center gap-1">
        <Button variant="ghost" onClick={() => setPalette(true)} aria-label="Search and commands" aria-keyshortcuts="Control+K Meta+K"
          className="hidden text-muted min-[900px]:inline-flex">
          Search <Kbd>{modKey}</Kbd><Kbd>K</Kbd>
        </Button>
        {server.ok && <Button variant={assistant ? 'primary' : 'ghost'} icon={<Sparkles aria-hidden />} aria-pressed={assistant} onClick={() => setAssistant(!assistant)} data-testid="assistant-toggle">Assistant</Button>}
        <span className="hidden min-[561px]:inline-flex"><ThemeMenu /></span>
        <IconButton label="Undo" shortcut={`${modKey}+Z`} disabled={!has || !HISTORY.undo.length} onClick={undo}><Undo2 aria-hidden /></IconButton>
        <IconButton label="Redo" shortcut={`${modKey}+Shift+Z`} disabled={!has || !HISTORY.redo.length} onClick={redo}><Redo2 aria-hidden /></IconButton>
        <Button className="ml-2 hidden min-[561px]:inline-flex" disabled={!has} icon={<Table2 aria-hidden />} onClick={() => downloadMapping()}>Export mapping CSV</Button>
        <Button variant="primary" className="ml-1 max-[560px]:size-8 max-[560px]:px-0" disabled={!has} loading={docx === 'busy'}
          aria-label={docx === 'busy' ? 'Building the tagged .docx' : 'Download tagged .docx'}
          icon={docx === 'done' ? <Check aria-hidden /> : <Download aria-hidden />} onClick={() => runDownloadDocx()}>
          <span className="max-[560px]:sr-only"><DocxLabel /></span>
        </Button>
        {/* phones: theme, mapping CSV and search move into one menu */}
        <span className="min-[561px]:hidden">
          <DropdownMenu>
            <DropdownMenuTrigger asChild><IconButton label="More"><Ellipsis aria-hidden /></IconButton></DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem icon={<Table2 aria-hidden />} disabled={!has} onSelect={() => downloadMapping()}>Export mapping CSV</DropdownMenuItem>
              <DropdownMenuItem icon={<Command aria-hidden />} onSelect={() => setPalette(true)}>Search and commands</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Theme</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={theme} onValueChange={(v) => setTheme(v as typeof theme)}>
                {THEMES.map((t) => <DropdownMenuRadioItem key={t.value} value={t.value} icon={<t.icon aria-hidden />}>{t.label}</DropdownMenuRadioItem>)}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </span>
      </div>
    </header>
  )
}
