import { useMemo } from 'react';
import { usePeople } from './usePeople';
import type { PeopleStats } from '../types';

export function usePeopleStats() {
  const { data: people, isLoading, isError, error } = usePeople();

  const stats = useMemo<PeopleStats | undefined>(() => {
    if (!people) return undefined;
    return {
      totalPeople: people.length,
    };
  }, [people]);

  return {
    data: stats,
    isLoading,
    isError,
    error,
  };
}
