import { useState, type KeyboardEvent, type Ref } from 'react'
import { Input, Textarea } from '@/ui'

/**
 * A field for a tag (mono). While the person types it shows what they typed, so the cursor never jumps when the engine
 * straightens quotes; when they leave it, it shows what the engine has. `multiline` wraps a long tag instead of scrolling
 * it sideways (Enter does not add a line: a tag is one line).
 */
export function TagInput({ value, onValueChange, multiline, invalid, ref, className, ...rest }: {
  value: string; onValueChange: (v: string) => void; multiline?: boolean; invalid?: boolean; ref?: Ref<HTMLTextAreaElement & HTMLInputElement>; className?: string
  id?: string; placeholder?: string; 'aria-label'?: string; 'aria-describedby'?: string; disabled?: boolean; title?: string
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const common = {
    value: draft ?? value, invalid, spellCheck: false, autoComplete: 'off', mono: true, className,
    onChange: (e: { target: { value: string } }) => { setDraft(e.target.value); onValueChange(e.target.value) },
    onBlur: () => setDraft(null),
    ...rest,
  }
  if (multiline) {
    return <Textarea ref={ref} rows={2} {...common} onKeyDown={(e: KeyboardEvent) => { if (e.key === 'Enter') e.preventDefault() }} />
  }
  return <Input ref={ref} {...common} />
}
