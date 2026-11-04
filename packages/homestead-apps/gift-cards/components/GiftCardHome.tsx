/**
 * Gift Card Home Component
 *
 * The list: household totals over every merchant, each a link to its own
 * page. Adding a card, editing one and reading a merchant are routes of their
 * own (`new`, `cards/:id/edit`, `merchants/:merchant`), so they can be opened
 * directly and reloaded.
 */

import { Link } from 'react-router-dom';
import { Plus, Gift, Upload } from 'lucide-react';
import { SkeletonPage } from '@rambleraptor/homestead-core/shared/components/Skeleton';
import { PageHeader } from '@rambleraptor/homestead-core/shared/components/PageHeader';
import { QueryError } from '@rambleraptor/homestead-core/shared/components/QueryError';
import { formatCurrency } from '@rambleraptor/homestead-core/shared/utils/currencyUtils';
import { useMerchantSummaries } from '../hooks/useMerchantSummaries';
import { GIFT_CARDS_HOME, NEW_CARD_HREF } from '../routes';
import { MerchantList } from './MerchantList';

export function GiftCardHome() {
  const { stats, isLoading, isError, error, refetch } = useMerchantSummaries();

  if (isLoading) {
    return (
      // Two columns here, matching the `md:grid-cols-2` gift card grid below.
      <SkeletonPage
        body="cards"
        bodyCount={4}
        label="Loading gift cards"
        bodyClassName="lg:grid-cols-2"
        data-testid="gift-cards-loading"
      />
    );
  }

  if (isError) {
    return (
      <QueryError
        error={error}
        onRetry={() => void refetch()}
        title="Failed to load gift cards"
        data-testid="gift-cards-error"
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gift Cards"
        subtitle="Manage your household gift cards"
        actions={
          <>
            <Link
              to={`${GIFT_CARDS_HOME}/import`}
              data-testid="import-gift-cards-button"
              className="flex items-center gap-2 px-4 py-2 bg-bg-pearl hover:bg-gray-100 text-brand-navy rounded-lg font-medium font-body transition-colors shadow-sm border border-gray-200"
            >
              <Upload className="w-4 h-4" />
              Import
            </Link>
            <Link
              to={NEW_CARD_HREF}
              data-testid="add-gift-card-button"
              className="flex items-center gap-2 px-4 py-2 bg-accent-terracotta hover:bg-accent-terracotta-hover text-white rounded-lg font-medium font-body transition-colors shadow-sm"
            >
              <Plus className="w-5 h-5" />
              Add Gift Card
            </Link>
          </>
        }
      />

      {/* Stats Overview */}
      {stats && stats.totalCards > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-surface-white rounded-2xl shadow-md p-6 border border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-text-muted">
                  Total Balance
                </p>
                <p className="mt-2 text-3xl font-display font-bold text-brand-navy">
                  {formatCurrency(stats.totalAmount)}
                </p>
              </div>
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <Gift className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </div>

          <div className="bg-surface-white rounded-2xl shadow-md p-6 border border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-text-muted">
                  Total Cards
                </p>
                <p className="mt-2 text-3xl font-display font-bold text-brand-navy">
                  {stats.totalCards}
                </p>
              </div>
              <div className="w-12 h-12 bg-accent-terracotta/10 rounded-lg flex items-center justify-center">
                <Gift className="w-6 h-6 text-accent-terracotta" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Merchant List */}
      {stats && <MerchantList merchants={stats.merchants} />}
    </div>
  );
}
