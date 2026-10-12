import { CircleCheck, ListChecks, Tag } from 'lucide-react'
import { es } from '@/hooks/useEngine'
import { finalTag, inventoryStats, rowField, setTab } from '../../engine'
import { registerCommands, type Command } from '../shell/registry'
import { acceptAll, reviewNext } from './Inventory'
import { locateRow, showRow } from './locate'

const MAX = 250
const short = (s: string, n = 64) => (s.length > n ? s.slice(0, n - 1) + '…' : s)

/** Palette: review the next placeholder, accept the suggestions, and jump to any placeholder in the letter by its text or field. */
registerCommands(() => {
  if (!es.an) return []
  const out: Command[] = []
  const st = inventoryStats()
  if (st.need + st.check > 0) out.push({ id: 'tags.review', group: 'Placeholders', label: 'Review next placeholder', keywords: ['tag', 'needs a tag', 'to check'], icon: <ListChecks aria-hidden />, run: () => { setTab('tags', { open: true }); reviewNext() } })
  if (st.check > 0) out.push({ id: 'tags.accept', group: 'Placeholders', label: 'Accept all suggestions', keywords: ['confirm', 'review'], icon: <CircleCheck aria-hidden />, run: () => { setTab('tags', { open: true }); acceptAll() } })
  let n = 0
  for (const r of es.rows as any[]) {
    if (!r.count || n >= MAX) continue
    n++
    const f = rowField(r)
    out.push({
      id: `ph.${r.id}`, group: 'Placeholders', label: short(r.find), hint: short(finalTag(r) || 'Needs a tag', 40), icon: <Tag aria-hidden />,
      keywords: ['placeholder', 'tag', r.key, f?.label, r.label].filter(Boolean),
      run: () => { setTab('tags', { open: true }); if (showRow(r.id)) locateRow(r.id, false) },
    })
  }
  return out
})
