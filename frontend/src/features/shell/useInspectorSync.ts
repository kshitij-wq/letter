import { useEffect, useRef } from 'react'
import { useEngineRev } from '@/hooks/useEngine'
import { useUi } from '@/store'
import { selectionSignature } from '../conditions/selection'

/**
 * The inspector follows the letter's selection: a new selection (paragraphs, words, a picking mode) opens the 'selection'
 * panel, replacing whatever was open (as the old page did); when the selection ends, that panel closes.
 * Esc and the X clear the selection through the panel's onClose, so the two never drift apart.
 */
export function useInspectorSync() {
  useEngineRev()
  const sig = selectionSignature()
  const prev = useRef<string | null>(null)
  useEffect(() => {
    const ui = useUi.getState()
    if (sig && sig !== prev.current && ui.inspector?.kind !== 'selection') ui.openInspector('selection')
    if (!sig && prev.current && ui.inspector?.kind === 'selection') ui.dismissInspector()
    prev.current = sig
  })
}
