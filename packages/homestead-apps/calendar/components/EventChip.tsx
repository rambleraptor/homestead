/**
 * One occurrence as a button: a coloured strip with the time and title. The
 * same chip serves the month grid (tight, one line) and the week and agenda
 * lists (roomier, with the time on its own line).
 */

import { Repeat } from 'lucide-react';
import { colorClasses } from '../colors';
import type { Occurrence } from '../types';
import { formatOccurrenceTime, formatTime } from '../utils/occurrences';

interface EventChipProps {
  occurrence: Occurrence;
  color: string | undefined;
  /** One line, time abbreviated — for a month cell. */
  compact?: boolean;
  onSelect: (occurrence: Occurrence) => void;
}

export function EventChip({ occurrence, color, compact = false, onSelect }: EventChipProps) {
  const { event, allDay, start } = occurrence;
  const classes = colorClasses(color).chip;
  const repeats = occurrence.recurring || Boolean(event.series);

  if (compact) {
    return (
      <button
        type="button"
        onClick={() => onSelect(occurrence)}
        title={`${event.title} — ${formatOccurrenceTime(occurrence)}`}
        className={`block w-full truncate rounded border-l-4 px-1.5 py-0.5 text-left text-xs ${classes}`}
        data-testid="calendar-event-chip"
      >
        {/* On a phone a cell is ~45px wide: the title matters more than the time. */}
        {!allDay && <span className="mr-1 hidden opacity-70 sm:inline">{formatTime(start)}</span>}
        <span className="font-medium">{event.title}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onSelect(occurrence)}
      className={`block w-full rounded-md border-l-4 px-2.5 py-1.5 text-left ${classes}`}
      data-testid="calendar-event-chip"
    >
      <span className="flex items-center gap-1 text-xs opacity-80">
        {formatOccurrenceTime(occurrence)}
        {repeats && <Repeat className="h-3 w-3" aria-label="Repeats" />}
      </span>
      <span className="block text-sm font-medium">{event.title}</span>
      {event.location && <span className="block truncate text-xs opacity-80">{event.location}</span>}
    </button>
  );
}
