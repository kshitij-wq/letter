import { Monitor, Moon, Sun } from 'lucide-react'
import { useUi, type Theme } from '@/store'
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger, IconButton } from '@/ui'

export const THEMES: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: 'system', label: 'System', icon: Monitor },
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
]

/** System / Light / Dark. "System" follows the device (or the page this is embedded in). */
export function ThemeMenu() {
  const theme = useUi((s) => s.theme)
  const setTheme = useUi((s) => s.setTheme)
  const cur = THEMES.find((t) => t.value === theme) ?? THEMES[0]
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton label={`Theme: ${cur.label}`}><cur.icon aria-hidden /></IconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuRadioGroup value={theme} onValueChange={(v) => setTheme(v as Theme)}>
          {THEMES.map((t) => <DropdownMenuRadioItem key={t.value} value={t.value} icon={<t.icon aria-hidden />}>{t.label}</DropdownMenuRadioItem>)}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
