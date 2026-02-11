/**
 * Import Recipe from URL Hook
 *
 * Mutation that takes a URL, sends it to the server-side API route,
 * and returns structured recipe data extracted from the page.
 */

import { useMutation } from '@tanstack/react-query';
import { pb } from '@/core/api/pocketbase';
import { logger } from '@/core/utils/logger';
import type { ImportedRecipeData } from '../types';

export function useImportRecipeFromUrl() {
  return useMutation({
    mutationFn: async (url: string): Promise<ImportedRecipeData> => {
      logger.info(`Importing recipe from URL: ${url}`);

      const token = pb.authStore.token;
      const response = await fetch('/api/recipes/import-from-url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ url }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || errorData.message || 'Failed to import recipe');
      }

      return response.json();
    },
    onError: (error) => {
      logger.error('Failed to import recipe from URL', error);
    },
  });
}
