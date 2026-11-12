/**
 * The lane builders behind the Today widget.
 *
 * Every function here is pure: data in, `TodayItem[]` out, with `now` passed
 * explicitly rather than read from the clock. That's deliberate — "is this
 * today?" is the entire logic of this app, and it's untestable if the answer
 * depends on when the suite runs.
 *
 * Each builder owns the *wording* of its lines as well as the filtering. A line
 * reads as something a person would say ("Bins go out tonight"), because the
 * card's job is to be glanced at, not parsed.
 */

import { formatCurrency } from '@rambleraptor/homestead-core/shared/utils/currencyUtils';
import { isAppScheduled } from '@rambleraptor/homestead-core/notifications/types';
import type { ScheduledNotification } from '@rambleraptor/homestead-core/notifications/types';
import type { UpcomingEvent } from '../../events/hooks/useUpcomingEvents';
import type { Occurrence } from '../../calendar/types';
import { formatTime } from '../../calendar/utils/occurrences';
import { streamLabel, type PickupDay } from '../../home/utils/pickups';
import type { GroceryItem, Store } from '../../groceries/types';
import { MAIN_PROJECT_ID, type PersonalTodo, type Todo } from '../types';
import { bucketTodos, mergeTodosForScope } from '../hooks/useTodos';
import type { UpcomingPerk } from '../../credit-cards/types';
import { URGENT_WINDOW_DAYS } from '../../credit-cards/utils/periodUtils';
import type { TodayItem } from './types';

/** Whole days from `now` to `then`, rounded up. Negative when `then` has passed. */
function daysUntil(then: Date, now: Date): number {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const startOfThen = new Date(then);
  startOfThen.setHours(0, 0, 0, 0);
  return Math.round(
    (startOfThen.getTime() - startOfToday.getTime()) / (24 * 60 * 60 * 1000),
  );
}

/** "today" / "tomorrow" / "in 3 days" — the tail of a sentence, so lowercase. */
export function relativeDayLabel(days: number): string {
  if (days <= 0) return 'today';
  if (days === 1) return 'tomorrow';
  return `in ${days} days`;
}

/** Local wall-clock time, e.g. "2:00 PM". */
function timeLabel(at: Date): string {
  return at.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

/** Joins names the way a person would: "A", "A & B", "A, B & C". */
function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  if (names.length === 2) return `${names[0]} & ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`;
}

/**
 * Reminders a *person* scheduled for today. App-raised rows are excluded: those
 * are the notification side of something that already has its own lane here
 * (a birthday, bin night), so including them would say everything twice.
 */
export function buildReminderItems(
  scheduled: readonly ScheduledNotification[],
  now: Date,
): TodayItem[] {
  return scheduled
    .filter((row) => row.status === 'scheduled' && !isAppScheduled(row))
    .flatMap((row) => {
      const at = new Date(row.send_at);
      if (Number.isNaN(at.getTime()) || daysUntil(at, now) !== 0) return [];
      return [
        {
          id: `reminder-${row.id}`,
          lane: 'reminder' as const,
          title: row.title,
          detail: [timeLabel(at), row.message].filter(Boolean).join(' · '),
          href: '/notifications',
          urgency: 'now' as const,
          at: at.getTime(),
        },
      ];
    });
}

/**
 * Birthdays and anniversaries landing today or tomorrow. Tomorrow earns a place
 * on a card called Today because these are the things you need a few hours'
 * warning to act on — a card to sign, a call to make.
 */
export function buildEventItems(
  events: readonly UpcomingEvent[],
  now: Date,
): TodayItem[] {
  return events.flatMap((event) => {
    const days = daysUntil(event.date, now);
    if (days < 0 || days > 1) return [];
    const peopleCentred =
      (event.tag === 'birthday' || event.tag === 'anniversary') &&
      event.names.length > 0;
    const title = peopleCentred ? joinNames(event.names) : event.name;
    const descriptor = event.tag ?? 'event';
    return [
      {
        id: `event-${event.id}`,
        lane: 'event' as const,
        title,
        detail: `${descriptor} ${relativeDayLabel(days)}`,
        href: '/events',
        urgency: 'now' as const,
        at: event.date.getTime(),
      },
    ];
  });
}

/**
 * What's on the calendar today and not yet over. A timed event reads with its
 * time ("at 3:30 PM", or "until 4:00 PM" once it has started); an all-day one
 * is simply today's.
 */
export function buildCalendarItems(
  occurrences: readonly Occurrence[],
  now: Date,
): TodayItem[] {
  return occurrences.flatMap((occurrence) => {
    const { event, allDay, start, end } = occurrence;
    if (end.getTime() <= now.getTime()) return [];
    if (daysUntil(start, now) > 0) return [];
    const detail = allDay
      ? 'all day'
      : start.getTime() <= now.getTime()
        ? `until ${formatTime(end)}`
        : `at ${formatTime(start)}`;
    return [
      {
        id: `calendar-${occurrence.key}`,
        lane: 'calendar' as const,
        title: event.title,
        detail: event.location ? `${detail} · ${event.location}` : detail,
        href: '/calendar',
        urgency: 'now' as const,
        at: start.getTime(),
      },
    ];
  });
}

/**
 * Bin night. A collection *tomorrow* is the actionable one — the bins go out
 * the evening before, which is the same moment the Home app's reminder cron
 * picks. A collection today is reported too, but as a statement rather than a
 * prompt: by the time you read it the truck is either coming or gone.
 */
export function buildPickupItems(
  days: readonly PickupDay[],
  _now: Date,
): TodayItem[] {
  return days.flatMap((day) => {
    if (day.daysAway < 0 || day.daysAway > 1) return [];
    const streams = Array.from(
      new Set(day.pickups.map((p) => streamLabel(p.stream))),
    );
    const tonight = day.daysAway === 1;
    const note = day.pickups.find((p) => p.note)?.note;
    return [
      {
        id: `pickup-${day.date}`,
        lane: 'pickup' as const,
        title: tonight
          ? `${joinNames(streams)} go out tonight`
          : `${joinNames(streams)} collected today`,
        detail: [tonight ? 'Collection tomorrow' : undefined, note]
          .filter(Boolean)
          .join(' · '),
        href: '/home',
        urgency: 'now' as const,
      },
    ];
  });
}

/**
 * Perks about to expire unused, as a single line.
 *
 * Deliberately conservative. The credit-cards app withdrew its perk reminders
 * because a monthly credit closes twelve times a year and the notification was
 * worth less than the interruption (see `creditCardsApp.migrations`). The same
 * restraint applies here: only unredeemed perks inside the app's own urgency
 * window, and never more than one line however many are closing — the number
 * worth acting on is the total, and the card links to the app for the detail.
 * A lone perk keeps its name, which is more use than an aggregate of one.
 */
export function buildPerkItems(
  perks: readonly UpcomingPerk[],
  now: Date,
): TodayItem[] {
  const closing = perks
    .filter((item) => {
      if (item.isRedeemed) return false;
      const days = daysUntil(item.currentPeriod.end, now);
      return days >= 0 && days <= URGENT_WINDOW_DAYS;
    })
    .sort((a, b) => a.currentPeriod.end.getTime() - b.currentPeriod.end.getTime());

  if (closing.length === 0) return [];

  const soonest = closing[0]!;
  const soonestLabel = relativeDayLabel(daysUntil(soonest.currentPeriod.end, now));

  if (closing.length === 1) {
    return [
      {
        id: `perk-${soonest.perk.id}`,
        lane: 'perk',
        title: `${formatCurrency(soonest.perk.value)} ${soonest.perk.name}`,
        detail: `${soonest.card.name} · expires ${soonestLabel}`,
        href: '/credit-cards',
        urgency: 'soon',
        at: soonest.currentPeriod.end.getTime(),
      },
    ];
  }

  const total = closing.reduce((sum, item) => sum + item.perk.value, 0);
  return [
    {
      id: 'perks',
      lane: 'perk',
      title: `${formatCurrency(total)} in perks expiring`,
      detail: `${closing.length} perks · soonest ${soonestLabel}`,
      href: '/credit-cards',
      urgency: 'soon',
      at: soonest.currentPeriod.end.getTime(),
    },
  ];
}

/**
 * The shopping list, as one line. Ambient rather than time-bound: nothing about
 * a grocery list is due, but it is the thing most likely to be wanted while
 * standing up, so it earns a place.
 */
export function buildGroceryItems(
  items: readonly GroceryItem[],
  stores: readonly Store[],
): TodayItem[] {
  const outstanding = items.filter((item) => !item.checked);
  if (outstanding.length === 0) return [];

  const nameById = new Map(stores.map((store) => [store.id, store.name]));
  const counts = new Map<string, number>();
  for (const item of outstanding) {
    const name = (item.store && nameById.get(item.store)) || 'No store';
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const breakdown = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => `${count} at ${name}`)
    .join(', ');

  return [
    {
      id: 'groceries',
      lane: 'groceries',
      title: `${outstanding.length} ${
        outstanding.length === 1 ? 'item' : 'items'
      } to pick up`,
      // A single unnamed-store bucket says nothing the count didn't already.
      detail: counts.size > 1 ? breakdown : undefined,
      href: '/groceries',
      urgency: 'ambient',
    },
  ];
}

/**
 * Open todos on the main list, as one line.
 *
 * "Main list" is the Todos app's own rule, not a second definition of it:
 * `mergeTodosForScope` at main scope keeps the todos of either kind that carry
 * no project (plus any pinned there with `in_main`), and `bucketTodos` decides
 * what counts as still open. A todo filed under a project is that project's
 * business, not today's — private ones included.
 *
 * Only a count, because `todo` carries no due date — there is no such thing as
 * a todo that is due *today* yet. When due dates land this lane should become
 * the list of what's due, and move from `ambient` to `now`.
 */
export function buildTodoItems(
  family: readonly Todo[],
  personal: readonly PersonalTodo[],
): TodayItem[] {
  const { active } = bucketTodos(
    mergeTodosForScope([...family], [...personal], MAIN_PROJECT_ID),
  );
  const familyOpen = active.filter((t) => t.kind === 'family').length;
  const personalOpen = active.filter((t) => t.kind === 'personal').length;
  const total = familyOpen + personalOpen;
  if (total === 0) return [];

  const parts = [
    familyOpen > 0 ? `${familyOpen} shared` : undefined,
    personalOpen > 0 ? `${personalOpen} personal` : undefined,
  ].filter(Boolean);

  return [
    {
      id: 'todos',
      lane: 'todos',
      title: `${total} open ${total === 1 ? 'todo' : 'todos'}`,
      detail: parts.length > 1 ? parts.join(' · ') : undefined,
      href: '/todos',
      urgency: 'ambient',
    },
  ];
}

/** Sort weight per urgency band. Lower sorts first. */
const URGENCY_RANK = { now: 0, soon: 1, ambient: 2 } as const;

/**
 * Merge every lane into the order the card renders: soonest first, ambient
 * state last. Within a band, timed lines lead untimed ones — a 2pm reminder
 * outranks "bins go out tonight" only because it says when.
 */
export function sortTodayItems(items: readonly TodayItem[]): TodayItem[] {
  return [...items].sort((a, b) => {
    const band = URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency];
    if (band !== 0) return band;
    if (a.at !== undefined && b.at !== undefined) return a.at - b.at;
    if (a.at !== undefined) return -1;
    if (b.at !== undefined) return 1;
    return 0;
  });
}
