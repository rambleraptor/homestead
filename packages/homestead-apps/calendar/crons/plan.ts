/**
 * Turns the calendar into queued notifications — the one piece of logic behind
 * both the daily cron (`./reminders`) and the on-write handler
 * (`../syncs/reminders`).
 *
 * The calendar knows what is on and when; this works out the next
 * {@link HORIZON_DAYS} days of it and hands the result to the notifications
 * queue, whose dispatcher does the sending. A timed event is announced
 * {@link LEAD_MINUTES} minutes before it starts; an all-day one on the morning
 * of its first day.
 *
 * **Opt-in per person** (`event_reminder`, declared in `../app.config.ts`): the
 * calendar is household data, but an interruption belongs to whoever asked for
 * it.
 *
 * **Only what the person can see.** Sharing or hiding a calendar decides who
 * can read its events, and a notification is a way of reading one — so each
 * opted-in person is checked against each calendar, with the same decision a
 * GET makes, before anything is addressed to them.
 *
 * **Reconciled, not appended.** Each run states what the calendar implies now,
 * keyed `<event id>:<occurrence start>`, and the queue is made to match: a
 * moved event is a different key (the old reminder is withdrawn, a new one
 * written), a renamed one is a patch, a deleted or skipped one is withdrawn.
 *
 * Server-only: lives under `crons/`, so vite stubs it out of the browser bundle.
 */

import { serverClient } from '@rambleraptor/homestead-core/server/client';
import { userCanUseRecord } from '@rambleraptor/homestead-core/server/collection-access';
import { usersWithFlag } from '@rambleraptor/homestead-core/server/user-settings';
import {
  fanOut,
  reconcileScheduled,
  type PlannedNotification,
  type ReconcileResult,
} from '@rambleraptor/homestead-core/server/scheduled-notifications';
import { EVENT_REMINDER_SETTING } from '../reminderSetting';
import { CALENDARS, CALENDAR_EVENTS } from '../resources';
import type { Calendar, CalendarEvent, Occurrence } from '../types';
import { addDays, isoDay } from '../utils/dates';
import { expandEvents, formatOccurrenceTime } from '../utils/occurrences';

/** The app id stamped on every notification this schedules. */
export const CALENDAR_REMINDER_TYPE = 'calendar';

/** How long before a timed event starts its reminder goes out. */
export const LEAD_MINUTES = 30;

/** Local hour an all-day event is announced at, on its first day. */
export const ALL_DAY_HOUR = 8;

/**
 * How far ahead to plan. The cron runs daily and every write to an event
 * re-plans, so two days is slack for a box that was down overnight, not a
 * limit on how far ahead an event can be.
 */
export const HORIZON_DAYS = 2;

/** Where tapping a reminder lands. */
const CALENDAR_URL = '/calendar';

/** The instant an occurrence's reminder is due. */
export function remindAt(occurrence: Occurrence): Date {
  if (occurrence.allDay) {
    const day = occurrence.start;
    return new Date(day.getFullYear(), day.getMonth(), day.getDate(), ALL_DAY_HOUR, 0, 0, 0);
  }
  return new Date(occurrence.start.getTime() - LEAD_MINUTES * 60_000);
}

export function buildContent(occurrence: Occurrence): { title: string; message: string } {
  const { event, allDay } = occurrence;
  const when = allDay ? 'Today' : formatOccurrenceTime(occurrence);
  return {
    title: allDay ? `Today: ${event.title}` : `Soon: ${event.title}`,
    message: [when, event.location?.trim(), event.notes?.trim()].filter(Boolean).join(' · '),
  };
}

export interface PlanOutcome extends ReconcileResult {
  calendars: number;
  planned: number;
}

/** Plan the coming days' reminders and make the queue match. */
export async function planCalendarReminders(token: string, now: Date): Promise<PlanOutcome> {
  const hs = serverClient(token);
  const users = await hs.collection<{ id: string }>('users').listAll();
  const optedIn = await usersWithFlag(
    token,
    users.map((user) => user.id),
    CALENDAR_REMINDER_TYPE,
    EVENT_REMINDER_SETTING,
  );

  const planned: PlannedNotification[] = [];
  let calendarCount = 0;

  // With nobody opted in there is nothing to plan — but still reconcile, so
  // turning the setting off withdraws the rows already written for it.
  if (optedIn.length > 0) {
    const calendars = await hs.collection<Calendar>(CALENDARS).listAll();
    calendarCount = calendars.length;
    const today = isoDay(now);
    const horizonEnd = now.getTime() + HORIZON_DAYS * 86_400_000;

    for (const calendar of calendars) {
      const recipients: string[] = [];
      for (const userId of optedIn) {
        if (await userCanUseRecord(userId, 'calendar', `${CALENDARS}/${calendar.id}`, 'read')) {
          recipients.push(userId);
        }
      }
      if (recipients.length === 0) continue;

      const events = await hs
        .collection(CALENDARS)
        .record(calendar.id)
        .collection<CalendarEvent>(CALENDAR_EVENTS)
        .listAll();

      const occurrences = expandEvents(
        events.map((event) => ({ ...event, calendar: calendar.id })),
        today,
        addDays(today, HORIZON_DAYS),
      );
      for (const occurrence of occurrences) {
        // A reminder whose moment has passed is not written into the past,
        // where the dispatcher could only mark it missed.
        const dueAt = remindAt(occurrence).getTime();
        if (dueAt <= now.getTime() || dueAt > horizonEnd) continue;
        // A multi-day event is announced once, when it begins.
        if (occurrence.allDay && occurrence.startDay < today) continue;

        const { title, message } = buildContent(occurrence);
        planned.push(
          ...fanOut(
            {
              sourceKey: `${occurrence.event.id}:${occurrence.originalStart}`,
              title,
              message,
              url: CALENDAR_URL,
              sendAt: new Date(dueAt).toISOString(),
              sourceCollection: CALENDAR_EVENTS,
              sourceId: occurrence.event.id,
            },
            recipients,
          ),
        );
      }
    }
  }

  const outcome = await reconcileScheduled(token, CALENDAR_REMINDER_TYPE, planned, { now });
  return { calendars: calendarCount, planned: planned.length, ...outcome };
}
