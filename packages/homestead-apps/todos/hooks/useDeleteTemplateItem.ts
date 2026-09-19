/**
 * Removes an item from a list template. Addressed via the nested URL
 * (`/list-templates/{id}/template-items/{item_id}`).
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@rambleraptor/homestead-core/api/queryClient';
import { aepbase } from '@rambleraptor/homestead-core/api/aepbase';
import { LIST_TEMPLATES, TEMPLATE_ITEMS } from '../resources';

interface DeleteTemplateItemParams {
  templateId: string;
  itemId: string;
}

export function useDeleteTemplateItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ templateId, itemId }: DeleteTemplateItemParams) => {
      await aepbase.remove(TEMPLATE_ITEMS, itemId, {
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
