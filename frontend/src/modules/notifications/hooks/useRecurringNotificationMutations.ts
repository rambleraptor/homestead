/**
 * Recurring notification mutations — branch on the `notifications` flag.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { aepbase, AepCollections } from '@/core/api/aepbase';
import { getCollection, pb, Collections } from '@/core/api/pocketbase';
import { isAepbaseEnabled } from '@/core/api/backend';
import { queryKeys } from '@/core/api/queryClient';
import type {
  RecurringNotification,
  RecurringNotificationInput,
  NotificationTiming,
} from '../types';

interface AepRecurring extends RecurringNotification {
  path: string;
  create_time: string;
  update_time: string;
}

function aepUserId(): string | null {
  return aepbase.getCurrentUser()?.id || null;
}

function pbUserId(): string | null {
  return pb.authStore.record?.id || null;
}

export function useCreateRecurringNotification() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: RecurringNotificationInput) => {
      if (isAepbaseEnabled('notifications')) {
        const userId = aepUserId();
        if (!userId) throw new Error('User not authenticated');
        return await aepbase.create<AepRecurring>(
          AepCollections.RECURRING_NOTIFICATIONS,
          {
            user_id: userId,
            source_collection: input.source_collection,
            source_id: input.source_id,
            title_template: input.title_template,
            message_template: input.message_template,
            reference_date_field: input.reference_date_field,
            timing: input.timing,
            enabled: input.enabled ?? true,
          },
          { parent: [AepCollections.USERS, userId] },
        );
      }

      const userId = pbUserId();
      if (!userId) throw new Error('User not authenticated');
      return await getCollection<RecurringNotification>(
        Collections.RECURRING_NOTIFICATIONS,
      ).create({
        user_id: userId,
        source_collection: input.source_collection,
        source_id: input.source_id,
        title_template: input.title_template,
        message_template: input.message_template,
        reference_date_field: input.reference_date_field,
        timing: input.timing,
        enabled: input.enabled ?? true,
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys
          .module(Collections.RECURRING_NOTIFICATIONS)
          .detail(`${variables.source_collection}:${variables.source_id}`),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.module(Collections.RECURRING_NOTIFICATIONS).list(),
      });
    },
  });
}

export function useDeleteRecurringNotification() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      sourceCollection,
      sourceId,
    }: {
      id: string;
      sourceCollection: string;
      sourceId: string;
    }) => {
      if (isAepbaseEnabled('notifications')) {
        const userId = aepUserId();
        if (!userId) throw new Error('User not authenticated');
        await aepbase.remove(AepCollections.RECURRING_NOTIFICATIONS, id, {
          parent: [AepCollections.USERS, userId],
        });
      } else {
        await getCollection<RecurringNotification>(
          Collections.RECURRING_NOTIFICATIONS,
        ).delete(id);
      }
      return { id, sourceCollection, sourceId };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys
          .module(Collections.RECURRING_NOTIFICATIONS)
          .detail(`${result.sourceCollection}:${result.sourceId}`),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.module(Collections.RECURRING_NOTIFICATIONS).list(),
      });
    },
  });
}

export function useUpdateRecurringNotificationEnabled() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      enabled,
      sourceCollection,
      sourceId,
    }: {
      id: string;
      enabled: boolean;
      sourceCollection: string;
      sourceId: string;
    }) => {
      let notification: RecurringNotification;
      if (isAepbaseEnabled('notifications')) {
        const userId = aepUserId();
        if (!userId) throw new Error('User not authenticated');
        notification = await aepbase.update<AepRecurring>(
          AepCollections.RECURRING_NOTIFICATIONS,
          id,
          { enabled },
          { parent: [AepCollections.USERS, userId] },
        );
      } else {
        notification = await getCollection<RecurringNotification>(
          Collections.RECURRING_NOTIFICATIONS,
        ).update(id, { enabled });
      }
      return { notification, sourceCollection, sourceId };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys
          .module(Collections.RECURRING_NOTIFICATIONS)
          .detail(`${result.sourceCollection}:${result.sourceId}`),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.module(Collections.RECURRING_NOTIFICATIONS).list(),
      });
    },
  });
}

export function useSyncRecurringNotifications() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      sourceCollection,
      sourceId,
      referenceDateField,
      titleTemplate,
      messageTemplate,
      desiredTimings,
    }: {
      sourceCollection: string;
      sourceId: string;
      referenceDateField: string;
      titleTemplate: string;
      messageTemplate: string;
      desiredTimings: NotificationTiming[];
    }) => {
      const useAep = isAepbaseEnabled('notifications');
      const userId = useAep ? aepUserId() : pbUserId();
      if (!userId) throw new Error('User not authenticated');

      let existing: RecurringNotification[];
      if (useAep) {
        const all = await aepbase.list<AepRecurring>(
          AepCollections.RECURRING_NOTIFICATIONS,
          { parent: [AepCollections.USERS, userId] },
        );
        existing = all.filter(
          (n) =>
            n.source_collection === sourceCollection &&
            n.source_id === sourceId &&
            n.reference_date_field === referenceDateField,
        );
      } else {
        existing = await getCollection<RecurringNotification>(
          Collections.RECURRING_NOTIFICATIONS,
        ).getFullList({
          filter: `user_id="${userId}" && source_collection="${sourceCollection}" && source_id="${sourceId}" && reference_date_field="${referenceDateField}"`,
        });
      }

      const existingTimings = new Set(existing.map((n) => n.timing));
      const desiredSet = new Set(desiredTimings);

      for (const timing of desiredTimings) {
        if (existingTimings.has(timing)) continue;
        const body = {
          user_id: userId,
          source_collection: sourceCollection,
          source_id: sourceId,
          title_template: titleTemplate,
          message_template: messageTemplate,
          reference_date_field: referenceDateField,
          timing,
          enabled: true,
        };
        if (useAep) {
          await aepbase.create(AepCollections.RECURRING_NOTIFICATIONS, body, {
            parent: [AepCollections.USERS, userId],
          });
        } else {
          await getCollection<RecurringNotification>(
            Collections.RECURRING_NOTIFICATIONS,
          ).create(body);
        }
      }

      for (const notification of existing) {
        if (desiredSet.has(notification.timing)) continue;
        if (useAep) {
          await aepbase.remove(AepCollections.RECURRING_NOTIFICATIONS, notification.id, {
            parent: [AepCollections.USERS, userId],
          });
        } else {
          await getCollection<RecurringNotification>(
            Collections.RECURRING_NOTIFICATIONS,
          ).delete(notification.id);
        }
      }

      return { sourceCollection, sourceId, referenceDateField };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys
          .module(Collections.RECURRING_NOTIFICATIONS)
          .detail(`${result.sourceCollection}:${result.sourceId}`),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.module(Collections.RECURRING_NOTIFICATIONS).list(),
      });
    },
  });
}
