/**
 * HSA Audit Vault
 *
 * The medical receipt list: status and person filters over the shared vault
 * shell. The desktop table and the phone cards deliberately give their action
 * buttons different accessible names, so an e2e control matches exactly one
 * viewport.
 */

import { useMemo, useState } from 'react';
import { Archive, CheckCircle, Pencil, Trash2 } from 'lucide-react';
import { formatCurrency } from '@rambleraptor/homestead-core/shared/utils/currencyUtils';
import { formatDate } from '@rambleraptor/homestead-core/shared/utils/dateUtils';
import { usePeople } from '../../../people/hooks/usePeople';
import { ReceiptVault, type VaultColumn } from '../../shared/ReceiptVault';
import { categoryStyle } from '../categoryConfig';
import type { HSAStats, HSAReceipt, ReceiptStatus } from '../types';
import { useHSAReceipts } from '../hooks/useHSAReceipts';
import { HSAReceiptThumb } from './HSAReceiptThumb';

const SHORT_DATE: Intl.DateTimeFormatOptions = {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
};

/** Resolve a `people/{id}` reference path to a person's display name. */
function personNameFor(
  path: string | undefined,
  namesById: Map<string, string>,
): string | undefined {
  if (!path) return undefined;
  return namesById.get(path.replace(/^people\//, ''));
}

function CategoryBadge({ receipt }: { receipt: HSAReceipt }) {
  const style = categoryStyle(receipt.category);
  const Icon = style.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${style.badge}`}
    >
      <Icon className="w-3 h-3" aria-hidden="true" />
      {receipt.category}
    </span>
  );
}

function StatusBadge({ status }: { status: ReceiptStatus }) {
  return status === 'Stored' ? (
    <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
      Stored
    </span>
  ) : (
    <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-text-muted">
      Reimbursed
    </span>
  );
}

interface HSAAuditVaultProps {
  stats: HSAStats;
  statusFilter: ReceiptStatus | 'All';
  onStatusFilterChange: (status: ReceiptStatus | 'All') => void;
  onMarkAsReimbursed: (id: string) => void;
  onEdit: (receipt: HSAReceipt) => void;
  onDelete: (id: string) => void;
  isUpdating: boolean;
}

export function HSAAuditVault({
  stats,
  statusFilter,
  onStatusFilterChange,
  onMarkAsReimbursed,
  onEdit,
  onDelete,
  isUpdating,
}: HSAAuditVaultProps) {
  const { data: receipts } = useHSAReceipts();
  const { data: people } = usePeople();

  // 'All', 'Unlinked' (no person set), or a `people/{id}` path.
  const [personFilter, setPersonFilter] = useState<string>('All');

  const namesById = useMemo(
    () => new Map((people ?? []).map((p) => [p.id, p.name])),
    [people],
  );

  // Only the people actually referenced by receipts are worth offering as
  // filter options, so the dropdown doesn't list the whole address book.
  const personOptions = useMemo(() => {
    const paths = new Set<string>();
    for (const r of receipts ?? []) {
      if (r.person) paths.add(r.person);
    }
    return Array.from(paths)
      .map((path) => ({
        path,
        name: personNameFor(path, namesById) ?? 'Unknown',
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [receipts, namesById]);

  const filteredReceipts = useMemo(() => {
    if (!receipts) return [];
    return receipts.filter((r) => {
      if (statusFilter !== 'All' && r.status !== statusFilter) return false;
      if (personFilter === 'All') return true;
      if (personFilter === 'Unlinked') return !r.person;
      return r.person === personFilter;
    });
  }, [receipts, statusFilter, personFilter]);

  const selectClass =
    'flex-1 sm:flex-none px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-brand-navy focus:ring-2 focus:ring-accent-terracotta focus:border-accent-terracotta';

  const filtersActive = statusFilter !== 'All' || personFilter !== 'All';

  const columns: VaultColumn<HSAReceipt>[] = [
    {
      key: 'thumb',
      header: '',
      headerClassName: 'w-14',
      cell: (receipt) => <HSAReceiptThumb receipt={receipt} size="sm" />,
    },
    {
      key: 'merchant',
      header: 'Merchant',
      cell: (receipt) => (
        <>
          <div className="text-sm font-medium text-brand-navy">{receipt.merchant}</div>
          <div className="text-xs text-text-muted">
            {formatDate(receipt.service_date, SHORT_DATE)}
          </div>
        </>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      cellClassName: 'whitespace-nowrap',
      cell: (receipt) => <CategoryBadge receipt={receipt} />,
    },
    {
      key: 'patient',
      header: 'Patient',
      cellClassName: 'whitespace-nowrap text-sm text-brand-slate',
      cell: (receipt) =>
        personNameFor(receipt.person, namesById) || receipt.patient || '—',
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      cellClassName:
        'whitespace-nowrap text-sm font-semibold text-brand-navy tabular-nums',
      cell: (receipt) => formatCurrency(receipt.amount),
    },
    {
      key: 'status',
      header: 'Status',
      cellClassName: 'whitespace-nowrap',
      cell: (receipt) => <StatusBadge status={receipt.status} />,
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      cellClassName: 'whitespace-nowrap',
      cell: (receipt) => (
        <div className="flex items-center justify-end gap-1">
          {receipt.status === 'Stored' && (
            <button
              onClick={() => onMarkAsReimbursed(receipt.id)}
              disabled={isUpdating}
              aria-label={`Mark ${receipt.merchant} receipt as reimbursed`}
              className="inline-flex items-center gap-1 rounded-lg bg-emerald-500 px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
              title="Mark as reimbursed"
            >
              <CheckCircle className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">Reimbursed</span>
            </button>
          )}
          <button
            onClick={() => onEdit(receipt)}
            aria-label={`Edit ${receipt.merchant} receipt`}
            data-testid={`hsa-receipt-edit-${receipt.id}`}
            className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-gray-100 hover:text-brand-navy"
            title="Edit receipt"
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button
            onClick={() => onDelete(receipt.id)}
            aria-label={`Delete ${receipt.merchant} receipt`}
            className="rounded-lg p-1.5 text-red-500 transition-colors hover:bg-red-50 hover:text-red-700"
            title="Delete receipt"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <ReceiptVault<HSAReceipt>
      title="Audit Vault"
      icon={Archive}
      rows={filteredReceipts}
      rowKey={(receipt) => receipt.id}
      columns={columns}
      amountOf={(receipt) => receipt.amount}
      emptyMessage="No receipts found"
      filtersActive={filtersActive}
      onClearFilters={() => {
        onStatusFilterChange('All');
        setPersonFilter('All');
      }}
      filters={
        <>
          <label htmlFor="status-filter" className="sr-only">
            Filter by status
          </label>
          <select
            id="status-filter"
            value={statusFilter}
            onChange={(e) =>
              onStatusFilterChange(e.target.value as ReceiptStatus | 'All')
            }
            className={selectClass}
          >
            <option value="All">All ({stats.totalReceipts})</option>
            <option value="Stored">Stored ({stats.storedReceipts})</option>
            <option value="Reimbursed">Reimbursed ({stats.reimbursedReceipts})</option>
          </select>
          <label htmlFor="person-filter" className="sr-only">
            Filter by person
          </label>
          <select
            id="person-filter"
            data-testid="hsa-person-filter"
            value={personFilter}
            onChange={(e) => setPersonFilter(e.target.value)}
            className={selectClass}
          >
            <option value="All">Everyone</option>
            {personOptions.map((opt) => (
              <option key={opt.path} value={opt.path}>
                {opt.name}
              </option>
            ))}
            <option value="Unlinked">Unlinked</option>
          </select>
        </>
      }
      mobileCard={(receipt) => (
        <>
          <div className="flex items-start gap-3">
            <HSAReceiptThumb receipt={receipt} />
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-brand-navy">
                    {receipt.merchant}
                  </p>
                  <p className="text-xs text-text-muted">
                    {formatDate(receipt.service_date, SHORT_DATE)}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-semibold text-brand-navy tabular-nums">
                  {formatCurrency(receipt.amount)}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <CategoryBadge receipt={receipt} />
                <StatusBadge status={receipt.status} />
                {(personNameFor(receipt.person, namesById) || receipt.patient) && (
                  <span className="text-xs text-text-muted">
                    {personNameFor(receipt.person, namesById) || receipt.patient}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-end gap-2">
            {receipt.status === 'Stored' && (
              <button
                onClick={() => onMarkAsReimbursed(receipt.id)}
                disabled={isUpdating}
                aria-label="Mark as reimbursed"
                className="inline-flex items-center gap-1 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <CheckCircle className="w-3.5 h-3.5" />
                Reimbursed
              </button>
            )}
            <button
              onClick={() => onEdit(receipt)}
              aria-label="Edit receipt"
              className="rounded-lg p-2 text-text-muted transition-colors hover:bg-gray-100 hover:text-brand-navy"
            >
              <Pencil className="w-4 h-4" />
            </button>
            <button
              onClick={() => onDelete(receipt.id)}
              aria-label="Delete receipt"
              className="rounded-lg p-2 text-red-500 transition-colors hover:bg-red-50 hover:text-red-700"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </>
      )}
    />
  );
}
