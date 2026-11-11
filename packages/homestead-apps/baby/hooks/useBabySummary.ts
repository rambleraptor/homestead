/**
 * The baby log in one line, for the home's strip: asleep or nursing right now,
 * else how long since the last feed. Nothing to say until a baby is set up.
 */

import type { WidgetSummary } from '@rambleraptor/homestead-core/apps/types';
import { formatAgo, formatDuration, startedAt } from '../baby';
import { useBabies } from './useBabies';
import { useBabyLog } from './useBabyLog';

export default function useBabySummary(): WidgetSummary | null | undefined {
  const babies = useBabies();
  const baby = babies.data?.[0];
  const { status, now, isLoading } = useBabyLog(baby);
  if (babies.isLoading || (baby && isLoading)) return undefined;
  if (!baby) return null;
  if (status.sleeping) {
    const since = new Date(startedAt(status.sleeping)).getTime();
    return { headline: `Asleep ${formatDuration(now - since)}` };
  }
  if (status.nursing) return { headline: 'Nursing now' };
  if (status.lastFeed) return { headline: `Fed ${formatAgo(startedAt(status.lastFeed), now)}` };
  return { headline: `Log ${baby.name}'s first feed` };
}
