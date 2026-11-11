import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { aepbase } from '@rambleraptor/homestead-core/api/aepbase';
import { useHousehold } from '@rambleraptor/homestead-core/household/useHousehold';
import { QueryError } from '@rambleraptor/homestead-core/shared/components/QueryError';
import { Button } from '@rambleraptor/homestead-core/shared/components/ui/button';
import {
  addDays,
  dayLabel,
  dayTotals,
  eventsOnDay,
  formatDuration,
  formatVolume,
  startOfDay,
} from '../baby';
import { useBabyDay, windowStart } from '../hooks/useBabyEvents';
import type { BabyLog } from '../hooks/useBabyLog';
import type { Baby, BabyEvent, VolumeUnit } from '../types';
import { EventRow } from './EventRow';

interface TimelineProps {
  baby: Baby;
  log: BabyLog;
  unit: VolumeUnit;
  onOpen: (event: BabyEvent) => void;
}

/** One day of entries with its totals; step back a day at a time. */
export function Timeline({ baby, log, unit, onOpen }: TimelineProps) {
  const today = startOfDay(new Date(log.now));
  const [offset, setOffset] = useState(0);
  const day = addDays(today, -offset);
  // Recent days come from the working set; older ones are read on demand.
  const older = day.getTime() < windowStart(new Date(log.now)).getTime();
  const olderDay = useBabyDay(baby.id, day, older);

  const dayTime = day.getTime();
  const events = useMemo(
    () => (older ? (olderDay.data ?? []) : eventsOnDay(log.events, new Date(dayTime))),
    [older, olderDay.data, log.events, dayTime],
  );
  const totals = dayTotals(events, unit, log.now);

  const household = useHousehold();
  const me = aepbase.getCurrentUser()?.id;
  const loggedBy = (event: BabyEvent): string | undefined => {
    const id = event.created_by?.replace(/^users\//, '');
    if (!id || id === me) return undefined;
    return household.data?.find((m) => m.id === id)?.name;
  };

  const summary = [
    `${totals.feeds} ${totals.feeds === 1 ? 'feed' : 'feeds'}`,
    totals.bottleVolume > 0 ? formatVolume(totals.bottleVolume, unit) : undefined,
    `${totals.wet} wet`,
    `${totals.dirty} dirty`,
    totals.sleepMs > 0 ? `${formatDuration(totals.sleepMs)} sleep` : undefined,
  ].filter(Boolean);

  return (
    <section className="rounded-2xl border border-gray-200 bg-surface-white p-3" data-testid="baby-timeline">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Previous day"
          data-testid="baby-day-prev"
          onClick={() => setOffset((n) => n + 1)}
        >
          <ChevronLeft />
        </Button>
        <h2 className="flex-1 text-center font-display text-lg font-bold text-brand-navy" data-testid="baby-day-label">
          {dayLabel(day, new Date(log.now))}
        </h2>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Next day"
          data-testid="baby-day-next"
          disabled={offset === 0}
          onClick={() => setOffset((n) => Math.max(0, n - 1))}
        >
          <ChevronRight />
        </Button>
      </div>
      <p className="mb-2 text-center text-xs text-text-muted" data-testid="baby-day-totals">
        {summary.join(' · ')}
      </p>

      {older && olderDay.isError ? (
        <QueryError error={olderDay.error} onRetry={() => void olderDay.refetch()} compact />
      ) : older && olderDay.isLoading ? (
        <p className="py-4 text-center text-sm text-text-muted">Loading…</p>
      ) : events.length === 0 ? (
        <p className="py-4 text-center text-sm text-text-muted" data-testid="baby-day-empty">
          Nothing logged {offset === 0 ? 'yet today' : 'this day'}.
        </p>
      ) : (
        <ul>
          {events.map((event) => (
            <EventRow key={event.id} event={event} now={log.now} loggedBy={loggedBy(event)} onOpen={onOpen} />
          ))}
        </ul>
      )}
    </section>
  );
}
