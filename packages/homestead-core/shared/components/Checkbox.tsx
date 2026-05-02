import React from 'react';
import { forwardRef } from 'react';
import type { ComponentPropsWithoutRef, ElementRef } from 'react';
import { Checkbox as ShadcnCheckbox } from '@rambleraptor/homestead-core/shared/components/ui/checkbox';

export interface CheckboxProps extends ComponentPropsWithoutRef<typeof ShadcnCheckbox> {
  onCheckedChange?: (checked: boolean) => void;
}

export const Checkbox = forwardRef<ElementRef<typeof ShadcnCheckbox>, CheckboxProps>(
  ({ onCheckedChange, ...props }, ref) => {
    return (
      <ShadcnCheckbox
        ref={ref}
        onCheckedChange={onCheckedChange}
        {...props}
      />
    );
  }
);

Checkbox.displayName = 'Checkbox';
