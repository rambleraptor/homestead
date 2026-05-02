import * as React from "react"

import { cn } from "@rambleraptor/homestead-core/shared/lib/utils"

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-9 w-full rounded-lg border border-gray-200 bg-surface-white px-3 py-1 text-base font-body text-text-main shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-brand-navy placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-terracotta/40 focus-visible:border-accent-terracotta disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
