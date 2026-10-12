import { createElement } from 'react'
import { FileCheck2, FileUp, Table2, Trash2 } from 'lucide-react'
import { es } from '@/hooks/useEngine'
import { clearData, loadSetupFile } from '../../engine'
import { confirm, toast } from '@/ui'
import { DATA_ACCEPT, LETTER_ACCEPT, openData, openTagged, pickFile } from '../shell/openFile'
import { registerCommands, registerStep } from '../shell/registry'
import { DocStep } from './DocStep'

registerStep('doc', { Panel: DocStep, hint: 'The letter and its employee data.' })

const icon = (I: typeof Table2) => createElement(I, { 'aria-hidden': true })

registerCommands(() => {
  if (!es.an) return []
  return [
    { id: 'data.add', group: 'Letter', label: es.csv ? 'Replace employee data…' : 'Add employee data…', keywords: ['csv', 'excel', 'xlsx', 'employees', 'upload'], icon: icon(Table2), run: () => pickFile(DATA_ACCEPT, (f) => openData(f)) },
    ...(es.csv ? [{ id: 'data.remove', group: 'Letter', label: 'Remove employee data', keywords: ['csv', 'clear'], icon: icon(Trash2), run: async () => {
      if (await confirm({ title: 'Remove the employee data?', body: 'Tags you mapped to its columns stay; previews switch to sample values.', confirmLabel: 'Remove', danger: true })) clearData()
    } }] : []),
    { id: 'tagged.check', group: 'Letter', label: 'Check a tagged template…', keywords: ['validate', 'upload', 'tagged'], icon: icon(FileCheck2), run: () => pickFile(LETTER_ACCEPT, openTagged) },
    { id: 'setup.load', group: 'Letter', label: 'Load a setup file…', keywords: ['restore', 'json', 'reuse'], icon: icon(FileUp), run: () => pickFile('.json,application/json', async (f) => {
      const r = await loadSetupFile(f)
      if (r.error) toast.error(r.error); else if (r.report) toast(r.report)
    }) },
  ]
})
