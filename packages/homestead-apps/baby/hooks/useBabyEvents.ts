/**
 * Baby events, read.
 *
 * `useBabyEvents` is the app's working set: every baby's events from the last
 * `WINDOW_DAYS`, in the `baby-event` resource's convention list slot — the one
 * the offline mutation factory writes to — so a logged entry shows at once,
 * online or not. It is windowed because the log only grows (a couple of dozen
 * entries a day) and everything on screen is recent.
 *
 * `useBabyDay` reads one older day on demand, for looking back past the window.
 */

import { useQuery } from '@tanstack/react-query';
import { aepbase } from '@rambleraptor/homestead-core/api/aepbase';
import { queryKeys } from '@rambleraptor/homestead-core/api/queryClient';
import { withPendingWrites } from '@rambleraptor/homestead-core/api/registerResourceMutationDefaults';
import { WINDOW_DAYS, addDays, byStartedDesc, eventsOnDay, startOfDay } from '../baby';
import { BABIES, BABY_EVENTS } from '../resources';
import type { Baby, BabyEvent } from '../types';

/** The first local day the working set covers. */
export function windowStart(now: Date = new Date()): Date {
  return addDays(startOfDay(now), -WINDOW_DAYS);
}

async function listEvents(babyId: string, filter: string): Promise<BabyEvent[]> {
  const parent = [BABIES, babyId];
  const fetched = await aepbase.list<BabyEvent>(BABY_EVENTS, { parent, filter });
  return fetched.map((event) => ({ ...event, baby: babyId }));
}

export function useBabyEvents() {
  return useQuery<BabyEvent[], Error>({
    queryKey: queryKeys.app('baby').resource('baby-event').list(),
    queryFn: async () => {
      const babies = await aepbase.list<Baby>(BABIES);
      const since = windowStart().toISOString();
      const all: BabyEvent[] = [];
      for (const baby of babies) {
        const fetched = await listEvents(baby.id, `started_at >= ${JSON.stringify(since)}`);
        // Entries this device has logged but not sent yet stay on the list.
        const rows = withPendingWrites<BabyEvent>('baby', 'baby-event', fetched, {
          parent: [BABIES, baby.id],
        });
        for (const row of rows) all.push({ ...row, baby: baby.id });
      }
      return all.sort(byStartedDesc);
    },
  });
}

/** One baby's events on a local day before the working set's window. */
export function useBabyDay(babyId: string | undefined, day: Date, enabled: boolean) {
  return useQuery<BabyEvent[], Error>({
    queryKey: [...queryKeys.app('baby').all(), 'day', babyId ?? '', day.toISOString()],
    queryFn: async () => {
      // A day either side, then narrowed here: timestamps written by other
      // clients may not be in the form the server compares as text.
      const from = addDays(day, -1).toISOString();
      const to = addDays(day, 2).toISOString();
      const fetched = await listEvents(
        babyId as string,
        `started_at >= ${JSON.stringify(from)} && started_at < ${JSON.stringify(to)}`,
      );
      return eventsOnDay(fetched, day);
    },
    enabled: enabled && !!babyId,
  });
}
