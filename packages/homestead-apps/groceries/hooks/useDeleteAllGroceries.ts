import { useMutation, useQueryClient } from '@tanstack/react-query';
import { aepbase } from '@rambleraptor/homestead-core/api/aepbase';
import { GROCERIES } from '../resources';
import { queryKeys } from '@rambleraptor/homestead-core/api/queryClient';
import type { GroceryItem } from '../types';

export function useDeleteAllGroceries() {
  const queryClient = useQueryClient();
  return useMutation({
    // Bulk N-delete is online-only — the UI disables the trigger when
    // offline (see GroceriesHome.tsx) instead of queueing N writes.
    networkMode: 'online',
    mutationFn: async () => {
      const items = await aepbase.list<GroceryItem>(GROCERIES);
      await Promise.all(
        items.map((item) => aepbase.remove(GROCERIES, item.id)),
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.app('groceries').resource('grocery').list() });
    },
  });
}
