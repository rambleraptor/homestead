/**
 * The Today card in one line, for the agentic home's briefing: the lines that
 * happen today lead; the card is urgent while there are any.
 */

import type { WidgetSummary } from '@rambleraptor/homestead-core/apps/types';
import { useToday } from './useToday';

export default function useTodaySummary(): WidgetSummary | null | undefined {
  const { items, isLoading } = useToday();
  if (isLoading) return undefined;
  if (items.length === 0) return null;
  const now = items.filter((item) => item.urgency === 'now');
  const lead = (now.length > 0 ? now : items).slice(0, 2).map((item) => item.title);
  const more = items.length - lead.length;
  return {
    headline: more > 0 ? `${lead.join(' · ')} · ${more} more` : lead.join(' · '),
    urgent: now.length > 0,
  };
}
