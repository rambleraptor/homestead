/**
 * Update action hook — branches on the `actions` flag.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { aepbase, AepCollections } from '@/core/api/aepbase';
import { pb } from '@/core/api/pocketbase';
import { isAepbaseEnabled } from '@/core/api/backend';
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
    }) => {
      if (isAepbaseEnabled('actions')) {
        return await aepbase.update<Action>(AepCollections.ACTIONS, id, { parameters });
      }
      return await pb.collection('actions').update<Action>(id, { parameters });
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['actions'] });
      queryClient.invalidateQueries({ queryKey: ['actions', 'detail', variables.id] });
    },
  });
}
