import { useState, type ReactNode } from 'react'
import { cn } from '@/ui'

/**
 * A region that takes a dropped file but is not a button itself (its own buttons stay buttons). Marked data-dropzone so
 * the page-wide "dropped outside a zone" guard leaves it alone. Highlights while a file is over it.
 */
export function DropArea({ onFile, children, className }: { onFile: (f: File) => void; children: ReactNode; className?: string }) {
  const [over, setOver] = useState(false)
  const hasFiles = (e: React.DragEvent) => [...(e.dataTransfer?.types || [])].includes('Files')
  return (
    <div data-dropzone
      onDragEnter={(e) => { if (hasFiles(e)) { e.preventDefault(); setOver(true) } }}
      onDragOver={(e) => { if (hasFiles(e)) { e.preventDefault(); setOver(true) } }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false) }}
      onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) onFile(f) }}
      className={cn('-mx-2 rounded-panel px-2 py-2 transition-colors duration-150', over && 'bg-accent-wash', className)}>
      {children}
    </div>
  )
}
