/**
 * Calendar App Configuration
 *
 * The household's shared calendar: dated, timed and repeating events, grouped
 * into named, coloured calendars and shown by month, week, or as an agenda.
 *
 * Distinct from the Events app, which keeps the yearly dates worth remembering
 * (birthdays, anniversaries) — those have a month and a day but no year, no
 * time, and no end.
 */

import type { AppConfig } from '@rambleraptor/homestead-core/apps/types';
import { EVENT_REMINDER_SETTING } from './reminderSetting';
import { calendarResources } from './resources';

export const calendarApp: AppConfig = {
  id: 'calendar',
  name: 'Calendar',
  description: 'The household’s shared calendar of events',
  resources: calendarResources,
  chat: {
    instructions: [
      'Calendar events live under a calendar: list the calendars first, then read or ' +
        'write events under the one that fits. If the person does not say which, use ' +
        'the one that matches who the event is for, else the shared family one, and ' +
        'say which you used.',
      'A timed event stores start and end as UTC instants (2026-11-12T17:00:00.000Z) ' +
        'and timezone as the person’s IANA zone — convert from their local clock. An ' +
        'all-day event sets all_day true and uses YYYY-MM-DD for start and end, where ' +
        'end is the last day, inclusive (a one-day event has end equal to start).',
      'A repeating event is ONE record with an rrule (RFC 5545, e.g. ' +
        'FREQ=WEEKLY;BYDAY=TU,TH; add UNTIL=YYYYMMDD to end it) — never one record per ' +
        'occurrence. Its start is the first occurrence. To skip a single occurrence, ' +
        'add that occurrence’s start to exdates. When asked what is on for some days, ' +
        'work out which of those days each rrule lands on.',
      'Yearly dates with no time — birthdays, anniversaries — belong in Events, not here.',
    ],
  },
  userSettings: {
    // Opt-in per person: the calendar is household data, but a notification is
    // a personal interruption, and the switch sits on the page it governs.
    [EVENT_REMINDER_SETTING]: {
      type: 'boolean',
      label: 'Remind me about calendar events',
      description:
        'Get a reminder 30 minutes before each event on a calendar you can see, and on the morning of all-day ones.',
      default: false,
    },
  },
  // Queues the coming days' reminders; the notifications app's dispatcher
  // delivers them. Runs before the household is awake and catches up at boot.
  // Handler lives under `crons/`, so it's stubbed out of the browser bundle.
  crons: [
    {
      id: 'calendar-reminders',
      title: 'Calendar reminders',
      dailyAtHour: 3,
      runOnStart: true,
      load: () => import('./crons/reminders'),
    },
  ],
  // The daily pass can't know about the appointment added this morning for
  // this afternoon, so every write to an event re-plans straight away.
  syncs: [
    {
      id: 'calendar-reminders-on-write',
      resource: 'calendar-event',
      title: 'Calendar reminders',
      load: () => import('./syncs/reminders'),
    },
  ],
  web: {
    icon: () => import('lucide-react').then((m) => m.CalendarDays),
    basePath: '/calendar',
    homeScreenIcon: '/app-icons/calendar.png',
    routes: [
      {
        path: '',
        index: true,
        component: () => import('./components/CalendarHome').then((m) => m.CalendarHome),
      },
    ],
    showInNav: true,
    // Leads the "Tasks" nav section, ahead of Todos (navOrder 5).
    navOrder: 4,
    section: 'Tasks',
    widgets: [
      {
        id: 'calendar-upcoming',
        summary: () => import('./hooks/useCalendarSummary'),
        label: 'This week',
        component: () => import('./components/UpcomingWidget').then((m) => m.UpcomingWidget),
        order: 8,
      },
    ],
  },
};
