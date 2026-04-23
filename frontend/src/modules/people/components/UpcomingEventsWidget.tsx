'use client';

/**
 * Dashboard widget showing upcoming birthdays and anniversaries from
 * the People module. Registered via `peopleModule.widgets`.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Cake, Loader2, Users } from 'lucide-react';
import { format } from 'date-fns';
import { Badge } from '@/shared/components/Badge';
import { SectionCard } from '@/shared/components/SectionCard';
import { useUpcomingPeople } from '../hooks/useUpcomingPeople';

export function UpcomingEventsWidget() {
  const router = useRouter();
  const { data: upcomingPeople, isLoading } = useUpcomingPeople();

  return (
    <SectionCard
      icon={Cake}
      title="Upcoming"
      bodyClassName="px-4 py-0"
      action={
        <Link
          href="/people"
          className="text-sm font-medium text-accent-terracotta hover:text-accent-terracotta-hover flex items-center gap-1 transition-colors"
        >
          View all
          <ArrowRight className="w-4 h-4" />
        </Link>
      }
    >
      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 text-text-muted animate-spin" />
        </div>
      ) : upcomingPeople && upcomingPeople.length > 0 ? (
        <ul className="divide-y divide-gray-50">
          {upcomingPeople.map(({ id, names, type, date }) => {
            const daysUntil = Math.ceil(
              (date.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24),
            );

            const relative =
              daysUntil === 0
                ? 'Today'
                : daysUntil === 1
                ? 'Tomorrow'
                : `in ${daysUntil} days`;

            return (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => router.push('/people')}
                  className="w-full text-left py-4 flex items-start justify-between gap-3 hover:bg-bg-pearl/60 transition-colors rounded-lg px-2 -mx-2"
                >
                  <div className="flex-1 min-w-0">
                    {names.map((n) => (
                      <p
                        key={n}
                        className="font-body font-medium text-text-main text-base truncate"
                      >
                        {n}
                      </p>
                    ))}
                    <p className="font-body text-sm text-text-muted mt-0.5">
                      {format(date, 'MMM dd')} &middot; {relative}
                    </p>
                  </div>
                  <Badge variant={type === 'Birthday' ? 'birthday' : 'anniversary'}>
                    {type}
                  </Badge>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="text-center py-10">
          <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="font-body text-text-muted">
            No upcoming birthdays or anniversaries in the next 30 days
          </p>
        </div>
      )}
    </SectionCard>
  );
}
