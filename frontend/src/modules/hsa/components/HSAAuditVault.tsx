/**
 * HSA Audit Vault Component
 *
 * Table view of HSA receipts with filtering
 */

import { useMemo } from 'react';
import { CheckCircle, ExternalLink, Trash2 } from 'lucide-react';
import { formatCurrency } from '@/shared/utils/currencyUtils';
import { formatDate } from '@/shared/utils/dateUtils';
import type { HSAStats, HSAReceipt, ReceiptStatus } from '../types';
import { useHSAReceipts } from '../hooks/useHSAReceipts';
import { useHSAReceiptUrl } from '../hooks/useHSAReceiptUrl';

/**
 * Renders an HSA receipt's `receipt_file` as a link. Wrapped in a component
 * so the backend-aware URL hook can be called once per row.
 */
function HSAReceiptLink({ receipt }: { receipt: HSAReceipt }) {
  const url = useHSAReceiptUrl(receipt);
  if (!url) {
    return <span className="text-gray-400 text-sm">Loading…</span>;
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-accent-terracotta hover:text-accent-terracotta-hover font-medium"
    >
      View
      <ExternalLink className="w-3 h-3" />
    </a>
  );
}

interface HSAAuditVaultProps {
  stats: HSAStats;
  statusFilter: ReceiptStatus | 'All';
  onStatusFilterChange: (status: ReceiptStatus | 'All') => void;
  onMarkAsReimbursed: (id: string) => void;
  onDelete: (id: string) => void;
  isUpdating: boolean;
}

export function HSAAuditVault({
  stats,
  statusFilter,
  onStatusFilterChange,
  onMarkAsReimbursed,
  onDelete,
  isUpdating,
}: HSAAuditVaultProps) {
  const { data: receipts } = useHSAReceipts();

  const filteredReceipts = useMemo(() => {
    if (!receipts) return [];
    if (statusFilter === 'All') return receipts;
    return receipts.filter((r) => r.status === statusFilter);
  }, [receipts, statusFilter]);


  return (
    <div className="bg-white rounded-lg shadow-md border border-gray-200">
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">Audit Vault</h2>
          <div className="flex items-center gap-2">
            <label htmlFor="status-filter" className="text-sm font-medium text-gray-700">
              Filter:
            </label>
            <select
              id="status-filter"
              value={statusFilter}
              onChange={(e) => onStatusFilterChange(e.target.value as ReceiptStatus | 'All')}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-accent-terracotta focus:border-accent-terracotta"
            >
              <option value="All">All ({stats.totalReceipts})</option>
              <option value="Stored">Stored ({stats.storedReceipts})</option>
              <option value="Reimbursed">Reimbursed ({stats.reimbursedReceipts})</option>
            </select>
          </div>
        </div>
      </div>

      {filteredReceipts.length === 0 ? (
        <div className="p-8 text-center text-gray-500">
          <p>No receipts found</p>
          {statusFilter !== 'All' && (
            <button
              onClick={() => onStatusFilterChange('All')}
              className="mt-2 text-sm text-accent-terracotta hover:text-accent-terracotta-hover"
            >
              View all receipts
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Merchant
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Amount
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Category
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Patient
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Receipt
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredReceipts.map((receipt) => (
                <tr key={receipt.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {formatDate(receipt.service_date)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {receipt.merchant}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {formatCurrency(receipt.amount)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      {receipt.category}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                    {receipt.patient || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <HSAReceiptLink receipt={receipt} />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {receipt.status === 'Stored' ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        Stored
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                        Reimbursed
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <div className="flex items-center gap-2">
                      {receipt.status === 'Stored' && (
                        <button
                          onClick={() => onMarkAsReimbursed(receipt.id)}
                          disabled={isUpdating}
                          aria-label={`Mark ${receipt.merchant} receipt as reimbursed`}
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white rounded-lg text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Mark as Reimbursed"
                        >
                          <CheckCircle className="w-3.5 h-3.5" />
                          Mark Reimbursed
                        </button>
                      )}
                      <button
                        onClick={() => onDelete(receipt.id)}
                        aria-label={`Delete ${receipt.merchant} receipt`}
                        className="p-1.5 text-red-600 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
                        title="Delete receipt"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Summary Footer */}
      {filteredReceipts.length > 0 && (
        <div className="p-4 bg-gray-50 border-t border-gray-200">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600">
              Showing {filteredReceipts.length} {filteredReceipts.length === 1 ? 'receipt' : 'receipts'}
            </span>
            <span className="font-semibold text-gray-900">
              Total: {formatCurrency(filteredReceipts.reduce((sum, r) => sum + r.amount, 0))}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
