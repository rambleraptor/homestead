/**
 * Dashboard widget: what the household has been finishing — todos done this
 * week and the day streak. Registered via `todosApp.widgets`; the numbers come
 * from `useMomentum`, the arithmetic from `momentum.ts`.
 *
 * The counts tick when they change, so a todo checked off while the dashboard
 * is open visibly lands here. The flame lights up for a streak of three or
 * more: enough days to be a habit rather than a coincidence.
 */

import { Flame } from 'lucide-react';
import { Skeleton, SkeletonRegion } from '@rambleraptor/homestead-core/shared/components/Skeleton';
import { TickingCount } from '@rambleraptor/homestead-core/shared/components/TickingCount';
import { WidgetCard } from '@rambleraptor/homestead-core/shared/components/WidgetCard';
import { cn } from '@rambleraptor/homestead-core/shared/lib/utils';
import { useMomentum } from '../hooks/useMomentum';

/** A streak this long gets the flame. */
export const HOT_STREAK_DAYS = 3;

export function MomentumWidget() {
  const { doneThisWeek, streak, isLoading } = useMomentum();
  const hot = streak >= HOT_STREAK_DAYS;

  return (
    <WidgetCard
      icon={Flame}
      title="Momentum"
      href="/todos"
      data-testid="todos-momentum-widget"
    >
      {isLoading ? (
        <SkeletonRegion
          label="Loading momentum"
          className="flex items-baseline gap-2 py-2"
          data-testid="todos-momentum-loading"
        >
          <Skeleton className="h-8 w-10" />
          <Skeleton className="h-5 w-28" />
        </SkeletonRegion>
      ) : doneThisWeek === 0 ? (
        <p className="font-body text-text-muted py-2" data-testid="todos-momentum-empty">
          Nothing checked off this week yet — a streak starts with one.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-x-8 gap-y-2 py-2">
          <div className="flex items-baseline gap-2">
            <TickingCount
              value={doneThisWeek}
              className="font-display text-3xl text-text-main"
              data-testid="todos-momentum-done"
            />
            <span className="font-body text-text-muted">done this week</span>
          </div>
          <div className="flex items-center gap-2" data-testid="todos-momentum-streak-line">
            <Flame
              aria-hidden="true"
              className={cn(
                'h-6 w-6 shrink-0',
                hot ? 'animate-celebration-pop text-accent-terracotta' : 'text-gray-300',
              )}
              data-testid="todos-momentum-flame"
              data-hot={hot || undefined}
            />
            {streak > 0 ? (
              <span className="flex items-baseline gap-2">
                <TickingCount
                  value={streak}
                  className="font-display text-3xl text-text-main"
                  data-testid="todos-momentum-streak"
                />
                <span className="font-body text-text-muted">day streak</span>
              </span>
            ) : (
              <span className="font-body text-text-muted">no streak going — finish one today</span>
            )}
          </div>
        </div>
      )}
    </WidgetCard>
  );
}
