'use client';

/**
 * Dashboard widget showing the count of grocery items still to be
 * purchased. Registered via `groceriesModule.widgets`.
 */

import { Loader2, ShoppingCart } from 'lucide-react';
import { WidgetCard } from '@rambleraptor/homestead-core/shared/components/WidgetCard';
import { useGroceries } from '../hooks/useGroceries';

export function GroceriesWidget() {
  const { data: items, isLoading } = useGroceries();
  const remaining = items?.filter((item) => !item.checked).length ?? 0;

  return (
    <WidgetCard
      icon={ShoppingCart}
      title="Groceries"
      href="/groceries"
      data-testid="groceries-widget"
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
    </WidgetCard>
  );
}
