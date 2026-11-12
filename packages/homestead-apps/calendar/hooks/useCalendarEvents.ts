/**
 * Data access for `calendar-event`.
 *
 * Events are nested under their calendar (there is no flat `/calendar-events`
 * endpoint), so the list reads each calendar's events and gathers them into
 * one slot, filling in the parent `calendar` id the views join on. That slot is
 * the `calendar-event` resource's convention list key — the one the generic
 * offline mutation factory writes optimistic records to — so create, update
 * and delete stay in step with it, online or not, with no cache wiring here.
 *
 * The whole list is read rather than a window of it: a view moves between
 * months without waiting, and a series that began years ago still has to be
 * found to draw this week.
 */

import { useQuery } from '@tanstack/react-query';
import { aepbase } from '@rambleraptor/homestead-core/api/aepbase';
import { queryKeys } from '@rambleraptor/homestead-core/api/queryClient';
import {
  useResourceCreate,
  useResourceDelete,
  useResourceUpdate,
} from '@rambleraptor/homestead-core/api/resourceHooks';
import { CALENDARS, CALENDAR_EVENTS } from '../resources';
import type { Calendar, CalendarEvent, CalendarEventFormData } from '../types';

export function useCalendarEvents() {
  return useQuery<CalendarEvent[], Error>({
    queryKey: queryKeys.app('calendar').resource('calendar-event').list(),
    queryFn: async () => {
      const calendars = await aepbase.list<Calendar>(CALENDARS);
      const perCalendar = await Promise.all(
        calendars.map(async (calendar) => {
          const events = await aepbase.list<CalendarEvent>(CALENDAR_EVENTS, {
            parent: [CALENDARS, calendar.id],
          });
          return events.map((event) => ({ ...event, calendar: calendar.id }));
        }),
      );
      return perCalendar.flat();
    },
  });
}

/** The `calendar` field of the variables picks the parent; it isn't sent in the body. */
export function useCreateCalendarEvent() {
  return useResourceCreate<CalendarEvent, CalendarEventFormData>('calendar', 'calendar-event');
}

/** Variables are `{ id, data }`; send a field as `null` to clear it (merge-patch). */
export function useUpdateCalendarEvent() {
  return useResourceUpdate<CalendarEvent, Partial<CalendarEventFormData>>(
    'calendar',
    'calendar-event',
  );
}

export function useDeleteCalendarEvent() {
  return useResourceDelete('calendar', 'calendar-event');
}
