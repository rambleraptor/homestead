/**
 * Household reads and writes. Writes invalidate the whole people app cache:
 * a household's address shows on every member's card.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { aepbase } from '@rambleraptor/homestead-core/api/aepbase';
import { queryKeys } from '@rambleraptor/homestead-core/api/queryClient';
import { useResourceList } from '@rambleraptor/homestead-core/api/resourceHooks';
import { HOUSEHOLDS } from '../resources';
import type { Household, HouseholdFormData } from '../types';
import { createHousehold, householdBody } from '../utils/householdSync';

export function useHouseholds() {
  return useResourceList<Household>('people', 'household', HOUSEHOLDS, {
    map: (h) => ({ ...h, members: h.members ?? [] }),
    sort: (a, b) => a.name.localeCompare(b.name),
  });
}

function useInvalidatePeople() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.app('people').all() });
}

export function useCreateHousehold() {
  const invalidate = useInvalidatePeople();
  return useMutation({
    mutationFn: (data: HouseholdFormData) => createHousehold(data),
    onSuccess: invalidate,
  });
}

export function useUpdateHousehold() {
  const invalidate = useInvalidatePeople();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: HouseholdFormData }) =>
      aepbase.update<Household>(HOUSEHOLDS, id, householdBody(data)),
    onSuccess: invalidate,
  });
}

export function useDeleteHousehold() {
  const invalidate = useInvalidatePeople();
  return useMutation({
    mutationFn: (id: string) => aepbase.remove(HOUSEHOLDS, id),
    onSuccess: invalidate,
  });
}
