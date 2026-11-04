/**
 * The badge an event wears on its day: "Today", with the age or the years
 * when the event knows them ("Today · Turning 30"). A birthday gets a cake;
 * anything else keeps the app's own calendar-heart. It pops in with the
 * celebration keyframes, because a birthday should feel like one, and that
 * entrance is the only motion — the badge then sits still.
 */

import { Cake, CalendarHeart } from 'lucide-react';
import { cn } from '@rambleraptor/homestead-core/shared/lib/utils';

interface TodayBadgeProps {
  tag?: string;
  /** "Turning 30" / "10 years", or null when the event has no origin year. */
  ageLabel: string | null;
  className?: string;
  'data-testid'?: string;
}

export function TodayBadge({ tag, ageLabel, className, ...rest }: TodayBadgeProps) {
  const Icon = tag === 'birthday' ? Cake : CalendarHeart;
  return (
    <span
      data-testid={rest['data-testid']}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full bg-accent-terracotta/10 px-3 py-1 text-xs font-medium font-body text-accent-terracotta animate-celebration-pop',
        className,
      )}
    >
      <Icon className="w-3.5 h-3.5" aria-hidden="true" />
      <span>Today</span>
      {ageLabel && (
        <>
          <span aria-hidden="true">·</span>
          <span>{ageLabel}</span>
        </>
      )}
    </span>
  );
}
