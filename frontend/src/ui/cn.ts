import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Join class names; later Tailwind utilities win over earlier ones. */
export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs))
