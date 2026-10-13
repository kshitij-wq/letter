import { es, useEngineRev } from '@/hooks/useEngine'
import { EmptyState, Section } from '@/ui'
import { FileText } from 'lucide-react'
import { AddForm, Inventory } from './Inventory'
import { OldTags } from './OldTags'
import { SalaryTables } from './SalaryTables'
import { TagSettings } from './TagSettings'
import { useCollapsed } from './useCollapsed'

/**
 * Tags & fields: how far along you are and the next placeholder to tag, then every placeholder found in the letter (a tag opens
 * in the inspector). The less-used parts sit below, folded with a one-line summary: salary tables with empty cells, other text to
 * tag, how tags are written, and the tags the uploaded letter already had.
 */
export function TagsStep() {
  useEngineRev()
  const [addOpen, setAddOpen] = useCollapsed('addTextBlock', false)
  if (!es.an) return <EmptyState icon={<FileText aria-hidden />} title="No letter yet">Open a letter in the Document step to see its placeholders.</EmptyState>
  return (
    <div className="flex flex-col gap-8">
      <Inventory />
      <div className="flex flex-col gap-1">
        <SalaryTables />
        <Section title="Other text to tag" summary="Words the page did not find as placeholders." open={addOpen} onOpenChange={setAddOpen}><AddForm /></Section>
        <TagSettings />
        <OldTags />
      </div>
    </div>
  )
}
