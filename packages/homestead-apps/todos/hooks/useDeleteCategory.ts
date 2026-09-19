/**
 * Removes a category from a project. Addressed via the nested URL
 * (`/projects/{id}/categories/{cat_id}`). The engine's `set-null` onDelete on
 * `todo.category` clears the pointer on any todo still in this category, so
 * those todos become uncategorized rather than dangling.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@rambleraptor/homestead-core/api/queryClient';
import { aepbase } from '@rambleraptor/homestead-core/api/aepbase';
import { CATEGORIES, PROJECTS } from '../resources';

interface DeleteCategoryParams {
  projectId: string;
  id: string;
}

export function useDeleteCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ projectId, id }: DeleteCategoryParams) => {
      await aepbase.remove(CATEGORIES, id, {
        parent: [PROJECTS, projectId],
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.app('todos').all(),
      });
    },
  });
}
