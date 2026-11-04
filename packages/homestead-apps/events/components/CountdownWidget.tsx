/**
 * Dashboard widget that counts down to a single configured event.
 *
 * Configuration is intentionally NOT exposed inline on the dashboard —
 * the user manages the chosen event and which time-unit cells to show
 * from the events section of the Settings page, reachable via the gear
 * in the widget header.
 */

import { useEffect, useMemo, useState } from 'react';
import { CalendarX, Hourglass } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import {
  Skeleton,
  SkeletonRegion,
} from '@rambleraptor/homestead-core/shared/components/Skeleton';
import { WidgetCard } from '@rambleraptor/homestead-core/shared/components/WidgetCard';
import { EmptyState } from '@rambleraptor/homestead-core/shared/components/EmptyState';
import { QueryError } from '@rambleraptor/homestead-core/shared/components/QueryError';
import { useCountdownConfig } from '../hooks/useCountdownConfig';
import { useCountdownEvent } from '../hooks/useCountdownEvent';
import {
  decomposeRemaining,
  tickIntervalMs,
  type CountdownUnit,
} from '../utils/countdown';

const UNIT_LABEL: Record<CountdownUnit, string> = {
  months: 'months',
  weeks: 'weeks',
  days: 'days',
  hours: 'hours',
  minutes: 'min',
  seconds: 'sec',
};

const CONFIG_PATH = '/settings';

export function CountdownWidget() {
  const navigate = useNavigate();
  const config = useCountdownConfig();
  const {
    event,
    nextDate,
    isLoading: isLoadingEvent,
    error: eventError,
    refetch: refetchEvent,
  } = useCountdownEvent(config.eventId);

  const enabledUnits = config.enabledUnits;
  const interval = useMemo(() => tickIntervalMs(enabledUnits), [enabledUnits]);

  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    if (!nextDate || enabledUnits.length === 0) return;
    const tick = () => setNow(Date.now());
    // Catch up at once (the target or units just changed), then on the beat.
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, interval);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [interval, nextDate, enabledUnits.length]);

  const cells = useMemo(() => {
    if (!nextDate) return [];
    return decomposeRemaining(nextDate.getTime() - now, enabledUnits);
  }, [nextDate, now, enabledUnits]);

  let body: React.ReactNode;
  if (config.isLoading || isLoadingEvent) {
    // Three cells is a guess — the real count depends on how many units the
    // household enabled, which is part of what's still loading. It's the
    // middle of the plausible range, so the cells settle rather than jump.
    body = (
      <SkeletonRegion
        label="Loading countdown"
        className="py-2 space-y-3"
        data-testid="countdown-widget-loading"
      >
        <div className="flex items-baseline justify-between gap-3">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-24 shrink-0" />
        </div>
        <div className="flex flex-wrap gap-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-14 w-14 rounded-lg" />
          ))}
        </div>
      </SkeletonRegion>
    );
  } else if (!config.eventId) {
    body = (
      <EmptyState
        icon={Hourglass}
        title="No countdown configured"
        description="Pick an event in Settings to count down to it here."
        action={{ label: 'Choose an event', onClick: () => navigate(CONFIG_PATH) }}
        compact
        className="my-2"
        data-testid="countdown-widget-empty"
      />
    );
  } else if (eventError) {
    body = (
      <QueryError
        error={eventError}
        onRetry={refetchEvent}
        title="Couldn’t load the countdown"
        compact
        className="my-2"
        data-testid="countdown-widget-error"
      />
    );
  } else if (!event || !nextDate) {
    body = (
      <EmptyState
        icon={CalendarX}
        title="The configured event no longer exists"
        description="Pick another event in Settings."
        action={{ label: 'Choose an event', onClick: () => navigate(CONFIG_PATH) }}
        compact
        className="my-2"
        data-testid="countdown-widget-missing"
      />
    );
  } else if (enabledUnits.length === 0) {
    body = (
      <div className="py-2 space-y-1">
        <p className="font-body text-text-main font-medium">{event.name}</p>
        <p className="font-body text-sm text-text-muted">
          No units selected — the countdown has nothing to display.
        </p>
      </div>
    );
  } else {
    body = (
      <div className="py-2 space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <p className="font-body text-text-main font-medium truncate">
            {event.name}
          </p>
          <p className="font-body text-sm text-text-muted shrink-0">
            {format(nextDate, 'MMM d, yyyy')}
          </p>
        </div>
        <div
          className="flex flex-wrap gap-3"
          data-testid="countdown-cells"
        >
          {cells.map(({ unit, value }) => (
            <div
              key={unit}
              className="flex flex-col items-center min-w-[3.5rem] rounded-lg bg-bg-pearl/60 px-3 py-2"
              data-testid={`countdown-cell-${unit}`}
            >
              <span className="font-display font-semibold text-2xl text-brand-navy tabular-nums">
                {value}
              </span>
              <span className="font-body text-xs text-text-muted uppercase tracking-wide">
                {UNIT_LABEL[unit]}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <WidgetCard
      icon={Hourglass}
      title="Countdown"
      href="/events"
      configHref={CONFIG_PATH}
      configLabel="Configure countdown widget"
      data-testid="countdown-widget"
    >
      {body}
    </WidgetCard>
  );
}
