/**
 * Merchant List Component
 *
 * Displays list of merchants with total amounts. Each row is a link to the
 * merchant's page (`/gift-cards/merchants/:merchant`), so a merchant can be
 * opened directly, shared, or reloaded. On first paint the rows rise into
 * place one after another — a short stagger, capped so a long list doesn't
 * make the last row wait; the global reduced-motion guard zeroes it.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Store, ChevronDown, ChevronUp } from 'lucide-react';
import { viewTransitionName } from '@rambleraptor/homestead-core/shared/motion/viewTransition';
import { formatCurrency } from '@rambleraptor/homestead-core/shared/utils/currencyUtils';
import { merchantHref } from '../routes';
import type { MerchantSummary } from '../types';

const ROW_STAGGER_MS = 30;
const MAX_STAGGERED_ROWS = 8;

interface MerchantListProps {
  merchants: MerchantSummary[];
}

export function MerchantList({ merchants }: MerchantListProps) {
  const [showArchived, setShowArchived] = useState(false);

  // Separate active and archived merchants
  const activeMerchants = merchants.filter((m) => !m.archived);
  const archivedMerchants = merchants.filter((m) => m.archived);

  if (merchants.length === 0) {
    return (
      <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
        <Store className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <p className="text-gray-600">
          No gift cards yet. Add your first card to get started!
        </p>
      </div>
    );
  }

  const renderMerchant = (merchant: MerchantSummary, index: number, isArchived = false) => (
    <Link
      key={merchant.merchant}
      to={merchantHref(merchant.merchant)}
      className={`animate-field-rise block w-full bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow text-left group focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-terracotta ${
        isArchived ? 'opacity-60' : ''
      }`}
      style={{ animationDelay: `${Math.min(index, MAX_STAGGERED_ROWS) * ROW_STAGGER_MS}ms` }}
      data-testid="merchant-row"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className={`w-12 h-12 rounded-lg flex items-center justify-center ${
              isArchived
                ? 'bg-gray-100'
                : 'bg-accent-terracotta/10'
            }`}
          >
            <Store
              className={`w-6 h-6 ${
                isArchived
                  ? 'text-gray-400'
                  : 'text-accent-terracotta'
              }`}
            />
          </div>
          <div>
            <h3
              className="text-lg font-semibold text-gray-900"
              style={viewTransitionName('merchant', merchant.merchant)}
            >
              {merchant.merchant}
            </h3>
            <p className="text-sm text-gray-600">
              {merchant.cardCount} {merchant.cardCount === 1 ? 'card' : 'cards'}
              {isArchived && ' • Archived'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-right">
            <p className={`text-2xl font-bold ${
              isArchived
                ? 'text-gray-400'
                : 'text-accent-terracotta'
            }`}>
              {formatCurrency(merchant.totalAmount)}
            </p>
          </div>
          <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-gray-600 transition-colors" />
        </div>
      </div>
    </Link>
  );

  return (
    <div className="space-y-4">
      {/* Active Merchants */}
      {activeMerchants.length > 0 && (
        <div className="space-y-3">
          {activeMerchants.map((merchant, index) => renderMerchant(merchant, index, false))}
        </div>
      )}

      {/* Archived Merchants Toggle */}
      {archivedMerchants.length > 0 && (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setShowArchived(!showArchived)}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
          >
            {showArchived ? (
              <ChevronUp className="w-5 h-5" />
            ) : (
              <ChevronDown className="w-5 h-5" />
            )}
            <span className="font-medium">
              Archived Merchants ({archivedMerchants.length})
            </span>
          </button>

          {showArchived && (
            <div className="space-y-3">
              {archivedMerchants.map((merchant, index) => renderMerchant(merchant, index, true))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
