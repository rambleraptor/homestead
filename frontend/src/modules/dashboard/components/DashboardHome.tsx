'use client';

/**
 * Dashboard Home Component
 *
 * Home screen showing upcoming birthdays and anniversaries.
 * Composed from the shared HomeOS design-system components
 * (PageHeader / SectionCard / Badge) — new pages should follow the
 * same pattern so typography and spacing stay consistent.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/core/auth/useAuth';
import { ArrowRight, Cake, Loader2, Users } from 'lucide-react';
import { useUpcomingPeople } from '../hooks/useUpcomingPeople';
import { format } from 'date-fns';
import { getTodaysHoliday } from '@/shared/utils/dateUtils';
import { PageHeader } from '@/shared/components/PageHeader';
import { SectionCard } from '@/shared/components/SectionCard';
import { Badge } from '@/shared/components/Badge';

export function DashboardHome() {
  const { user } = useAuth();
  const router = useRouter();
  const { data: upcomingPeople, isLoading: peopleLoading } = useUpcomingPeople();
  const todaysHoliday = getTodaysHoliday();

  const getGreeting = () => {
    if (todaysHoliday) {
      return todaysHoliday.message;
    }
    return user?.name ? `Welcome back, ${user.name}` : 'Welcome back';
  };

  return (
    <div className="space-y-6">
      <PageHeader title={getGreeting()} subtitle="Here's what's happening" />

      <div className="max-w-3xl space-y-6">
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
          {peopleLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 text-text-muted animate-spin" />
            </div>
          ) : upcomingPeople && upcomingPeople.length > 0 ? (
            <ul className="divide-y divide-gray-50">
              {upcomingPeople.map(({ person, type, date }) => {
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
                  <li key={`${person.id}-${type}`}>
                    <button
                      type="button"
                      onClick={() => router.push('/people')}
                      className="w-full text-left py-4 flex items-start justify-between gap-3 hover:bg-bg-pearl/60 transition-colors rounded-lg px-2 -mx-2"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-body font-medium text-text-main text-base truncate">
                          {person.name}
                        </p>
                        <p className="font-body text-sm text-text-muted mt-0.5">
                          {format(date, 'MMM dd')} &middot; {relative}
                        </p>
                      </div>
                      <Badge
                        variant={type === 'Birthday' ? 'birthday' : 'anniversary'}
                      >
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
      </div>
    </div>
  );
}
