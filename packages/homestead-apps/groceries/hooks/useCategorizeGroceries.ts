import { useMutation, useQueryClient } from '@tanstack/react-query';
import { aepbase } from '@rambleraptor/homestead-core/api/aepbase';
import { queryKeys } from '@rambleraptor/homestead-core/api/queryClient';

interface CategorizeResponse {
  sorted: number;
  changed: number;
  message: string;
}

/** Sort the whole list by store section (`groceries:categorize`). */
export function useCategorizeGroceries() {
  const queryClient = useQueryClient();
  return useMutation({
    // The decision is made on the server: nothing to queue for later.
    networkMode: 'online',
    mutationFn: () => aepbase.customMethod<CategorizeResponse>('groceries', 'categorize'),
    // The server wrote the sections; read them back rather than wait on the feed.
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: queryKeys.app('groceries').resource('grocery').list(),
      }),
  });
}
