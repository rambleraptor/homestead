/**
 * Assembles the Today card from the apps that already own the data.
 *
 * Today stores nothing of its own. Every line comes from an existing hook —
 * this app's or a sibling's — which is the whole point: Today is a *view*, and
 * a second copy of "what is happening" would be a second thing to keep correct.
 *
 * It lives under Todos rather than as an app of its own because a card is not
 * worth a registry entry: a collection-less app still takes an app-scope grant
 * in every built-in role. Todos is the closest fit — the card answers "what do
 * I need to do today" — and already reaches across apps (see useSyntheticTodos).
 *
 * On calling every hook unconditionally: React's rules require it, and it costs
 * nothing in practice — each of these queries is already mounted by the sibling
 * widget on the same dashboard (Groceries, Todos, Upcoming perks, Upcoming
 * events, Next pickup), so React Query serves them from one cache entry rather
 * than issuing a second request. Lanes for apps this viewer can't see are
 * dropped after the fact, exactly as the dashboard already drops their widgets.
 */

import { useMemo, useState } from 'react';
import { getAppById } from '@rambleraptor/homestead-core/apps/registry';
import { useAppVisible } from '@rambleraptor/homestead-core/apps/useAppVisibility';
import { useScheduledNotifications } from '@rambleraptor/homestead-core/notifications/hooks/useScheduledNotifications';
import { useUpcomingEvents } from '../../../events/hooks/useUpcomingEvents';
import { useUpcomingOccurrences } from '../../../calendar/hooks/useUpcomingOccurrences';
import { useUpcomingPickupDays } from '../../../home/hooks/useGarbagePickups';
import { useGroceries } from '../../../groceries/hooks/useGroceries';
import { useStores } from '../../../groceries/hooks/useStores';
import { useTodos, usePersonalTodos } from '../../hooks/useTodos';
import { useCreditCards } from '../../../credit-cards/hooks/useCreditCards';
import { useCreditCardPerks } from '../../../credit-cards/hooks/useCreditCardPerks';
import { usePerkRedemptions } from '../../../credit-cards/hooks/usePerkRedemptions';
import { useUpcomingPerks } from '../../../credit-cards/hooks/useUpcomingPerks';
import {
  buildCalendarItems,
  buildEventItems,
  buildGroceryItems,
  buildPerkItems,
  buildPickupItems,
  buildReminderItems,
  buildTodoItems,
  sortTodayItems,
} from '../lanes';
import type { TodayItem } from '../types';

/** Events land on the card a day early; pickups need tonight *and* tomorrow. */
const EVENT_LOOKAHEAD_DAYS = 1;
const PICKUP_LOOKAHEAD_DAYS = 2;

export interface TodayState {
  items: TodayItem[];
  /** True until every lane the viewer can see has resolved at least once. */
  isLoading: boolean;
}

export function useToday(): TodayState {
  // Captured once per mount: a `new Date()` on every render would re-sort and
  // re-filter continuously. The cost is that a tab left open across midnight
  // keeps yesterday's card until it refocuses — acceptable for a dashboard.
  const [now] = useState(() => new Date());

  const isAppVisible = useAppVisible();
  const shows = useMemo(() => {
    return (appId: string): boolean => {
      const app = getAppById(appId);
      return app ? isAppVisible(app) : false;
    };
  }, [isAppVisible]);

  const scheduled = useScheduledNotifications();
  const events = useUpcomingEvents(EVENT_LOOKAHEAD_DAYS);
  const pickups = useUpcomingPickupDays(PICKUP_LOOKAHEAD_DAYS);
  // Today only: the calendar's own widget covers the week.
  const calendar = useUpcomingOccurrences(0);
  const groceries = useGroceries();
  const stores = useStores();
  const familyTodos = useTodos();
  const personalTodos = usePersonalTodos();
  const cards = useCreditCards();
  const perks = useCreditCardPerks();
  const redemptions = usePerkRedemptions();
  const upcomingPerks = useUpcomingPerks(
    cards.data ?? [],
    perks.data ?? [],
    redemptions.data ?? [],
  );

  const items = useMemo(() => {
    const collected: TodayItem[] = [
      // Notifications is always installed, so reminders need no visibility gate.
      ...buildReminderItems(scheduled.data ?? [], now),
      ...(shows('events') ? buildEventItems(events.data ?? [], now) : []),
      ...(shows('calendar') ? buildCalendarItems(calendar.occurrences, now) : []),
      ...(shows('home') ? buildPickupItems(pickups.data ?? [], now) : []),
      ...(shows('credit-cards') ? buildPerkItems(upcomingPerks, now) : []),
      ...(shows('groceries')
        ? buildGroceryItems(groceries.data ?? [], stores.data ?? [])
        : []),
      ...(shows('todos')
        ? buildTodoItems(familyTodos.data ?? [], personalTodos.data ?? [])
        : []),
    ];
    return sortTodayItems(collected);
  }, [
    now,
    shows,
    scheduled.data,
    events.data,
    calendar.occurrences,
    pickups.data,
    upcomingPerks,
    groceries.data,
    stores.data,
    familyTodos.data,
    personalTodos.data,
  ]);

  // Only the lanes this viewer can actually see should hold the card in its
  // loading state — a hidden app's perpetually-failing query must not.
  const isLoading =
    scheduled.isLoading ||
    (shows('events') && events.isLoading) ||
    (shows('calendar') && calendar.isLoading) ||
    (shows('home') && pickups.isLoading) ||
    (shows('groceries') && (groceries.isLoading || stores.isLoading)) ||
    (shows('todos') && (familyTodos.isLoading || personalTodos.isLoading)) ||
    (shows('credit-cards') &&
      (cards.isLoading || perks.isLoading || redemptions.isLoading));

  return { items, isLoading };
}
