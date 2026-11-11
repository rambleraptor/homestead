/**
 * Baby events, written. All three go through the offline mutation factory, so
 * an entry logged with no signal is kept on the device and sent later. The
 * factory builds `/babies/{id}/baby-events` from the `baby` id on a create and
 * from the cached record on an update or delete.
 */

import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@rambleraptor/homestead-core/api/queryClient';
import {
  useResourceCreate,
  useResourceDelete,
  useResourceUpdate,
} from '@rambleraptor/homestead-core/api/resourceHooks';
import type { BabyEvent, BabyEventCreate, BabyEventFields } from '../types';

export function useCreateBabyEvent() {
  return useResourceCreate<BabyEvent, BabyEventCreate>('baby', 'baby-event');
}

export function useUpdateBabyEvent() {
  return useResourceUpdate<BabyEvent, Partial<BabyEventFields>>('baby', 'baby-event');
}

export function useDeleteBabyEvent() {
  return useResourceDelete('baby', 'baby-event');
}

/**
 * Make an event from outside the working set (an older day) writable: the
 * factory finds a record's address in the cache, so put it there.
 */
export function usePrimeBabyEvent() {
  const queryClient = useQueryClient();
  return (event: BabyEvent) => {
    const key = queryKeys.app('baby').resource('baby-event').detail(event.id);
    if (queryClient.getQueryData(key) === undefined) queryClient.setQueryData(key, event);
  };
}
