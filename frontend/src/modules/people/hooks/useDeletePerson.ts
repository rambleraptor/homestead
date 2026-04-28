/**
 * Delete Person Mutation Hook.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { aepbase, AepCollections } from '@/core/api/aepbase';
import { queryKeys } from '@/core/api/queryClient';

export function useDeletePerson() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await aepbase.remove(AepCollections.PEOPLE, id);
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.module('people').list() });
    },
  });
}
