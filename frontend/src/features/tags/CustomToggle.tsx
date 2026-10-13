import { Switch } from '@/ui'
import { canBeCustom, customReason, isCustomKey, setCustomKey } from '../../engine'

/**
 * "Custom tag": adds or removes `custom_schema.` in front of a field. One switch for every place a field is picked
 * (the inspector, the Next to tag card, the existing tags). It hands back the new key; the caller writes it.
 * It is there whenever a field is set. When it can't apply (a tag typed by hand, a formula) it stays, switched off, with the reason.
 */
export function CustomToggle({ fieldKey, onChange, className, compact }: { fieldKey: string; onChange: (key: string) => void; className?: string; compact?: boolean }) {
  if (!fieldKey) return null
  const can = canBeCustom(fieldKey)
  const why = customReason(fieldKey)
  return (
    <div data-testid="custom-toggle">
      <Switch className={className} disabled={!can} checked={isCustomKey(fieldKey)} onCheckedChange={(on) => onChange(setCustomKey(fieldKey, on))}>
        <span>Custom tag{compact || !can ? null : <span className="text-sm text-muted"> · adds <code className="font-mono">custom_schema.</code> before the field</span>}</span>
      </Switch>
      {!can && why && <p data-testid="custom-reason" className="mt-0.5 text-sm text-muted">{why}</p>}
    </div>
  )
}
