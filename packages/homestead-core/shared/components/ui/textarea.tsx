import * as React from "react"

import { cn } from "@rambleraptor/homestead-core/shared/lib/utils"

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-[60px] w-full rounded-lg border border-gray-200 bg-surface-white px-3 py-2 text-base font-body text-text-main shadow-sm placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-terracotta/40 focus-visible:border-accent-terracotta disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Textarea.displayName = "Textarea"

export { Textarea }
