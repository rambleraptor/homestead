/**
 * Recurring notification mutations.
 */

import { aepbase, AepCollections } from '@/core/api/aepbase';
import { queryKeys } from '@/core/api/queryClient';
import {
  useAepCreate,
  useAepUpdate,
  useAepRemove,
} from '@/core/api/resourceHooks';
import type {
  RecurringNotification,
  RecurringNotificationInput,
  NotificationTiming,
} from '../types';
import { useMutation, useQueryClient } from '@tanstack/react-query';

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

function userParent(): string[] {
  return [AepCollections.USERS, requireUserId()];
}

function recurringInvalidateAlso(sourceCollection: string, sourceId: string) {
  return [
    queryKeys
      .module('recurring_notifications')
      .detail(`${sourceCollection}:${sourceId}`),
    queryKeys.module('recurring_notifications').list(),
  ] as const;
}

export function useCreateRecurringNotification() {
  return useAepCreate<AepRecurring, RecurringNotificationInput>(
    AepCollections.RECURRING_NOTIFICATIONS,
    {
      moduleId: 'recurring_notifications',
      parent: userParent,
      transform: (input) => ({
        user_id: requireUserId(),
        source_collection: input.source_collection,
        source_id: input.source_id,
        title_template: input.title_template,
        message_template: input.message_template,
        reference_date_field: input.reference_date_field,
        timing: input.timing,
        enabled: input.enabled ?? true,
      }),
      invalidateAlso: [], // both list + detail are under module(...).all() already
    },
  );
}

interface DeleteRecurringVars {
  id: string;
  sourceCollection: string;
  sourceId: string;
}

export function useDeleteRecurringNotification() {
  const queryClient = useQueryClient();
  const remove = useAepRemove<DeleteRecurringVars>(
    AepCollections.RECURRING_NOTIFICATIONS,
    {
      moduleId: 'recurring_notifications',
      parent: userParent,
      getId: (vars) => vars.id,
      onSuccess: async (_, vars) => {
        // Per-source detail key lives outside module.all(), invalidate explicitly.
        await Promise.all(
          recurringInvalidateAlso(vars.sourceCollection, vars.sourceId).map(
            (key) => queryClient.invalidateQueries({ queryKey: key }),
          ),
        );
      },
    },
  );
  return remove;
}

interface UpdateRecurringEnabledVars {
  id: string;
  enabled: boolean;
  sourceCollection: string;
  sourceId: string;
}

export function useUpdateRecurringNotificationEnabled() {
  const queryClient = useQueryClient();
  return useAepUpdate<AepRecurring, UpdateRecurringEnabledVars>(
    AepCollections.RECURRING_NOTIFICATIONS,
    {
      moduleId: 'recurring_notifications',
      parent: userParent,
      transform: (vars) => ({ enabled: vars.enabled }),
      onSuccess: async (_, vars) => {
        await Promise.all(
          recurringInvalidateAlso(vars.sourceCollection, vars.sourceId).map(
            (key) => queryClient.invalidateQueries({ queryKey: key }),
          ),
        );
      },
    },
  );
}

interface SyncRecurringVars {
  sourceCollection: string;
  sourceId: string;
  referenceDateField: string;
  titleTemplate: string;
  messageTemplate: string;
  desiredTimings: NotificationTiming[];
}

export function useSyncRecurringNotifications() {
  const queryClient = useQueryClient();
  // Multi-step: list → diff → create/remove. Custom mutationFn since the
  // primitives don't compose multiple network calls.
  return useMutation({
    mutationFn: async (vars: SyncRecurringVars) => {
      const userId = requireUserId();
      const parent = [AepCollections.USERS, userId];
      const all = await aepbase.list<AepRecurring>(
        AepCollections.RECURRING_NOTIFICATIONS,
        { parent },
      );
      const existing = all.filter(
        (n) =>
          n.source_collection === vars.sourceCollection &&
          n.source_id === vars.sourceId &&
          n.reference_date_field === vars.referenceDateField,
      );
      const existingTimings = new Set(existing.map((n) => n.timing));
      const desiredSet = new Set(vars.desiredTimings);

      for (const timing of vars.desiredTimings) {
        if (existingTimings.has(timing)) continue;
        await aepbase.create(
          AepCollections.RECURRING_NOTIFICATIONS,
          {
            user_id: userId,
            source_collection: vars.sourceCollection,
            source_id: vars.sourceId,
            title_template: vars.titleTemplate,
            message_template: vars.messageTemplate,
            reference_date_field: vars.referenceDateField,
            timing,
            enabled: true,
          },
          { parent },
        );
      }
      for (const notification of existing) {
        if (desiredSet.has(notification.timing)) continue;
        await aepbase.remove(
          AepCollections.RECURRING_NOTIFICATIONS,
          notification.id,
          { parent },
        );
      }
      return vars;
    },
    onSuccess: async (vars) => {
      await Promise.all(
        recurringInvalidateAlso(vars.sourceCollection, vars.sourceId).map(
          (key) => queryClient.invalidateQueries({ queryKey: key }),
        ),
      );
    },
  });
}
