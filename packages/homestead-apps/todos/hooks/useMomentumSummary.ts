/**
 * The momentum widget in one line, for the agentic home's strip. Never
 * urgent — it's a pat on the back, not an appointment — and silent when
 * nothing was finished this week: a chip reading "0 done" would nag.
 */

import type { WidgetSummary } from '@rambleraptor/homestead-core/apps/types';
import { momentumHeadline } from '../momentum';
import { useMomentum } from './useMomentum';

export default function useMomentumSummary(): WidgetSummary | null | undefined {
  const { doneThisWeek, streak, isLoading } = useMomentum();
  if (isLoading) return undefined;
  const headline = momentumHeadline({ doneThisWeek, streak });
  return headline === null ? null : { headline };
}
