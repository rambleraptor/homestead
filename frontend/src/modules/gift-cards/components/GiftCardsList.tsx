'use client';

/**
 * Gift Cards List Component
 *
 * Data-backed wrapper around `MerchantList` that owns its own fetching.
 * Used by the omnibox list view — it deliberately omits the page header,
 * stats overview, and "Add Gift Card" / "Import" buttons so the omnibox
 * doesn't render chrome that belongs to the module's full home page.
 *
 * Clicking a merchant navigates to the full Gift Cards page so users can
 * drill into the merchant detail view there.
 */

import { useRouter } from 'next/navigation';
import { Loader2, AlertCircle } from 'lucide-react';
import { useMerchantSummaries } from '../hooks/useMerchantSummaries';
import { MerchantList } from './MerchantList';

export function GiftCardsList() {
  const router = useRouter();
  const { stats, isLoading, isError, error } = useMerchantSummaries();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-accent-terracotta animate-spin" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="bg-red-50/20 border border-red-200 rounded-lg p-6">
        <div className="flex items-center gap-3">
          <AlertCircle className="w-6 h-6 text-red-600" />
          <div>
            <h3 className="font-semibold text-red-900">
              Failed to load gift cards
            </h3>
            <p className="text-sm text-red-700">
              {error instanceof Error ? error.message : 'An error occurred'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!stats) return null;

  return (
    <MerchantList
      merchants={stats.merchants}
      onMerchantClick={() => router.push('/gift-cards')}
    />
  );
}
