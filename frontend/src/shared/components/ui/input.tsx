import * as React from "react"

import { cn } from "@/shared/lib/utils"

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-9 w-full rounded-md border border-gray-300 bg-white px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-gray-950 placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-600 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:border-gray-700 dark:bg-gray-900 dark:file:text-gray-50 dark:placeholder:text-gray-400 dark:focus-visible:ring-primary-500",
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
