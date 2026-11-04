/**
 * Dashboard widget answering the one question worth a dashboard slot: does
 * anything go to the curb soon, and what?
 *
 * Shows the next collection day large, with the days after it listed compactly
 * beneath. Reads the same `garbage-pickups` collection as the Home page.
 */

import { Trash2 } from 'lucide-react';
import { Badge } from '@rambleraptor/homestead-core/shared/components/Badge';
import {
  Skeleton,
  SkeletonRegion,
} from '@rambleraptor/homestead-core/shared/components/Skeleton';
import { WidgetCard } from '@rambleraptor/homestead-core/shared/components/WidgetCard';
import { EmptyState } from '@rambleraptor/homestead-core/shared/components/EmptyState';
import { QueryError } from '@rambleraptor/homestead-core/shared/components/QueryError';
import { useUpcomingPickupDays } from '../hooks/useGarbagePickups';
import { parseIsoDate, relativeDayLabel, streamLabel } from '../utils/pickups';
import { StreamChip } from './StreamChip';

/** Enough to cover a biweekly recycling cycle without turning into a calendar. */
const LOOKAHEAD_DAYS = 14;
/** Days listed under the headline one. */
const FOLLOWING_SHOWN = 3;

export function NextPickupWidget() {
  const { data: days, isLoading, isError, error, refetch } =
    useUpcomingPickupDays(LOOKAHEAD_DAYS);
  const [next, ...rest] = days ?? [];

  return (
    <WidgetCard
      icon={Trash2}
      title="Next pickup"
      href="/home"
      data-testid="next-pickup-widget"
    >
      {isLoading ? (
        // Mirrors the headline day, its full date, and the stream chips —
        // the widget leads with one large line, so a generic row stack would
        // resolve into something noticeably different.
        <SkeletonRegion
          label="Loading next pickup"
          className="space-y-4"
          data-testid="next-pickup-widget-loading"
        >
          <div>
            <Skeleton className="h-8 w-36" />
            <Skeleton className="mt-1 h-4 w-44" />
            <div className="mt-2 flex gap-1.5">
              <Skeleton className="h-6 w-20 rounded-full" />
              <Skeleton className="h-6 w-24 rounded-full" />
            </div>
          </div>
          <div className="space-y-2 border-t border-gray-100 pt-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
          </div>
        </SkeletonRegion>
      ) : isError && !days ? (
        <QueryError
          compact
          error={error}
          onRetry={refetch}
          title="Couldn’t load pickups"
          data-testid="next-pickup-widget-error"
        />
      ) : next ? (
        <div className="space-y-4">
          <div>
            <p className="flex items-center gap-2 font-display text-2xl font-bold text-brand-navy">
              {relativeDayLabel(next.date) ?? next.date}
              {next.delayed && <Badge variant="warning">Delayed</Badge>}
            </p>
            <p className="font-body text-sm text-text-muted">
              {parseIsoDate(next.date)?.toLocaleDateString(undefined, {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
              }) ?? next.date}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {next.pickups.map((pickup) => (
                <StreamChip key={pickup.id} stream={pickup.stream} />
              ))}
            </div>
            {next.delayed && (
              <p className="mt-2 font-body text-sm text-amber-700">
                {next.pickups.find((pickup) => pickup.note)?.note ??
                  'Pushed back by a holiday.'}
              </p>
            )}
          </div>

          {rest.length > 0 && (
            <ul className="space-y-1 border-t border-gray-100 pt-3">
              {rest.slice(0, FOLLOWING_SHOWN).map((day) => (
                <li
                  key={day.date}
                  className="flex items-center justify-between gap-3 font-body text-sm"
                  data-testid={`next-pickup-following-${day.date}`}
                >
                  <span className="text-text-muted">
                    {relativeDayLabel(day.date) ?? day.date}
                  </span>
                  <span className="truncate text-right text-text-muted">
                    {day.pickups.map((pickup) => streamLabel(pickup.stream)).join(', ')}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <EmptyState
          compact
          icon={Trash2}
          title={`No pickups in the next ${LOOKAHEAD_DAYS} days`}
          description="Nothing needs to go to the curb for now."
          data-testid="next-pickup-widget-empty"
        />
      )}
    </WidgetCard>
  );
}
