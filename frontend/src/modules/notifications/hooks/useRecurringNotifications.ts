/**
 * Recurring notification queries — branch on the `notifications` flag.
 *
 * In aepbase, recurring-notifications is a child of users
 * (`/users/{id}/recurring-notifications`). We filter by source collection +
 * id client-side since aepbase has no filter expression equivalent.
 */

import { useQuery } from '@tanstack/react-query';
import { aepbase, AepCollections } from '@/core/api/aepbase';
import { getCollection, pb, Collections } from '@/core/api/pocketbase';
import { isAepbaseEnabled } from '@/core/api/backend';
import { queryKeys } from '@/core/api/queryClient';
import type { RecurringNotification } from '../types';

interface AepRecurring extends RecurringNotification {
  path: string;
  create_time: string;
  update_time: string;
}

function normalize(rec: AepRecurring | RecurringNotification): RecurringNotification {
  const ae = rec as AepRecurring;
  return {
    ...rec,
    created: ae.create_time || rec.created || '',
    updated: ae.update_time || rec.updated || '',
  };
}

export function useRecurringNotifications(sourceCollection: string, sourceId: string) {
  return useQuery({
    queryKey: queryKeys
      .module(Collections.RECURRING_NOTIFICATIONS)
      .detail(`${sourceCollection}:${sourceId}`),
    queryFn: async () => {
      if (!sourceId) return [];

      if (isAepbaseEnabled('notifications')) {
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
      }

      const userId = pb.authStore.record?.id;
      if (!userId) return [];
      return await getCollection<RecurringNotification>(
        Collections.RECURRING_NOTIFICATIONS,
      ).getFullList({
        sort: 'reference_date_field,timing',
        filter: `user_id="${userId}" && source_collection="${sourceCollection}" && source_id="${sourceId}"`,
      });
    },
    enabled: !!sourceId,
  });
}

export function useAllRecurringNotifications() {
  return useQuery({
    queryKey: queryKeys.module(Collections.RECURRING_NOTIFICATIONS).list(),
    queryFn: async () => {
      if (isAepbaseEnabled('notifications')) {
        const userId = aepbase.getCurrentUser()?.id;
        if (!userId) return [];
        const all = await aepbase.list<AepRecurring>(
          AepCollections.RECURRING_NOTIFICATIONS,
          { parent: [AepCollections.USERS, userId] },
        );
        return all
          .map(normalize)
          .sort((a, b) => (b.created || '').localeCompare(a.created || ''));
      }

      const userId = pb.authStore.record?.id;
      if (!userId) return [];
      return await getCollection<RecurringNotification>(
        Collections.RECURRING_NOTIFICATIONS,
      ).getFullList({
        sort: '-created',
        filter: `user_id="${userId}"`,
      });
    },
  });
}
