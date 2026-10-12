import { useVirtualizer } from '@tanstack/react-virtual'
import { useRef, type ReactNode } from 'react'
import { cn } from './cn'

/**
 * A long list that only draws the rows in view (employees, placeholders). Give it a height (via className) so it can scroll.
 * Rows are measured, so `estimateSize` only needs to be close. `renderItem` gets the item and its index.
 */
export function VirtualList<T>({ items, estimateSize = 48, overscan = 8, getKey, renderItem, className, label }: {
  items: T[]; estimateSize?: number; overscan?: number; getKey?: (item: T, i: number) => string | number; renderItem: (item: T, i: number) => ReactNode; className?: string; label?: string
}) {
  const parent = useRef<HTMLDivElement>(null)
  const v = useVirtualizer({ count: items.length, getScrollElement: () => parent.current, estimateSize: () => estimateSize, overscan, getItemKey: getKey ? (i) => getKey(items[i], i) : undefined })
  return (
    <div ref={parent} role="list" aria-label={label} className={cn('min-h-0 overflow-y-auto overscroll-contain', className)}>
      <div style={{ height: v.getTotalSize(), position: 'relative', width: '100%' }}>
        {v.getVirtualItems().map((row) => (
          <div key={row.key} role="listitem" data-index={row.index} ref={v.measureElement} style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${row.start}px)` }}>
            {renderItem(items[row.index], row.index)}
          </div>
        ))}
      </div>
    </div>
  )
}
