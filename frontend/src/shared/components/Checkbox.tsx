import { forwardRef } from 'react';
import type { InputHTMLAttributes } from 'react';

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange'> {
  onCheckedChange?: (checked: boolean) => void;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ onCheckedChange, className = '', ...props }, ref) => {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      onCheckedChange?.(e.target.checked);
    };

    return (
      <input
        type="checkbox"
        ref={ref}
        className={`
          h-4 w-4 rounded border-gray-300 dark:border-gray-600
          text-blue-600 dark:text-blue-500
          focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400
          focus:ring-offset-2 dark:focus:ring-offset-gray-800
          bg-white dark:bg-gray-700
          cursor-pointer
          ${className}
        `}
        onChange={handleChange}
        {...props}
      />
    );
  }
);

Checkbox.displayName = 'Checkbox';
