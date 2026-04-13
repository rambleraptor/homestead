import { useMutation, useQueryClient } from '@tanstack/react-query';
import { aepbase, AepCollections } from '@/core/api/aepbase';
import type { Action } from '../types';

export function useUpdateAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      parameters,
    }: {
      id: string;
      parameters: Record<string, unknown>;
    }) =>
      aepbase.update<Action>(AepCollections.ACTIONS, id, { parameters }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['actions'] });
      queryClient.invalidateQueries({ queryKey: ['actions', 'detail', variables.id] });
    },
  });
}
