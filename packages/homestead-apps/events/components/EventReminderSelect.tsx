/**
 * Per-user reminder control for one event, shown on the event card.
 *
 * Each household member sets their own choice; the value is read from and
 * written to that user's `event-reminder` record via {@link useEventReminder}.
 * `Off` means no record at all.
 */

import { Bell } from 'lucide-react';
import { useEventReminder } from '../hooks/useEventReminder';
import type { ReminderChoice } from '../types';

const OPTIONS: ReadonlyArray<{ value: ReminderChoice; label: string }> = [
  { value: 'none', label: 'Off' },
  { value: 'day_of', label: 'Day of' },
  { value: 'week_before', label: 'Week before' },
  { value: 'both', label: 'Both' },
];

interface EventReminderSelectProps {
  eventId: string;
}

export function EventReminderSelect({ eventId }: EventReminderSelectProps) {
  const { choice, isLoading, isSaving, setChoice } = useEventReminder(eventId);

  return (
    <div className="flex items-center gap-2">
      <label
        htmlFor={`event-reminder-${eventId}`}
        className="flex items-center gap-1.5 text-sm text-text-muted"
      >
        <Bell className="w-4 h-4" aria-hidden="true" />
        Remind me
      </label>
      <select
        id={`event-reminder-${eventId}`}
        data-testid={`event-card-reminder-${eventId}`}
        value={choice}
        disabled={isLoading || isSaving}
        onChange={(e) => void setChoice(e.target.value as ReminderChoice)}
        className="rounded-md border border-gray-300 bg-surface-white px-2 py-1 text-sm text-text-main focus:border-accent-terracotta focus:outline-none focus:ring-1 focus:ring-accent-terracotta disabled:opacity-50"
      >
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
