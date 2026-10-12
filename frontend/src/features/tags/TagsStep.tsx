import { es, useEngineRev } from '@/hooks/useEngine'
import { EmptyState } from '@/ui'
import { FileText } from 'lucide-react'
import { Inventory } from './Inventory'
import { OldTags } from './OldTags'
import { SalaryTables } from './SalaryTables'
import { TagSettings } from './TagSettings'

/**
 * Tags & fields: every placeholder found in the letter and its tag (opens in the inspector), then the salary tables with empty
 * cells, how tags are written, and the tags the uploaded letter already had.
 */
export function TagsStep() {
  useEngineRev()
  if (!es.an) return <EmptyState icon={<FileText aria-hidden />} title="No letter yet">Open a letter in the Document step to see its placeholders.</EmptyState>
  return (
    <div className="flex flex-col gap-7">
      <Inventory />
      <SalaryTables />
      <TagSettings />
      <OldTags />
    </div>
  )
}
