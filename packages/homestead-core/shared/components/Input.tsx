import React from 'react';
import type { InputHTMLAttributes } from 'react';
import { Input as ShadcnInput } from '@rambleraptor/homestead-core/shared/components/ui/input';
import { Label } from '@rambleraptor/homestead-core/shared/components/ui/label';
import { cn } from '@rambleraptor/homestead-core/shared/lib/utils';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export function Input({ label, error, className = '', ...props }: InputProps) {
  return (
    <div className="w-full">
      {label && (
        <Label htmlFor={props.id} className="mb-2">
          {label}
        </Label>
      )}
      <ShadcnInput
        className={cn(
          error && 'border-red-500 focus-visible:ring-red-500',
          className
        )}
        {...props}
      />
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  );
}
