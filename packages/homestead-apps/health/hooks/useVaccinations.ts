/**
 * Vaccination (dose) query hooks. Doses are children of a vaccine in aepbase,
 * addressed via the URL (`/vaccines/{id}/vaccinations`) rather than a filter,
 * so reads keep a per-parent cache key. Newest dose first, ordered
 * server-side. Keys live under the health app namespace so the mutations'
 * app-wide invalidation refreshes them too.
 */

import { useQueries, useQuery } from '@tanstack/react-query';
import { queryKeys } from '@rambleraptor/homestead-core/api/queryClient';
import { aepbase } from '@rambleraptor/homestead-core/api/aepbase';
import { VACCINATIONS, VACCINES } from '../resources';
import type { Vaccination, Vaccine } from '../types';

const dosesKey = (vaccineId: string) => [
  ...queryKeys.app('health').all(),
  'vaccinations',
  vaccineId,
];

function fetchDoses(vaccineId: string): Promise<Vaccination[]> {
  return aepbase.list<Vaccination>(VACCINATIONS, {
    parent: [VACCINES, vaccineId],
    orderBy: '-date_administered',
  });
}

/** One vaccine's doses, newest first. */
export function useVaccinations(vaccineId: string | null) {
  return useQuery({
    queryKey: dosesKey(vaccineId ?? ''),
    queryFn: () => (vaccineId ? fetchDoses(vaccineId) : Promise.resolve([])),
    enabled: !!vaccineId,
  });
}

/**
 * Doses for every listed vaccine, fanned out in parallel (children are
 * URL-addressed per parent, so there is no single cross-parent list call).
 * Household-scale data keeps this cheap. Returns a map keyed by vaccine id;
 * a vaccine whose fetch hasn't resolved yet is simply absent.
 */
export function useAllVaccinations(vaccines: readonly Vaccine[] | undefined): {
  dosesByVaccine: Map<string, Vaccination[]>;
  /** A series whose doses failed to load, with a way to try again. */
  doseErrorsByVaccine: Map<string, { error: Error; retry: () => void }>;
  isLoading: boolean;
} {
  const results = useQueries({
    queries: (vaccines ?? []).map((vaccine) => ({
      queryKey: dosesKey(vaccine.id),
      queryFn: () => fetchDoses(vaccine.id),
    })),
  });

  const dosesByVaccine = new Map<string, Vaccination[]>();
  const doseErrorsByVaccine = new Map<string, { error: Error; retry: () => void }>();
  (vaccines ?? []).forEach((vaccine, i) => {
    const result = results[i];
    if (result?.data) dosesByVaccine.set(vaccine.id, result.data);
    else if (result?.error) {
      doseErrorsByVaccine.set(vaccine.id, {
        error: result.error,
        retry: () => void result.refetch(),
      });
    }
  });

  return {
    dosesByVaccine,
    doseErrorsByVaccine,
    isLoading: results.some((r) => r.isLoading),
  };
}
