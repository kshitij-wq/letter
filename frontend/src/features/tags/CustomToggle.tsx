import { Switch } from '@/ui'
import { canBeCustom, isCustomKey, setCustomKey } from '../../engine'

/**
 * "Custom tag": adds or removes `custom_schema.` in front of a field. One switch for every place a field is picked
 * (the inspector, the Next to tag card, the existing tags). It hands back the new key; the caller writes it.
 */
export function CustomToggle({ fieldKey, onChange, className, compact }: { fieldKey: string; onChange: (key: string) => void; className?: string; compact?: boolean }) {
  if (!fieldKey || !canBeCustom(fieldKey)) return null
  return (
    <div data-testid="custom-toggle">
    <Switch className={className} checked={isCustomKey(fieldKey)} onCheckedChange={(on) => onChange(setCustomKey(fieldKey, on))}>
      <span>Custom tag{compact ? null : <span className="text-sm text-muted"> · adds <code className="font-mono">custom_schema.</code> before the field</span>}</span>
    </Switch>
    </div>
  )
}
