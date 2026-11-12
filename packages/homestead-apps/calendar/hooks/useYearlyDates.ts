/**
 * The Events app's birthdays and anniversaries, for the days on screen.
 *
 * Read from the Events app's own list (the same cache slot its page uses) and
 * shown only to someone who can see that app — a household that hasn't
 * installed Events, or a person it's hidden from, simply gets a calendar
 * without them.
 */

import { useMemo } from 'react';
import { getAppById } from '@rambleraptor/homestead-core/apps/registry';
import { useAppVisible } from '@rambleraptor/homestead-core/apps/useAppVisibility';
import { useEvents } from '../../events/hooks/useEvents';
import { yearlyDatesBetween, type YearlyDate } from '../utils/yearly';

export function useYearlyDates(fromDay: string, toDay: string): YearlyDate[] {
  const isAppVisible = useAppVisible();
  const eventsApp = getAppById('events');
  const visible = eventsApp ? isAppVisible(eventsApp) : false;
  // Called unconditionally, as hooks must be; its result is dropped when the
  // viewer can't see the app.
  const { data } = useEvents();
  return useMemo(
    () => (visible ? yearlyDatesBetween(data ?? [], fromDay, toDay) : []),
    [visible, data, fromDay, toDay],
  );
}
