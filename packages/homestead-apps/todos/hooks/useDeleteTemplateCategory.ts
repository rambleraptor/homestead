/**
 * Removes a category from a list template. Addressed via the nested URL
 * (`/list-templates/{id}/template-categories/{cat_id}`). The engine's
 * `set-null` onDelete on `template-item.template_category` clears the pointer
 * on any item still in this category.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@rambleraptor/homestead-core/api/queryClient';
import { aepbase } from '@rambleraptor/homestead-core/api/aepbase';
import { LIST_TEMPLATES, TEMPLATE_CATEGORIES } from '../resources';

interface DeleteTemplateCategoryParams {
  templateId: string;
  id: string;
}

export function useDeleteTemplateCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ templateId, id }: DeleteTemplateCategoryParams) => {
      await aepbase.remove(TEMPLATE_CATEGORIES, id, {
        parent: [LIST_TEMPLATES, templateId],
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.app('todos').all(),
      });
    },
  });
}
