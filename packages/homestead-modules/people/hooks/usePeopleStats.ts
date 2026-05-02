import { useMemo } from 'react';
import { usePeople } from './usePeople';
import type { PeopleStats } from '../types';

export function usePeopleStats() {
  const { data: people, isLoading, isError, error } = usePeople();

  const stats = useMemo<PeopleStats | undefined>(() => {
    if (!people) return undefined;

    const now = new Date();
    // Normalize to start of day for accurate comparison
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);

    const oneMonthFromNow = new Date(startOfToday);
    oneMonthFromNow.setMonth(oneMonthFromNow.getMonth() + 1);

    const upcomingBirthdays = people.filter((person) => {
      if (!person.birthday) return false;
      const eventDate = new Date(person.birthday);
      let nextOccurrence = new Date(
        startOfToday.getFullYear(),
        eventDate.getMonth(),
        eventDate.getDate()
      );
      if (nextOccurrence < startOfToday) {
        nextOccurrence = new Date(
          startOfToday.getFullYear() + 1,
          eventDate.getMonth(),
          eventDate.getDate()
        );
      }
      return nextOccurrence >= startOfToday && nextOccurrence <= oneMonthFromNow;
    });

    const upcomingAnniversaries = people.filter((person) => {
      if (!person.anniversary) return false;
      const eventDate = new Date(person.anniversary);
      let nextOccurrence = new Date(
        startOfToday.getFullYear(),
        eventDate.getMonth(),
        eventDate.getDate()
      );
      if (nextOccurrence < startOfToday) {
        nextOccurrence = new Date(
          startOfToday.getFullYear() + 1,
          eventDate.getMonth(),
          eventDate.getDate()
        );
      }
      return nextOccurrence >= startOfToday && nextOccurrence <= oneMonthFromNow;
    });

    return {
      totalPeople: people.length,
      upcomingBirthdays: upcomingBirthdays.length,
      upcomingAnniversaries: upcomingAnniversaries.length,
    };
  }, [people]);

  return {
    data: stats,
    isLoading,
    isError,
    error,
  };
}
