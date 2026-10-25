import { useQuery } from '@tanstack/react-query';
import { aepbase } from '@rambleraptor/homestead-core/api/aepbase';
import type { HouseholdMember } from './types';

export const HOUSEHOLD_QUERY_KEY = ['household'] as const;

/** Everyone who shares this Homestead, by name (`GET /api/household`). */
export async function fetchHousehold(): Promise<HouseholdMember[]> {
  const res = await fetch('/api/household', {
    headers: { Authorization: `Bearer ${aepbase.authStore.token ?? ''}` },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `HTTP ${res.status}`);
  }
  return ((await res.json()) as { members: HouseholdMember[] }).members;
}

/**
 * The household directory. Fails (403) for someone outside the household, such
 * as a guest — render that as an inline error, not an empty household.
 */
export function useHousehold({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({ queryKey: HOUSEHOLD_QUERY_KEY, queryFn: fetchHousehold, enabled });
}
