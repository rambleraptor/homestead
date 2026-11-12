/**
 * Data access for `calendar` — the named, coloured sets events live under.
 *
 * Flat and household-wide, so the generic offline-capable mutation defaults
 * cover create and update outright. Delete is the exception: a calendar's
 * events are its children, and the engine only removes a parent that still has
 * children when asked to (`force`), which the generic delete doesn't do.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { aepbase } from '@rambleraptor/homestead-core/api/aepbase';
import { queryKeys } from '@rambleraptor/homestead-core/api/queryClient';
import {
  useResourceCreate,
  useResourceList,
  useResourceUpdate,
} from '@rambleraptor/homestead-core/api/resourceHooks';
import { CALENDARS } from '../resources';
import type { Calendar, CalendarFormData } from '../types';

export function useCalendars() {
  return useResourceList<Calendar>('calendar', 'calendar', CALENDARS, { orderBy: 'name' });
}

export function useCreateCalendar() {
  return useResourceCreate<Calendar, CalendarFormData>('calendar', 'calendar');
}

/** Variables are `{ id, data }`. */
export function useUpdateCalendar() {
  return useResourceUpdate<Calendar, Partial<CalendarFormData>>('calendar', 'calendar');
}

/** Delete a calendar and every event on it. */
export function useDeleteCalendar() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: async (id) => {
      await aepbase.remove(CALENDARS, id, { force: true });
    },
    // The events list holds every calendar's events in one slot, so it has to
    // drop the deleted calendar's too.
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.app('calendar').all() }),
  });
}
