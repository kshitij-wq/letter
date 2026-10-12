import { Toaster as Sonner, toast } from 'sonner'

export { toast }

/** Short messages at the bottom of the screen. Ink ground (inverts in dark), no colour fills; errors keep the message and say what to do. */
export function Toaster() {
  return (
    <Sonner position="bottom-center" duration={3600} visibleToasts={3} gap={8} offset={20} mobileOffset={16}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast: 'pointer-events-auto flex w-[min(420px,calc(100vw-32px))] items-start gap-2.5 rounded-control bg-ink px-3.5 py-2.5 text-base text-panel shadow-pop',
          title: 'leading-snug',
          description: 'text-sm opacity-75',
          icon: 'mt-0.5',
          actionButton: 'ml-auto rounded-control px-2 py-0.5 font-semibold text-accent-hover underline-offset-2 hover:underline',
        },
      }} />
  )
}
