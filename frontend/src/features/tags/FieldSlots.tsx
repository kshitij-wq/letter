import { Plus, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button, FieldPicker, IconButton, Input, type PickerGroup } from '@/ui'
import { PATTERN_RX, isPatternKey, joinKey, keySlots, setKeyPart, setRowKey } from '../../engine'

/**
 * The employee field(s) a placeholder prints: one picker, or several side by side ("first name + last name").
 * Typing in a picker's search box and choosing "Use ..." enters a column name that is not in the list.
 * The pattern fields (custom_schema.column_heading ...) have a word to replace: a small box under the picker takes it.
 */
export function FieldSlots({ id, fieldKey, groups, focusFirst }: { id: string; fieldKey: string; groups: PickerGroup[]; focusFirst?: boolean }) {
  const slots = keySlots(fieldKey)
  const [adding, setAdding] = useState(false)
  const nameBox = useRef<HTMLInputElement>(null)
  const select = useRef(false)

  // opened from the keyboard, or a new text with no field yet: the cursor goes to the first picker
  useEffect(() => { if (focusFirst) document.getElementById('tag-key-0')?.focus({ preventScroll: true }) }, [focusFirst, id])
  useEffect(() => { setAdding(false) }, [id])

  const change = (i: number, v: string) => {
    if (isPatternKey(v)) select.current = true
    setRowKey(id, setKeyPart(fieldKey, i, v))
    // the picker gives focus back to itself when it closes: take it for the name box afterwards
    if (select.current) setTimeout(() => {
      const box = nameBox.current, m = box && box.value.match(PATTERN_RX)
      if (box && m && m.index != null) { box.focus(); box.setSelectionRange(m.index, m.index + m[0].length) }
      select.current = false
    }, 60)
  }
  const patternAt = slots.findIndex(isPatternKey)

  return (
    <div className="flex flex-col gap-2">
      {(slots.length ? slots : ['']).map((k, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <FieldPicker id={`tag-key-${i}`} aria-label={slots.length > 1 ? `Employee field ${i + 1}` : 'Employee field'} value={k} groups={groups} allowCustom
            placeholder="Pick or type a field" searchPlaceholder="Search fields or type a name" customLabel={(t) => `Use “${t}” as the field`}
            emptyText="No field matches. Keep typing to use your own name." onChange={(v) => change(i, v)} />
          {slots.length > 1 && (
            <IconButton label={`Remove field ${i + 1}`} size="sm" onClick={() => setRowKey(id, setKeyPart(fieldKey, i, ''))}><X aria-hidden /></IconButton>
          )}
        </div>
      ))}
      {patternAt >= 0 && (
        <label className="flex flex-col gap-1 text-sm text-muted">
          Replace the word in the name
          <Input ref={nameBox} mono value={slots[patternAt]} onChange={(e) => setRowKey(id, setKeyPart(fieldKey, patternAt, e.target.value))} spellCheck={false} />
        </label>
      )}
      {adding && (
        <FieldPicker defaultOpen aria-label="Another employee field" value="" groups={groups} allowCustom placeholder="Pick another field" searchPlaceholder="Search fields or type a name"
          customLabel={(t) => `Use “${t}” as the field`} onOpenChange={(o) => { if (!o) setAdding(false) }}
          onChange={(v) => { setAdding(false); setRowKey(id, joinKey([...slots, v])) }} />
      )}
      {slots.length > 0 && !adding && (
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" icon={<Plus aria-hidden />} onClick={() => setAdding(true)}>Add another field</Button>
          <span className="text-sm text-muted">Printed side by side, such as first and last name.</span>
        </div>
      )}
    </div>
  )
}
