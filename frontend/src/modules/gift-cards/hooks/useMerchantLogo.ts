/**
 * Merchant Logo Hook
 *
 * Fetches and caches merchant logos
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/core/api/queryClient';
import { Collections, getCollection } from '@/core/api/pocketbase';
import { fetchMerchantLogo, extractDomain } from '../utils/merchantLogo';
import type { Merchant } from '../types';

export function useMerchantLogo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (merchantName: string): Promise<Merchant> => {
      // Check if merchant already exists
      try {
        const existing = await getCollection<Merchant>(Collections.MERCHANTS)
          .getFirstListItem(`name = "${merchantName}"`);

        // If logo already exists, return it
        if (existing.logo_url) {
          return existing;
        }

        // Fetch logo from Clearbit
        const logoUrl = await fetchMerchantLogo(merchantName);

        // Update merchant with logo URL
        const updated = await getCollection<Merchant>(Collections.MERCHANTS)
          .update(existing.id, {
            logo_url: logoUrl || undefined,
            domain: extractDomain(merchantName),
          });

        return updated;
      } catch {
        // Merchant doesn't exist, create it
        const logoUrl = await fetchMerchantLogo(merchantName);

        const created = await getCollection<Merchant>(Collections.MERCHANTS)
          .create({
            name: merchantName,
            domain: extractDomain(merchantName),
            logo_url: logoUrl || undefined,
          });

        return created;
      }
    },
    onSuccess: () => {
      // Invalidate merchants query to refetch
      queryClient.invalidateQueries({ queryKey: queryKeys.module('merchants').list() });
    },
  });
}
