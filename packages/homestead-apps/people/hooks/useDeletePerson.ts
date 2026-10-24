/**
 * Delete Person Mutation Hook.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { aepbase } from '@rambleraptor/homestead-core/api/aepbase';
import { PEOPLE } from '../resources';
import { queryKeys } from '@rambleraptor/homestead-core/api/queryClient';

export function useDeletePerson() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await aepbase.remove(PEOPLE, id);
      return id;
    },
    onSuccess: () => {
      // The engine drops the person from their households and relationships,
      // so every cached view in the app is stale.
      queryClient.invalidateQueries({ queryKey: queryKeys.app('people').all() });
    },
  });
}
