import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Button as ShadcnButton } from '@/shared/components/ui/button';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  children: ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  ...props
}: ButtonProps) {
  // Map old variants to shadcn/ui variants
  const variantMap = {
    primary: 'default' as const,
    secondary: 'secondary' as const,
    danger: 'destructive' as const,
  };

  // Map old sizes to shadcn/ui sizes
  const sizeMap = {
    sm: 'sm' as const,
    md: 'default' as const,
    lg: 'lg' as const,
  };

  return (
    <ShadcnButton
      variant={variantMap[variant]}
      size={sizeMap[size]}
      className={className}
      {...props}
    >
      {children}
    </ShadcnButton>
  );
}
