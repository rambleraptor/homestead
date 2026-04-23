'use client';

/**
 * Dashboard widget showing the count of grocery items still to be
 * purchased. Registered via `groceriesModule.widgets`.
 */

import Link from 'next/link';
import { ArrowRight, Loader2, ShoppingCart } from 'lucide-react';
import { SectionCard } from '@/shared/components/SectionCard';
import { useGroceries } from '../hooks/useGroceries';

export function GroceriesWidget() {
  const { data: items, isLoading } = useGroceries();
  const remaining = items?.filter((item) => !item.checked).length ?? 0;

  return (
    <SectionCard
      icon={ShoppingCart}
      title="Groceries"
      action={
        <Link
          href="/groceries"
          className="text-sm font-medium text-accent-terracotta hover:text-accent-terracotta-hover flex items-center gap-1 transition-colors"
        >
          View list
          <ArrowRight className="w-4 h-4" />
        </Link>
      }
    >
      {isLoading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-6 h-6 text-text-muted animate-spin" />
        </div>
      ) : remaining > 0 ? (
        <div className="flex items-baseline gap-2 py-2">
          <span className="font-display text-3xl text-text-main">{remaining}</span>
          <span className="font-body text-text-muted">
            {remaining === 1 ? 'item left to buy' : 'items left to buy'}
          </span>
        </div>
      ) : (
        <p className="font-body text-text-muted py-2">
          Nothing left to buy — your list is clear.
        </p>
      )}
    </SectionCard>
  );
}
