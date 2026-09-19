/**
 * Renames or repositions a category. Addressed via the nested URL
 * (`/projects/{id}/categories/{cat_id}`).
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@rambleraptor/homestead-core/api/queryClient';
import { aepbase } from '@rambleraptor/homestead-core/api/aepbase';
import { CATEGORIES, PROJECTS } from '../resources';
import type { Category } from '../types';

interface UpdateCategoryParams {
  projectId: string;
  id: string;
  data: Partial<Pick<Category, 'name' | 'position'>>;
}

export function useUpdateCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ projectId, id, data }: UpdateCategoryParams) =>
      aepbase.update<Category>(CATEGORIES, id, data, {
        parent: [PROJECTS, projectId],
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.app('todos').all(),
      });
    },
  });
}
