/**
 * A run of days, each with its events listed in order — the shape behind both
 * the week (seven columns, every day shown) and the agenda (one column, only
 * the days that have something).
 */

import { Plus } from 'lucide-react';
import type { Occurrence } from '../types';
import { parseDay } from '../utils/dates';
import { occurrencesOnDay } from '../utils/occurrences';
import type { YearlyDate } from '../utils/yearly';
import { EventChip } from './EventChip';
import { YearlyDateChip } from './YearlyDateChip';

interface DayListViewProps {
  days: string[];
  today: string;
  occurrences: Occurrence[];
  /** Birthdays and anniversaries from the Events app, shown above the day's events. */
  yearlyDates: YearlyDate[];
  layout: 'week' | 'agenda';
  colorOf: (calendarId: string) => string | undefined;
  onSelect: (occurrence: Occurrence) => void;
  onAdd: (day: string) => void;
}

export function DayListView({
  days,
  today,
  occurrences,
  yearlyDates,
  layout,
  colorOf,
  onSelect,
  onAdd,
}: DayListViewProps) {
  const week = layout === 'week';
  const sections = days
    .map((day) => ({
      day,
      items: occurrencesOnDay(occurrences, day),
      dates: yearlyDates.filter((date) => date.day === day),
    }))
    .filter((section) => week || section.items.length > 0 || section.dates.length > 0);

  if (sections.length === 0) {
    return (
      <p
        className="rounded-2xl border border-dashed border-gray-200 p-8 text-center text-sm text-text-muted"
        data-testid="calendar-agenda-empty"
      >
        Nothing on the calendar for these days.
      </p>
    );
  }

  return (
    <div
      className={week ? 'grid grid-cols-1 gap-3 md:grid-cols-7' : 'space-y-3'}
      data-testid={week ? 'calendar-week' : 'calendar-agenda'}
    >
      {sections.map(({ day, items, dates }) => {
        const date = parseDay(day);
        return (
          <section
            key={day}
            className="min-w-0 rounded-2xl border border-gray-100 bg-surface-white p-2"
            data-testid="calendar-day"
            data-day={day}
          >
            <div className="mb-2 flex items-center justify-between gap-1">
              <h3
                className={`text-sm font-semibold ${day === today ? 'text-brand-navy' : 'text-gray-700'}`}
              >
                {date.toLocaleDateString(
                  undefined,
                  // A week column is narrow, and the range above names the month.
                  week
                    ? { weekday: 'short', day: 'numeric' }
                    : { weekday: 'short', month: 'short', day: 'numeric' },
                )}
                {day === today && <span className="ml-1 text-xs font-normal">· Today</span>}
              </h3>
              <button
                type="button"
                onClick={() => onAdd(day)}
                aria-label={`Add an event on ${date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}`}
                className="rounded-full p-1 text-gray-500 hover:bg-gray-100"
                data-testid="calendar-day-add"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <div className="space-y-1">
              {dates.map((date) => (
                <YearlyDateChip key={date.key} date={date} />
              ))}
              {items.map((occurrence) => (
                <EventChip
                  key={occurrence.key}
                  occurrence={occurrence}
                  color={colorOf(occurrence.event.calendar)}
                  onSelect={onSelect}
                />
              ))}
              {items.length === 0 && dates.length === 0 && <p className="px-1 text-xs text-gray-400">Nothing planned</p>}
            </div>
          </section>
        );
      })}
    </div>
  );
}
