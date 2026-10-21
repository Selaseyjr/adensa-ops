import { forwardRef } from 'react'
import { Label as LabelPrimitive } from '@radix-ui/react-label'
import { cn } from '../../lib/utils'

/** Label (shadcn/ui primitive, Radix core). Pairs with Input in forms. */
const Label = forwardRef<
  React.ElementRef<typeof LabelPrimitive>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive>
>(({ className, ...props }, ref) => (
  <LabelPrimitive
    ref={ref}
    className={cn(
      'text-sm font-medium leading-none text-foreground peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
      className,
    )}
    {...props}
  />
))
Label.displayName = 'Label'

export { Label }
