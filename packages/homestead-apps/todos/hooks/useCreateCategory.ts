/**
 * Adds a category to a project. Lives at `/projects/{id}/categories/{cat_id}`,
 * so the project id is part of the URL rather than a stored field.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@rambleraptor/homestead-core/api/queryClient';
import { aepbase } from '@rambleraptor/homestead-core/api/aepbase';
import { CATEGORIES, PROJECTS } from '../resources';
import type { Category } from '../types';

interface CreateCategoryParams {
  projectId: string;
  name: string;
  /** Sort position; callers pass the current category count to append. */
  position: number;
}

export function useCreateCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ projectId, name, position }: CreateCategoryParams) =>
      aepbase.create<Category>(
        CATEGORIES,
        { name, position },
        { parent: [PROJECTS, projectId] },
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.app('todos').all(),
      });
    },
  });
}
