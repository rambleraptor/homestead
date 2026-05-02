/**
 * HSA KPI Card Component
 *
 * Displays the total liquidatable tax-free cash
 */

import { DollarSign } from 'lucide-react';
import { formatCurrency } from '@rambleraptor/homestead-core/shared/utils/currencyUtils';

interface HSAKPICardProps {
  totalStored: number;
  storedReceipts: number;
}

export function HSAKPICard({ totalStored, storedReceipts }: HSAKPICardProps) {
  return (
    <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg shadow-lg p-8 border-2 border-green-200">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-semibold text-green-700 uppercase tracking-wide">
            Liquidatable Tax-Free Cash
          </p>
          <p className="mt-3 text-5xl font-bold text-green-900">
            {formatCurrency(totalStored)}
          </p>
          <p className="mt-3 text-sm text-green-700">
            From {storedReceipts} stored {storedReceipts === 1 ? 'receipt' : 'receipts'}
          </p>
          <p className="mt-2 text-xs text-green-600 max-w-xl">
            This is the total amount you can withdraw from your HSA tax-free,
            based on your unreimbursed medical expenses.
          </p>
        </div>
        <div className="w-16 h-16 bg-green-500 rounded-lg flex items-center justify-center shadow-md">
          <DollarSign className="w-8 h-8 text-white" />
        </div>
      </div>
    </div>
  );
}
