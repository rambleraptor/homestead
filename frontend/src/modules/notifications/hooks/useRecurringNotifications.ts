/**
 * Recurring notification queries. Children of users; filter client-side.
 */

import { useQuery } from '@tanstack/react-query';
import { aepbase, AepCollections } from '@/core/api/aepbase';
import { queryKeys } from '@/core/api/queryClient';
import type { RecurringNotification } from '../types';

interface AepRecurring extends RecurringNotification {
  path: string;
  create_time: string;
  update_time: string;
}

function normalize(rec: AepRecurring): RecurringNotification {
  return {
    ...rec,
    created: rec.create_time || '',
    updated: rec.update_time || '',
  };
}

export function useRecurringNotifications(sourceCollection: string, sourceId: string) {
  return useQuery({
    queryKey: queryKeys
      .module('recurring_notifications')
      .detail(`${sourceCollection}:${sourceId}`),
    queryFn: async () => {
      if (!sourceId) return [];
      const userId = aepbase.getCurrentUser()?.id;
      if (!userId) return [];
      const all = await aepbase.list<AepRecurring>(
        AepCollections.RECURRING_NOTIFICATIONS,
        { parent: [AepCollections.USERS, userId] },
      );
      return all
        .filter(
          (n) => n.source_collection === sourceCollection && n.source_id === sourceId,
        )
        .map(normalize)
        .sort((a, b) => {
          const fieldCmp = a.reference_date_field.localeCompare(b.reference_date_field);
          return fieldCmp !== 0 ? fieldCmp : a.timing.localeCompare(b.timing);
        });
    },
    enabled: !!sourceId,
  });
}

export function useAllRecurringNotifications() {
  return useQuery({
    queryKey: queryKeys.module('recurring_notifications').list(),
    queryFn: async () => {
      const userId = aepbase.getCurrentUser()?.id;
      if (!userId) return [];
      const all = await aepbase.list<AepRecurring>(
        AepCollections.RECURRING_NOTIFICATIONS,
        { parent: [AepCollections.USERS, userId] },
      );
      return all
        .map(normalize)
        .sort((a, b) => (b.created || '').localeCompare(a.created || ''));
    },
  });
}
