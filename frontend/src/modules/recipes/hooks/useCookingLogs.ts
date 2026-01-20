/**
 * Cooking Logs Query Hook
 *
 * Fetches cooking logs for a specific recipe
 */

import { useQuery } from '@tanstack/react-query';
import { Collections, getCollection } from '@/core/api/pocketbase';
import type { CookingLog } from '../types';

export function useCookingLogs(recipeId: string | undefined) {
  return useQuery({
    queryKey: ['cooking-logs', recipeId],
    queryFn: async () => {
      if (!recipeId) return [];
      const logs = await getCollection<CookingLog>(Collections.COOKING_LOGS).getFullList({
        filter: `recipe = "${recipeId}"`,
        sort: '-date',
      });
      return logs;
    },
    enabled: !!recipeId,
  });
}
