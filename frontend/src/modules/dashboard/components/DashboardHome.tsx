'use client';

/**
 * Dashboard Home Component
 *
 * Home screen showing upcoming birthdays and anniversaries.
 * Styled per HomeOS design system tokens (see globals.css).
 */

import { useRouter } from 'next/navigation';
import { useAuth } from '@/core/auth/useAuth';
import { ArrowRight, Cake, Loader2, Users } from 'lucide-react';
import { useUpcomingPeople } from '../hooks/useUpcomingPeople';
import { format } from 'date-fns';
import { getTodaysHoliday } from '@/shared/utils/dateUtils';

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
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-display font-bold text-brand-navy tracking-tight">
          {getGreeting()}
        </h1>
        <p className="text-base font-body text-text-muted mt-1">
          Here&apos;s what&apos;s happening
        </p>
      </div>

      {/* Main Content */}
      <div className="max-w-3xl space-y-6">
        {/* Upcoming Birthdays & Anniversaries Card */}
        <section className="bg-surface-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {/* Card Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-50">
            <div className="flex items-center gap-3">
              <div className="bg-gray-50 rounded-lg p-2">
                <Cake className="w-5 h-5 text-brand-navy" aria-hidden="true" />
              </div>
              <h2 className="font-display font-semibold text-lg text-brand-navy">
                Upcoming
              </h2>
            </div>
            <button
              onClick={() => router.push('/people')}
              className="text-sm font-medium text-accent-terracotta hover:text-accent-terracotta-hover flex items-center gap-1 transition-colors"
            >
              View all
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {/* Card Body */}
          <div className="px-4">
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

                  const badgeClass =
                    type === 'Birthday'
                      ? 'bg-blue-50 text-blue-700'
                      : 'bg-orange-50 text-orange-700';

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
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-medium ${badgeClass}`}
                        >
                          {type}
                        </span>
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
          </div>
        </section>
      </div>
    </div>
  );
}
