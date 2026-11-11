/**
 * Everything a screen needs to show and log for one baby: its recent events,
 * where things stand now, and the one-tap actions. Shared by the Baby page and
 * the dashboard widget so they behave the same.
 */

import { useMemo } from 'react';
import { useToast } from '@rambleraptor/homestead-core/shared/components/ToastProvider';
import { babyStatus, describeEvent, suggestedSide } from '../baby';
import type { Baby, BabyEvent, BabyEventFields, DiaperKind, Side } from '../types';
import { useBabyEvents } from './useBabyEvents';
import {
  useCreateBabyEvent,
  useDeleteBabyEvent,
  useUpdateBabyEvent,
} from './useBabyEventMutations';
import { useNow } from './useNow';

export function useBabyLog(baby: Baby | undefined) {
  const toast = useToast();
  const now = useNow();
  const eventsQuery = useBabyEvents();
  const createEvent = useCreateBabyEvent();
  const updateEvent = useUpdateBabyEvent();
  const deleteEvent = useDeleteBabyEvent();

  const events = useMemo(
    () => (eventsQuery.data ?? []).filter((e) => e.baby === baby?.id),
    [eventsQuery.data, baby?.id],
  );
  const status = useMemo(() => babyStatus(events, now), [events, now]);

  /** Log an entry now, with a way to take it back. */
  const log = (fields: BabyEventFields) => {
    if (!baby) return;
    // The mutation's own toast reports a failure.
    createEvent.mutateAsync({ ...fields, baby: baby.id }).then(
      (created: BabyEvent) =>
        toast.undo(`${describeEvent(fields)} logged`, () => deleteEvent.mutate(created.id)),
      () => {},
    );
  };

  const end = (event: BabyEvent) =>
    updateEvent.mutate({ id: event.id, data: { ended_at: new Date().toISOString() } });

  return {
    now,
    events,
    status,
    isLoading: eventsQuery.isLoading,
    error: eventsQuery.error,
    refetch: eventsQuery.refetch,
    suggestedSide: suggestedSide(events),
    logDiaper: (diaper: DiaperKind) => log({ kind: 'diaper', diaper }),
    /** Start timing a breast feed; one already running on another side ends. */
    startNursing: (side: Side) => {
      if (status.nursing) end(status.nursing);
      log({ kind: 'feed', feed_method: 'breast', side });
    },
    stopNursing: () => {
      if (status.nursing) end(status.nursing);
    },
    /** Asleep if awake, awake if asleep. */
    toggleSleep: () => {
      if (status.sleeping) end(status.sleeping);
      else log({ kind: 'sleep' });
    },
  };
}

export type BabyLog = ReturnType<typeof useBabyLog>;
