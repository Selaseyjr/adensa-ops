import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Class-name merge helper (shadcn/ui convention).
 *
 * clsx builds conditional class lists; tailwind-merge resolves conflicts so
 * the last class wins (e.g. passing rounded-xl over a component's rounded-md
 * base). The ui/ primitives use it so callers can override any styling class
 * without knowing the component's internals.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
