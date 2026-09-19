/**
 * Adds an item to a list template. The item lives at
 * `/list-templates/{id}/template-items/{item_id}`, so the parent id is part
 * of the URL rather than a stored field.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@rambleraptor/homestead-core/api/queryClient';
import { aepbase } from '@rambleraptor/homestead-core/api/aepbase';
import { LIST_TEMPLATES, TEMPLATE_ITEMS } from '../resources';
import type { TemplateItem } from '../types';

interface CreateTemplateItemParams {
  templateId: string;
  title: string;
  /** Template-category record id. Omit for uncategorized. */
  templateCategory?: string;
}

export function useCreateTemplateItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      templateId,
      title,
      templateCategory,
    }: CreateTemplateItemParams) =>
      aepbase.create<TemplateItem>(
        TEMPLATE_ITEMS,
        {
          title,
          ...(templateCategory ? { template_category: templateCategory } : {}),
        },
        { parent: [LIST_TEMPLATES, templateId] },
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.app('todos').all(),
      });
    },
  });
}
