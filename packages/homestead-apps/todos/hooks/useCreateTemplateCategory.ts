/**
 * Adds a category to a list template. Lives at
 * `/list-templates/{id}/template-categories/{cat_id}`.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@rambleraptor/homestead-core/api/queryClient';
import { aepbase } from '@rambleraptor/homestead-core/api/aepbase';
import { LIST_TEMPLATES, TEMPLATE_CATEGORIES } from '../resources';
import type { TemplateCategory } from '../types';

interface CreateTemplateCategoryParams {
  templateId: string;
  name: string;
  position: number;
}

export function useCreateTemplateCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      templateId,
      name,
      position,
    }: CreateTemplateCategoryParams) =>
      aepbase.create<TemplateCategory>(
        TEMPLATE_CATEGORIES,
        { name, position },
        { parent: [LIST_TEMPLATES, templateId] },
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.app('todos').all(),
      });
    },
  });
}
