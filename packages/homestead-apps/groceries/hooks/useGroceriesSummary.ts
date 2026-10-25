/**
 * The groceries widget in one line, for the agentic home's briefing. Never
 * urgent: a shopping list is standing state, not an appointment.
 */

import type { WidgetSummary } from '@rambleraptor/homestead-core/apps/types';
import { useGroceries } from './useGroceries';

export default function useGroceriesSummary(): WidgetSummary | null | undefined {
  const { data: items, isLoading } = useGroceries();
  if (isLoading) return undefined;
  const remaining = items?.filter((item) => !item.checked).length ?? 0;
  if (remaining === 0) return null;
  return { headline: remaining === 1 ? '1 item left to buy' : `${remaining} items left to buy` };
}
