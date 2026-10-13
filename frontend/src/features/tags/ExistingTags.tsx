import { useEffect, useState } from 'react'
import { useEngineRev } from '@/hooks/useEngine'
import { Button } from '@/ui'
import { oldTagNames } from '../../engine'
import { useOpenTag } from './existing'
import { NameRow } from './OldTags'

const SHOWN = 10

/** The tags the uploaded letter already had, up front: each name with its field, count and problems, Locate and rename. */
export function ExistingTags() {
  useEngineRev()
  const [all, setAll] = useState(false)
  const open = useOpenTag()
  const names = oldTagNames().names as any[]
  const openAt = open ? names.findIndex((n) => n.id === open.id) : -1
  useEffect(() => { if (openAt >= SHOWN) setAll(true) }, [openAt, open?.n])
  if (!names.length) return null
  const shown = all ? names : names.slice(0, SHOWN)
  return (
    <div className="flex flex-col gap-2" data-testid="existing-tags">
      <h3 className="text-lg font-semibold">Tags in the letter</h3>
      <p className="text-sm text-muted">Click a yellow tag in the letter to find it here, or use the pin to find it in the letter.</p>
      <ul className="divide-y divide-hairline-soft">
        {shown.map((n) => <NameRow key={n.id} n={n} />)}
      </ul>
      {names.length > SHOWN && <Button size="sm" variant="ghost" className="self-start" onClick={() => setAll((a) => !a)}>{all ? 'Show fewer tags' : `Show all ${names.length} tags`}</Button>}
    </div>
  )
}
