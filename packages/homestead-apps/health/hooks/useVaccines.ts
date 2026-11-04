import { useResourceItem, useResourceList } from '@rambleraptor/homestead-core/api/resourceHooks';
import { VACCINES } from '../resources';
import type { Vaccine } from '../types';

/**
 * The current user's vaccine series, alphabetical. The collection is
 * `access: { model: 'private' }`, so the engine already scopes the list to
 * the caller's own rows — no client-side filtering needed.
 */
export function useVaccines() {
  return useResourceList<Vaccine>('health', 'vaccine', VACCINES, {
    orderBy: 'name',
  });
}

/** One vaccine series by id, for the form pages that edit it or add to it. */
export function useVaccine(id: string | null) {
  return useResourceItem<Vaccine>('health', 'vaccine', VACCINES, id);
}
