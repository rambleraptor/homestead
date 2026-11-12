/**
 * What tapping an event shows: when, where, which calendar, and what can be
 * done with it. For a repeating event the choices come in pairs — this one, or
 * all of them — because that is the first thing an edit or a delete has to
 * know.
 */

import { CalendarDays, MapPin, Repeat, StickyNote } from 'lucide-react';
import { Button } from '@rambleraptor/homestead-core/shared/components/Button';
import { colorClasses } from '../colors';
import type { Calendar, Occurrence } from '../types';
import { formatOccurrenceTime } from '../utils/occurrences';
import { parseDay } from '../utils/dates';
import { describeRRule } from '../utils/recurrence';

interface EventDetailsProps {
  occurrence: Occurrence;
  calendar: Calendar | undefined;
  onEdit: () => void;
  onEditSeries: () => void;
  onDelete: () => void;
  onDeleteSeries: () => void;
}

export function EventDetails({
  occurrence,
  calendar,
  onEdit,
  onEditSeries,
  onDelete,
  onDeleteSeries,
}: EventDetailsProps) {
  const { event, recurring, startDay, endDay } = occurrence;
  const dayLabel = parseDay(startDay).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  const when =
    startDay === endDay ? `${dayLabel} · ${formatOccurrenceTime(occurrence)}` : formatOccurrenceTime(occurrence);

  return (
    <div className="space-y-4" data-testid="calendar-event-details">
      <dl className="space-y-2 text-sm text-gray-700">
        <div className="flex items-start gap-2">
          <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
          <dd data-testid="calendar-event-when">{when}</dd>
        </div>
        {recurring && (
          <div className="flex items-start gap-2">
            <Repeat className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
            <dd data-testid="calendar-event-repeat">{describeRRule(event.rrule)}</dd>
          </div>
        )}
        {!recurring && event.series && (
          <div className="flex items-start gap-2">
            <Repeat className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
            <dd>Changed from its repeating series</dd>
          </div>
        )}
        {event.location && (
          <div className="flex items-start gap-2">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
            <dd>{event.location}</dd>
          </div>
        )}
        {event.notes && (
          <div className="flex items-start gap-2">
            <StickyNote className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
            <dd className="whitespace-pre-wrap">{event.notes}</dd>
          </div>
        )}
        {calendar && (
          <div className="flex items-center gap-2">
            <span
              className={`ml-0.5 h-3 w-3 shrink-0 rounded-full ${colorClasses(calendar.color).dot}`}
              aria-hidden="true"
            />
            <dd>{calendar.name}</dd>
          </div>
        )}
      </dl>

      <div className="flex flex-wrap justify-end gap-2 border-t border-gray-100 pt-4">
        {recurring ? (
          <>
            <Button variant="danger" size="sm" onClick={onDelete} data-testid="calendar-event-delete">
              Delete this one
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={onDeleteSeries}
              data-testid="calendar-event-delete-series"
            >
              Delete all
            </Button>
            <Button variant="secondary" size="sm" onClick={onEdit} data-testid="calendar-event-edit">
              Edit this one
            </Button>
            <Button size="sm" onClick={onEditSeries} data-testid="calendar-event-edit-series">
              Edit all
            </Button>
          </>
        ) : (
          <>
            <Button variant="danger" size="sm" onClick={onDelete} data-testid="calendar-event-delete">
              Delete
            </Button>
            <Button size="sm" onClick={onEdit} data-testid="calendar-event-edit">
              Edit
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
