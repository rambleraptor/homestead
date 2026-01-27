/**
 * Create Grocery Item Hook
 *
 * Mutation for creating a new grocery item.
 * Also triggers a notification (with 10-minute cooldown) to alert
 * other family members that items have been added.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/core/api/queryClient';
import { Collections, getCollection, pb } from '@/core/api/pocketbase';
import { logger } from '@/core/utils/logger';
import type { GroceryItem, GroceryItemFormData } from '../types';

/**
 * Trigger a grocery notification (with cooldown)
 * This is fire-and-forget - we don't want to block the UI if it fails
 */
async function triggerGroceryNotification(): Promise<void> {
  try {
    const token = pb.authStore.token;
    if (!token) {
      return;
    }

    await fetch('/api/notifications/grocery', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  } catch (error) {
    // Silently ignore notification errors - don't disrupt the main flow
    logger.warn('Failed to trigger grocery notification', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export function useCreateGroceryItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: GroceryItemFormData) => {
      logger.info(`Creating grocery item: ${data.name}`);

      // Create the item without auto-categorization
      const item = await getCollection<GroceryItem>(Collections.GROCERIES).create({
        name: data.name,
        notes: data.notes || '',
        store: data.store || '',
        checked: false,
      });

      return item;
    },
    onSuccess: () => {
      // Invalidate groceries list to refresh
      queryClient.invalidateQueries({ queryKey: queryKeys.module('groceries').list() });

      // Trigger notification (fire-and-forget, with cooldown)
      triggerGroceryNotification();
    },
    onError: (error) => {
      logger.error('Failed to create grocery item', error);
    },
  });
}
