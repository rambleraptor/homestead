/**
 * Merchant List Component
 *
 * Displays list of merchants with total amounts
 */

import { useState } from 'react';
import { ChevronRight, Store, ChevronDown, ChevronUp } from 'lucide-react';
import type { MerchantSummary } from '../types';

interface MerchantListProps {
  merchants: MerchantSummary[];
  onMerchantClick: (merchant: string) => void;
}

export function MerchantList({ merchants, onMerchantClick }: MerchantListProps) {
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

  const renderMerchant = (merchant: MerchantSummary, isArchived = false) => (
    <button
      key={merchant.merchant}
      onClick={() => onMerchantClick(merchant.merchant)}
      className={`w-full bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow text-left group ${
        isArchived ? 'opacity-60' : ''
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className={`w-12 h-12 rounded-lg flex items-center justify-center overflow-hidden ${
              isArchived
                ? 'bg-gray-100'
                : 'bg-primary-100'
            }`}
          >
            {merchant.logo_url ? (
              <img
                src={merchant.logo_url}
                alt={`${merchant.merchant} logo`}
                className="w-full h-full object-contain p-1"
                onError={(e) => {
                  // Fallback to Store icon if image fails to load
                  e.currentTarget.style.display = 'none';
                  const parent = e.currentTarget.parentElement;
                  if (parent) {
                    const icon = document.createElement('div');
                    icon.innerHTML = `<svg class="w-6 h-6 ${
                      isArchived ? 'text-gray-400' : 'text-primary-600'
                    }" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>`;
                    parent.appendChild(icon.firstElementChild!);
                  }
                }}
              />
            ) : (
              <Store
                className={`w-6 h-6 ${
                  isArchived
                    ? 'text-gray-400'
                    : 'text-primary-600'
                }`}
              />
            )}
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
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
                : 'text-primary-600'
            }`}>
              ${merchant.totalAmount.toFixed(2)}
            </p>
          </div>
          <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-gray-600 transition-colors" />
        </div>
      </div>
    </button>
  );

  return (
    <div className="space-y-4">
      {/* Active Merchants */}
      {activeMerchants.length > 0 && (
        <div className="space-y-3">
          {activeMerchants.map((merchant) => renderMerchant(merchant, false))}
        </div>
      )}

      {/* Archived Merchants Toggle */}
      {archivedMerchants.length > 0 && (
        <div className="space-y-3">
          <button
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
              {archivedMerchants.map((merchant) => renderMerchant(merchant, true))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
