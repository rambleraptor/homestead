/**
 * Per-user countdown configuration shown on the Settings page.
 *
 * Picks the target event and toggles which time-unit cells the
 * dashboard countdown widget displays. Settings save immediately on
 * change. Adapted from the previous `/events/countdown` page;
 * configuration is now per-user (stored on the `user-preference`
 * record via the user-settings system) rather than household-wide.
 */

import { Loader2 } from 'lucide-react';
import { Checkbox } from '@rambleraptor/homestead-core/shared/components/Checkbox';
import { QueryError } from '@rambleraptor/homestead-core/shared/components/QueryError';
import { useEvents } from '../hooks/useEvents';
import { useCountdownConfig } from '../hooks/useCountdownConfig';
import { COUNTDOWN_UNITS, type CountdownUnit } from '../utils/countdown';

const UNIT_LABEL: Record<CountdownUnit, string> = {
  months: 'Months',
  weeks: 'Weeks',
  days: 'Days',
  hours: 'Hours',
  minutes: 'Minutes',
  seconds: 'Seconds',
};

export function EventsSettingsWidget() {
  const {
    data: events = [],
    isLoading: eventsLoading,
    error: eventsError,
    refetch: refetchEvents,
  } = useEvents();
  const config = useCountdownConfig();

  const onEventChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    void config.setEventId(e.target.value);
  };

  const onUnitToggle = (unit: CountdownUnit) => (checked: boolean) => {
    void config.toggleUnit(unit, checked);
  };

  return (
    <div className="space-y-4">
      <div>
        <label
          htmlFor="countdown-config-event"
          className="block text-sm font-medium text-text-main mb-2"
        >
          Countdown event
        </label>
        {eventsLoading ? (
          <div className="flex items-center gap-2 text-text-muted text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading events…
          </div>
        ) : eventsError ? (
          <QueryError
            error={eventsError}
            onRetry={() => void refetchEvents()}
            title="Couldn’t load events"
            compact
            data-testid="countdown-config-events-error"
          />
        ) : (
          <select
            id="countdown-config-event"
            value={config.eventId}
            onChange={onEventChange}
            disabled={config.isLoading}
            data-testid="countdown-config-event-select"
            className="block w-full rounded-md border border-gray-300 bg-surface-white px-3 py-2 text-sm text-text-main focus:border-accent-terracotta focus:outline-none focus:ring-1 focus:ring-accent-terracotta disabled:opacity-50"
          >
            <option value="">— None —</option>
            {events.map((event) => (
              <option key={event.id} value={event.id}>
                {event.name}
              </option>
            ))}
          </select>
        )}
        {!eventsLoading && !eventsError && events.length === 0 && (
          <p className="mt-1 text-xs text-text-muted">
            No events yet — add one on the events page first.
          </p>
        )}
        <p className="mt-1 text-xs text-text-muted">
          The dashboard countdown widget points at this event. Empty
          shows a configure prompt.
        </p>
      </div>

      <div>
        <p className="text-sm font-medium text-text-main mb-2">
          Display units
        </p>
        <p className="text-xs text-text-muted mb-3">
          Each enabled unit becomes a cell on the widget.
        </p>
        <ul className="space-y-2">
          {COUNTDOWN_UNITS.map((unit) => {
            const id = `countdown-config-unit-${unit}`;
            return (
              <li key={unit} className="flex items-center gap-3">
                <Checkbox
                  id={id}
                  checked={config.unitVisibility[unit]}
                  onCheckedChange={onUnitToggle(unit)}
                  data-testid={id}
                />
                <label
                  htmlFor={id}
                  className="text-sm text-text-main select-none cursor-pointer"
                >
                  {UNIT_LABEL[unit]}
                </label>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
