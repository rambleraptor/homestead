/**
 * The things a person does to an event, in the terms they think in — save
 * this, change just this one, skip this one, delete them all — each turned
 * into the writes that mean it.
 *
 * A series is one record, so "just this one" is never an edit of it: skipping
 * an occurrence adds its start to the series' `exdates`, and changing one
 * writes a second record that points back through `series`. Every write goes
 * through the generic mutations, so each is optimistic and queues offline.
 */

import { useCallback } from 'react';
import type { CalendarEvent, Occurrence } from '../types';
import { referenceId } from '../utils/occurrences';
import { shiftStart, type EventFields } from '../utils/draft';
import {
  useCalendarEvents,
  useCreateCalendarEvent,
  useDeleteCalendarEvent,
  useUpdateCalendarEvent,
} from './useCalendarEvents';

export function useEventActions() {
  const { data: events } = useCalendarEvents();
  const create = useCreateCalendarEvent();
  const update = useUpdateCalendarEvent();
  const remove = useDeleteCalendarEvent();
  const { mutateAsync: createAsync } = create;
  const { mutateAsync: updateAsync } = update;
  const { mutateAsync: removeAsync } = remove;

  const createEvent = useCallback(
    (calendar: string, fields: EventFields) =>
      createAsync({
        calendar,
        ...fields,
        location: fields.location ?? undefined,
        notes: fields.notes ?? undefined,
        rrule: fields.rrule ?? undefined,
      }),
    [createAsync],
  );

  /**
   * Save an edit to an event, or to a whole series. When a series' start
   * moves, the occurrences skipped or replaced against its old times move with
   * it; otherwise they'd come back, or show twice.
   */
  const updateEvent = useCallback(
    async (event: CalendarEvent, fields: EventFields) => {
      const moved = event.rrule && fields.start !== event.start;
      const exdates = moved
        ? (event.exdates ?? [])
            .map((d) => shiftStart(d, event.start, fields.start))
            .filter((d): d is string => d !== null)
        : undefined;
      await updateAsync({
        id: event.id,
        data: { ...fields, ...(exdates ? { exdates: exdates.length > 0 ? exdates : null } : {}) },
      });
      if (!moved) return;
      const replacements = (events ?? []).filter(
        (e) => referenceId(e.series) === event.id && e.original_start,
      );
      for (const replacement of replacements) {
        const shifted = shiftStart(replacement.original_start!, event.start, fields.start);
        if (shifted) await updateAsync({ id: replacement.id, data: { original_start: shifted } });
      }
    },
    [events, updateAsync],
  );

  /** Change one occurrence of a series, leaving the rest as they are. */
  const updateOccurrence = useCallback(
    (occurrence: Occurrence, fields: EventFields) =>
      createAsync({
        calendar: occurrence.event.calendar,
        ...fields,
        location: fields.location ?? undefined,
        notes: fields.notes ?? undefined,
        rrule: undefined,
        series: occurrence.event.id,
        original_start: occurrence.originalStart,
      }),
    [createAsync],
  );

  /** Remove what the person is looking at: one occurrence, or a one-off event. */
  const deleteOccurrence = useCallback(
    async (occurrence: Occurrence) => {
      const { event } = occurrence;
      if (occurrence.recurring) {
        await updateAsync({
          id: event.id,
          data: { exdates: [...(event.exdates ?? []), occurrence.originalStart] },
        });
        return;
      }
      // A changed occurrence stands in for one the series would otherwise
      // show; deleting it has to skip that one too, or it comes back.
      const series = event.series
        ? (events ?? []).find((e) => e.id === referenceId(event.series))
        : undefined;
      if (series && event.original_start) {
        await updateAsync({
          id: series.id,
          data: { exdates: [...(series.exdates ?? []), event.original_start] },
        });
      }
      await removeAsync(event.id);
    },
    [events, removeAsync, updateAsync],
  );

  /** Delete a series outright; its changed occurrences go with it (`onDelete: cascade`). */
  const deleteSeries = useCallback((event: CalendarEvent) => removeAsync(event.id), [removeAsync]);

  return {
    createEvent,
    updateEvent,
    updateOccurrence,
    deleteOccurrence,
    deleteSeries,
    isSaving: create.isPending || update.isPending,
    isDeleting: remove.isPending || update.isPending,
  };
}
