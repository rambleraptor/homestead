/**
 * Fetch the single event the countdown widget is configured for, plus
 * its next occurrence resolved through the same recurrence logic the
 * upcoming-events widget uses. Returns `event: null` when the configured
 * event id is empty (widget not configured) or no longer exists.
 */

import { useQuery } from '@tanstack/react-query';
import {
  aepbase,
  AepbaseError,
} from '@rambleraptor/homestead-core/api/aepbase';
import { queryKeys } from '@rambleraptor/homestead-core/api/queryClient';
import { EVENTS } from '../resources';
import { hasEventDate, nextOccurrence } from '../utils/eventDate';
import type { Event } from '../types';

export interface UseCountdownEventResult {
  event: Event | null;
  nextDate: Date | null;
  isLoading: boolean;
  /** A failed read other than the event being gone (which is `event: null`). */
  error: Error | null;
  refetch: () => void;
}

export function useCountdownEvent(eventId: string): UseCountdownEventResult {
  const query = useQuery<Event | null>({
    queryKey: queryKeys.app('events').resource('event').detail(eventId),
    enabled: !!eventId,
    queryFn: async () => {
      try {
        return await aepbase.get<Event>(EVENTS, eventId);
      } catch (error) {
        // The configured event may have been deleted. Treat that as
        // "no event" rather than surfacing the error — the widget shows
        // a "no longer exists" empty state.
        if (error instanceof AepbaseError && error.code === 404) {
          return null;
        }
        throw error;
      }
    },
  });

  const event = query.data ?? null;
  const nextDate = event && hasEventDate(event) ? nextOccurrence(event) : null;

  return {
    event,
    nextDate,
    isLoading: !!eventId && query.isLoading,
    error: query.error,
    refetch: () => void query.refetch(),
  };
}
