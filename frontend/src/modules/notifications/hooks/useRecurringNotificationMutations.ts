/**
 * Recurring notification mutations.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { aepbase, AepCollections } from '@/core/api/aepbase';
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

function requireUserId(): string {
  const id = aepbase.getCurrentUser()?.id;
  if (!id) throw new Error('User not authenticated');
  return id;
}

export function useCreateRecurringNotification() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: RecurringNotificationInput) => {
      const userId = requireUserId();
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
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys
          .module('recurring_notifications')
          .detail(`${variables.source_collection}:${variables.source_id}`),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.module('recurring_notifications').list(),
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
      const userId = requireUserId();
      await aepbase.remove(AepCollections.RECURRING_NOTIFICATIONS, id, {
        parent: [AepCollections.USERS, userId],
      });
      return { id, sourceCollection, sourceId };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys
          .module('recurring_notifications')
          .detail(`${result.sourceCollection}:${result.sourceId}`),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.module('recurring_notifications').list(),
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
      const userId = requireUserId();
      const notification = await aepbase.update<AepRecurring>(
        AepCollections.RECURRING_NOTIFICATIONS,
        id,
        { enabled },
        { parent: [AepCollections.USERS, userId] },
      );
      return { notification, sourceCollection, sourceId };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys
          .module('recurring_notifications')
          .detail(`${result.sourceCollection}:${result.sourceId}`),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.module('recurring_notifications').list(),
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
      const userId = requireUserId();
      const all = await aepbase.list<AepRecurring>(
        AepCollections.RECURRING_NOTIFICATIONS,
        { parent: [AepCollections.USERS, userId] },
      );
      const existing = all.filter(
        (n) =>
          n.source_collection === sourceCollection &&
          n.source_id === sourceId &&
          n.reference_date_field === referenceDateField,
      );

      const existingTimings = new Set(existing.map((n) => n.timing));
      const desiredSet = new Set(desiredTimings);

      for (const timing of desiredTimings) {
        if (existingTimings.has(timing)) continue;
        await aepbase.create(
          AepCollections.RECURRING_NOTIFICATIONS,
          {
            user_id: userId,
            source_collection: sourceCollection,
            source_id: sourceId,
            title_template: titleTemplate,
            message_template: messageTemplate,
            reference_date_field: referenceDateField,
            timing,
            enabled: true,
          },
          { parent: [AepCollections.USERS, userId] },
        );
      }
      for (const notification of existing) {
        if (desiredSet.has(notification.timing)) continue;
        await aepbase.remove(AepCollections.RECURRING_NOTIFICATIONS, notification.id, {
          parent: [AepCollections.USERS, userId],
        });
      }
      return { sourceCollection, sourceId, referenceDateField };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys
          .module('recurring_notifications')
          .detail(`${result.sourceCollection}:${result.sourceId}`),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.module('recurring_notifications').list(),
      });
    },
  });
}
