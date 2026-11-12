/**
 * The month grid: whole weeks, one cell per day, each showing its first few
 * events. Tapping a day's number starts a new event on it; "+N more" opens
 * that day's week, where everything fits.
 */

import type { Occurrence } from '../types';
import { parseDay, sameMonth } from '../utils/dates';
import { occurrencesOnDay } from '../utils/occurrences';
import type { YearlyDate } from '../utils/yearly';
import { EventChip } from './EventChip';
import { YearlyDateChip } from './YearlyDateChip';

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MAX_PER_CELL = 3;

interface MonthViewProps {
  days: string[];
  /** The day the grid is centred on; days outside its month are dimmed. */
  anchor: string;
  today: string;
  occurrences: Occurrence[];
  /** Birthdays and anniversaries from the Events app, shown above the day's events. */
  yearlyDates: YearlyDate[];
  colorOf: (calendarId: string) => string | undefined;
  onSelect: (occurrence: Occurrence) => void;
  onAdd: (day: string) => void;
  onShowDay: (day: string) => void;
}

export function MonthView({
  days,
  anchor,
  today,
  occurrences,
  yearlyDates,
  colorOf,
  onSelect,
  onAdd,
  onShowDay,
}: MonthViewProps) {
  return (
    <div
      className="overflow-hidden rounded-2xl border border-gray-100 bg-surface-white"
      data-testid="calendar-month"
    >
      <div className="grid grid-cols-7 border-b border-gray-100 text-center text-xs font-semibold uppercase tracking-wide text-text-muted">
        {WEEKDAY_NAMES.map((name) => (
          <div key={name} className="py-2">
            {name}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day) => {
          const dayOccurrences = occurrencesOnDay(occurrences, day);
          const shown = dayOccurrences.slice(0, MAX_PER_CELL);
          const hidden = dayOccurrences.length - shown.length;
          const inMonth = sameMonth(day, anchor);
          const date = parseDay(day);
          return (
            <div
              key={day}
              className={`min-h-24 min-w-0 border-b border-r border-gray-100 p-1 ${inMonth ? '' : 'bg-gray-50'}`}
              data-testid="calendar-day"
              data-day={day}
            >
              <button
                type="button"
                onClick={() => onAdd(day)}
                aria-label={`Add an event on ${date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}`}
                className={`mb-1 flex h-7 w-7 items-center justify-center rounded-full text-sm hover:bg-gray-100 ${
                  day === today
                    ? 'bg-brand-navy font-semibold text-white hover:bg-brand-navy'
                    : inMonth
                      ? 'text-gray-900'
                      : 'text-gray-400'
                }`}
                data-testid="calendar-day-add"
              >
                {date.getDate()}
              </button>
              <div className="space-y-0.5">
                {yearlyDates
                  .filter((date) => date.day === day)
                  .map((date) => (
                    <YearlyDateChip key={date.key} date={date} compact />
                  ))}
                {shown.map((occurrence) => (
                  <EventChip
                    key={occurrence.key}
                    occurrence={occurrence}
                    color={colorOf(occurrence.event.calendar)}
                    compact
                    onSelect={onSelect}
                  />
                ))}
                {hidden > 0 && (
                  <button
                    type="button"
                    onClick={() => onShowDay(day)}
                    className="block w-full rounded px-1.5 text-left text-xs text-text-muted hover:bg-gray-100"
                    data-testid="calendar-day-more"
                  >
                    +{hidden} more
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
