/**
 * Deletes a list template and its item subtree. Template items are children
 * of the template in aepbase, so a plain DELETE would 409 while items remain —
 * we force the AEP-135 cascade to remove the template and its items together.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@rambleraptor/homestead-core/api/queryClient';
import { aepbase } from '@rambleraptor/homestead-core/api/aepbase';
import { LIST_TEMPLATES } from '../resources';

export function useDeleteListTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (templateId: string): Promise<void> => {
      await aepbase.remove(LIST_TEMPLATES, templateId, { force: true });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.app('todos').all(),
      });
    },
  });
}
