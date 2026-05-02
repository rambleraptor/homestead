import React from 'react';
import type { ReactNode } from 'react';
import { Card as ShadcnCard, CardContent } from '@rambleraptor/homestead-core/shared/components/ui/card';

interface CardProps {
  children: ReactNode;
  className?: string;
}

export function Card({ children, className = '' }: CardProps) {
  return (
    <ShadcnCard className={className}>
      <CardContent className="p-6">
        {children}
      </CardContent>
    </ShadcnCard>
  );
}

// Re-export shadcn Card subcomponents for more advanced usage
export { CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@rambleraptor/homestead-core/shared/components/ui/card';
