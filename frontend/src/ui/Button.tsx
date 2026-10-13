import { cva, type VariantProps } from 'class-variance-authority'
import type { ButtonHTMLAttributes, ReactElement, ReactNode, Ref } from 'react'
import { Slot } from 'radix-ui'
import { cn } from './cn'
import { Spinner } from './Spinner'
import { Tooltip } from './Tooltip'

const button = cva(
  'inline-flex shrink-0 select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-control border font-semibold leading-tight transition-colors duration-150 active:translate-y-px disabled:pointer-events-none disabled:opacity-45 aria-busy:pointer-events-none',
  {
    variants: {
      variant: {
        primary: 'border-accent bg-accent text-accent-ink shadow-key hover:border-accent-hover hover:bg-accent-hover disabled:opacity-60 disabled:shadow-none',
        secondary: 'border-hairline bg-panel text-ink shadow-key hover:border-accent-line hover:bg-accent-wash hover:text-accent',
        ghost: 'border-transparent bg-transparent text-muted hover:bg-accent-wash hover:text-accent',
        danger: 'border-err-line bg-panel text-err hover:border-err hover:bg-err-wash',
      },
      size: { sm: 'h-8 px-3 text-sm', md: 'h-10 px-4 text-base' },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
)

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof button> & {
  /** Shows a spinner in place of the icon and ignores clicks; the button keeps its size. */
  loading?: boolean
  /** A leading icon (a lucide icon element). */
  icon?: ReactNode
  /** Render as the child element (a label or link) with the same look. */
  asChild?: boolean
  ref?: Ref<HTMLButtonElement>
}

/** The one button: primary (one per view), secondary, ghost (quiet tools), danger. */
export function Button({ variant, size, loading, icon, asChild, className, children, disabled, type = 'button', ref, onClick, ...rest }: ButtonProps) {
  const cls = cn(button({ variant, size }), className)
  if (asChild) return <Slot.Root className={cls} onClick={onClick} {...rest}>{children as ReactElement}</Slot.Root>
  return (
    <button ref={ref} type={type} className={cls} disabled={disabled} aria-busy={loading || undefined} onClick={loading ? undefined : onClick} {...rest}>
      {loading ? <Spinner /> : icon}
      {children}
    </button>
  )
}

export type IconButtonProps = Omit<ButtonProps, 'children' | 'icon' | 'asChild'> & {
  /** Required: the accessible name and the tooltip. */
  label: string
  /** Shown after the label in the tooltip, e.g. "Ctrl+Z". */
  shortcut?: string
  children: ReactNode
  side?: 'top' | 'bottom' | 'left' | 'right'
}

/** A square icon-only button. Always named (aria-label) and always explained (tooltip). */
export function IconButton({ label, shortcut, variant = 'ghost', size = 'md', className, children, side, loading, ...rest }: IconButtonProps) {
  const sq = size === 'sm' ? 'size-8 px-0' : 'size-10 px-0'
  return (
    <Tooltip content={shortcut ? `${label} (${shortcut})` : label} side={side}>
      <Button variant={variant} size={size} loading={loading} aria-label={label} className={cn(sq, className)} {...rest}>{children}</Button>
    </Tooltip>
  )
}
