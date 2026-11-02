import { Monitor, Moon, Sun } from 'lucide-react'
import type { Theme } from '@/store'

/** System / Light / Dark (in the header's More menu). "System" follows the device (or the page this is embedded in). */
export const THEMES: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: 'system', label: 'System', icon: Monitor },
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
]
