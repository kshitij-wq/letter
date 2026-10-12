import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { cn } from './cn'

/**
 * A big target for a file: drop it, click it, or press Enter. Calls onFiles with the chosen files (one unless `multiple`).
 * Marked data-dropzone so the page-wide "dropped outside a zone" guard leaves it alone.
 */
export function DropZone({ onFiles, accept, multiple, children, label, className, disabled }: {
  onFiles: (files: File[]) => void; accept?: string; multiple?: boolean; children: ReactNode; label: string; className?: string; disabled?: boolean
}) {
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const take = (list: FileList | null) => { const f = [...(list || [])]; if (f.length) onFiles(multiple ? f : f.slice(0, 1)) }
  const key = (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.current?.click() } }
  return (
    <div data-dropzone role="button" tabIndex={disabled ? -1 : 0} aria-label={label} aria-disabled={disabled || undefined}
      onClick={() => !disabled && input.current?.click()} onKeyDown={key}
      onDragEnter={(e) => { e.preventDefault(); setOver(true) }}
      onDragOver={(e) => { e.preventDefault(); setOver(true) }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false) }}
      onDrop={(e) => { e.preventDefault(); setOver(false); if (!disabled) take(e.dataTransfer.files) }}
      className={cn('cursor-pointer rounded-panel transition-colors duration-150', over && 'bg-accent-wash', className)}>
      <input ref={input} type="file" accept={accept} multiple={multiple} hidden tabIndex={-1}
        onChange={(e) => { take(e.target.files); e.target.value = '' }} />
      {children}
    </div>
  )
}
