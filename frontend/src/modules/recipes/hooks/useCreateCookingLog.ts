/**
 * Create Cooking Log Hook
 *
 * Mutation for logging a cooking session
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/core/api/queryClient';
import { Collections, getCollection } from '@/core/api/pocketbase';
import { logger } from '@/core/utils/logger';
import type { CookingLog, CookingLogFormData, Recipe } from '../types';

export function useCreateCookingLog() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CookingLogFormData) => {
      logger.info(`Creating cooking log for recipe: ${data.recipe}`);

      const log = await getCollection<CookingLog>(Collections.COOKING_LOGS).create({
        recipe: data.recipe,
        date: data.date,
        notes: data.notes || '',
        success: data.success,
        rating: data.rating,
        deviated: data.deviated,
        deviation_notes: data.deviation_notes || '',
      });

      // Update the recipe's last_cooked date
      await getCollection<Recipe>(Collections.RECIPES).update(data.recipe, {
        last_cooked: data.date,
      });

      return log;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['cooking-logs', variables.recipe] });
      queryClient.invalidateQueries({ queryKey: queryKeys.module('recipes').list() });
      queryClient.invalidateQueries({ queryKey: queryKeys.module('recipes').detail(variables.recipe) });
    },
    onError: (error) => {
      logger.error('Failed to create cooking log', error);
    },
  });
}
