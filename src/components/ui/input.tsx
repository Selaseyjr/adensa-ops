import { forwardRef } from 'react'
import { cn } from '../../lib/utils'

/**
 * Input (shadcn/ui primitive).
 *
 * Classes mirror the console's existing hand-rolled inputs (search boxes,
 * PIN field) so adopting it changes nothing visually. Composes with Label
 * and FieldError for the form patterns upcoming features will need.
 */
const Input = forwardRef<HTMLInputElement, React.ComponentPropsWithoutRef<'input'>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={cn(
        'w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground',
        'placeholder:text-muted-foreground focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-ring',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  ),
)
Input.displayName = 'Input'

export { Input }
