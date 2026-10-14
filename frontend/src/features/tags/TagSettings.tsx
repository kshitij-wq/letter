import { es, useEngineRev } from '@/hooks/useEngine'
import { Checkbox, Section, Select } from '@/ui'
import { changeSettings } from '../../engine'
import { useCollapsed } from './useCollapsed'

const MONEY = [
  { value: 'indian', label: 'Indian commas', hint: '{{ ctc | indian_comma }}' },
  { value: 'indian_round', label: 'Indian commas, whole number' },
  { value: 'dec0', label: 'No decimals', hint: "'{:.0f}'.format(…)" },
  { value: 'house', label: 'House style · blank when empty or 0' },
  { value: 'dash', label: 'House style · “-” when empty or 0' },
  { value: 'intl', label: 'International commas', hint: 'int_comma' },
  { value: 'none', label: 'As is', hint: '{{ ctc }}' },
]
const SPACING = [{ value: '1', label: '{{ first_name }}' }, { value: '0', label: '{{first_name}}' }]

/** How every tag is written: the money format, the spacing inside {{ }}, a guard against blanks, and whether replaced text loses its highlight. */
export function TagSettings() {
  useEngineRev()
  const [open, setOpen] = useCollapsed('settingsBox', false)
  const s = es.settings
  return (
    <Section title="Tag settings" summary={`${MONEY.find((m) => m.value === s.money)?.label ?? 'Money format'} · ${s.spaced ? '{{ first_name }}' : '{{first_name}}'}`} open={open} onOpenChange={setOpen}>
      <div className="flex flex-col gap-3.5">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="set-money" className="text-sm font-medium">Money format</label>
          <Select id="set-money" value={s.money} onValueChange={(v) => changeSettings({ money: v })} options={MONEY} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="set-space" className="text-sm font-medium">Tag spacing</label>
          <Select id="set-space" value={s.spaced ? '1' : '0'} onValueChange={(v) => changeSettings({ spaced: v === '1' })} options={SPACING} />
        </div>
        <Checkbox checked={!!s.guard} onCheckedChange={(on) => changeSettings({ guard: on })}>Guard against blanks with <code className="font-mono text-xs">default(…, true)</code></Checkbox>
        <Checkbox checked={s.removeHl !== false} onCheckedChange={(on) => changeSettings({ removeHl: on })}>Remove yellow highlight from replaced text</Checkbox>
      </div>
    </Section>
  )
}
