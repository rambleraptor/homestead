/**
 * The charitable receipt list for one year.
 *
 * Same shell as the medical vault, with the columns a donation actually has:
 * the organization instead of a merchant, what kind of gift it was, and what
 * it's worth as a deduction — which is not always what was given, since
 * anything received in return comes off it.
 *
 * As on the medical side, the desktop table and the phone cards give their
 * action buttons different accessible names so an e2e control matches exactly
 * one viewport.
 */

import { useMemo, useState } from 'react';
import { Archive, CheckCircle, Pencil, TriangleAlert, Trash2 } from 'lucide-react';
import { formatCurrency } from '@rambleraptor/homestead-core/shared/utils/currencyUtils';
import { formatDate } from '@rambleraptor/homestead-core/shared/utils/dateUtils';
import { usePeople } from '../../../people/hooks/usePeople';
import { ReceiptVault, type VaultColumn } from '../../shared/ReceiptVault';
import { deductibleAmount, isDafGrant, isUnvalued, needsAcknowledgment } from '../stats';
import { CharitableReceiptThumb } from './CharitableReceiptThumb';
import type { CharitableReceipt, CharitableStatus, DonationSource, GiftType } from '../types';

const SHORT_DATE: Intl.DateTimeFormatOptions = {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
};

const GIFT_TYPE_BADGE: Record<GiftType, string> = {
  Cash: 'bg-emerald-50 text-emerald-700',
  Goods: 'bg-blue-50 text-blue-700',
  Other: 'bg-violet-50 text-violet-700',
};

/** Resolve a `people/{id}` reference path to a person's display name. */
function personNameFor(
  path: string | undefined,
  namesById: Map<string, string>,
): string | undefined {
  if (!path) return undefined;
  return namesById.get(path.replace(/^people\//, ''));
}

function GiftTypeBadge({ giftType }: { giftType: GiftType }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${GIFT_TYPE_BADGE[giftType]}`}
    >
      {giftType}
    </span>
  );
}

function StatusBadge({ status }: { status: CharitableStatus }) {
  return status === 'Unclaimed' ? (
    <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
      Unclaimed
    </span>
  ) : (
    <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
      Claimed
    </span>
  );
}

/** Marks a gift granted from a donor-advised fund. */
function DafBadge() {
  return (
    <span
      className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700"
      title="Granted from a donor-advised fund"
    >
      DAF
    </span>
  );
}

/** The deduction, or the reason there isn't one. */
function Amount({ receipt }: { receipt: CharitableReceipt }) {
  if (isDafGrant(receipt)) {
    return (
      <span
        className="font-normal text-text-muted"
        title="Granted from a donor-advised fund — deducted when the fund was contributed to, not now"
      >
        {formatCurrency(receipt.amount ?? 0)} via DAF
      </span>
    );
  }
  if (isUnvalued(receipt)) {
    return (
      <span className="text-xs font-medium text-amber-600" title="Enter a value to claim this gift">
        Needs a value
      </span>
    );
  }
  const deductible = deductibleAmount(receipt);
  const reduced = deductible !== receipt.amount;
  return (
    <span title={reduced ? `${formatCurrency(receipt.amount ?? 0)} given, less what was received` : undefined}>
      {formatCurrency(deductible)}
    </span>
  );
}

interface CharitableVaultProps {
  receipts: CharitableReceipt[];
  year: number;
  statusFilter: CharitableStatus | 'All';
  onStatusFilterChange: (status: CharitableStatus | 'All') => void;
  onMarkClaimed: (id: string) => void;
  onEdit: (receipt: CharitableReceipt) => void;
  onDelete: (id: string) => void;
  isUpdating: boolean;
}

export function CharitableVault({
  receipts,
  year,
  statusFilter,
  onStatusFilterChange,
  onMarkClaimed,
  onEdit,
  onDelete,
  isUpdating,
}: CharitableVaultProps) {
  const { data: people } = usePeople();

  // 'All', 'Unlinked' (no person set), or a `people/{id}` path.
  const [personFilter, setPersonFilter] = useState<string>('All');
  const [sourceFilter, setSourceFilter] = useState<DonationSource | 'All'>('All');

  const namesById = useMemo(
    () => new Map((people ?? []).map((p) => [p.id, p.name])),
    [people],
  );

  // Only the people actually referenced by these receipts are worth offering,
  // so the dropdown doesn't list the whole address book.
  const personOptions = useMemo(() => {
    const paths = new Set<string>();
    for (const r of receipts) {
      if (r.person) paths.add(r.person);
    }
    return Array.from(paths)
      .map((path) => ({ path, name: personNameFor(path, namesById) ?? 'Unknown' }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [receipts, namesById]);

  const counts = useMemo(
    () => ({
      all: receipts.length,
      unclaimed: receipts.filter((r) => r.status === 'Unclaimed').length,
      claimed: receipts.filter((r) => r.status === 'Claimed').length,
      daf: receipts.filter(isDafGrant).length,
    }),
    [receipts],
  );

  const filtered = useMemo(
    () =>
      receipts.filter((r) => {
        if (statusFilter !== 'All' && r.status !== statusFilter) return false;
        if (sourceFilter !== 'All' && isDafGrant(r) !== (sourceFilter === 'DAF')) {
          return false;
        }
        if (personFilter === 'All') return true;
        if (personFilter === 'Unlinked') return !r.person;
        return r.person === personFilter;
      }),
    [receipts, statusFilter, sourceFilter, personFilter],
  );

  const selectClass =
    'flex-1 sm:flex-none px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-brand-navy focus:ring-2 focus:ring-accent-terracotta focus:border-accent-terracotta';

  const filtersActive =
    statusFilter !== 'All' || sourceFilter !== 'All' || personFilter !== 'All';

  const columns: VaultColumn<CharitableReceipt>[] = [
    {
      key: 'thumb',
      header: '',
      headerClassName: 'w-14',
      cell: (receipt) => <CharitableReceiptThumb receipt={receipt} size="sm" />,
    },
    {
      key: 'organization',
      header: 'Organization',
      cell: (receipt) => (
        <>
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-medium text-brand-navy">
              {receipt.organization}
            </span>
            {needsAcknowledgment(receipt) && (
              <TriangleAlert
                className="h-3.5 w-3.5 shrink-0 text-amber-500"
                aria-label="No acknowledgment on file for a gift of $250 or more"
              />
            )}
          </div>
          <div className="text-xs text-text-muted">
            {formatDate(receipt.donation_date, SHORT_DATE)}
          </div>
        </>
      ),
    },
    {
      key: 'gift_type',
      header: 'Type',
      cellClassName: 'whitespace-nowrap',
      cell: (receipt) => (
        <div className="flex items-center gap-1.5">
          <GiftTypeBadge giftType={receipt.gift_type} />
          {isDafGrant(receipt) && <DafBadge />}
        </div>
      ),
    },
    {
      key: 'donor',
      header: 'Donor',
      cellClassName: 'whitespace-nowrap text-sm text-brand-slate',
      cell: (receipt) =>
        personNameFor(receipt.person, namesById) || receipt.donor || '—',
    },
    {
      key: 'amount',
      header: 'Deductible',
      align: 'right',
      cellClassName:
        'whitespace-nowrap text-sm font-semibold text-brand-navy tabular-nums',
      cell: (receipt) => <Amount receipt={receipt} />,
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
          {receipt.status === 'Unclaimed' && (
            <button
              onClick={() => onMarkClaimed(receipt.id)}
              disabled={isUpdating}
              aria-label={`Mark ${receipt.organization} donation as claimed`}
              className="inline-flex items-center gap-1 rounded-lg bg-emerald-500 px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
              title="Mark as claimed"
            >
              <CheckCircle className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">Claimed</span>
            </button>
          )}
          <button
            onClick={() => onEdit(receipt)}
            aria-label={`Edit ${receipt.organization} donation`}
            data-testid={`charitable-receipt-edit-${receipt.id}`}
            className="rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-brand-navy"
            title="Edit donation"
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button
            onClick={() => onDelete(receipt.id)}
            aria-label={`Delete ${receipt.organization} donation`}
            className="rounded-lg p-1.5 text-red-500 transition-colors hover:bg-red-50 hover:text-red-700"
            title="Delete donation"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <ReceiptVault<CharitableReceipt>
      testId="charitable-vault"
      title={`Donations in ${year}`}
      icon={Archive}
      rows={filtered}
      rowKey={(receipt) => receipt.id}
      columns={columns}
      amountOf={deductibleAmount}
      emptyMessage="No donations found"
      filtersActive={filtersActive}
      onClearFilters={() => {
        onStatusFilterChange('All');
        setSourceFilter('All');
        setPersonFilter('All');
      }}
      filters={
        <>
          <label htmlFor="charitable-status-filter" className="sr-only">
            Filter by status
          </label>
          <select
            id="charitable-status-filter"
            data-testid="charitable-status-filter"
            value={statusFilter}
            onChange={(e) =>
              onStatusFilterChange(e.target.value as CharitableStatus | 'All')
            }
            className={selectClass}
          >
            <option value="All">All ({counts.all})</option>
            <option value="Unclaimed">Unclaimed ({counts.unclaimed})</option>
            <option value="Claimed">Claimed ({counts.claimed})</option>
          </select>
          <label htmlFor="charitable-source-filter" className="sr-only">
            Filter by source
          </label>
          <select
            id="charitable-source-filter"
            data-testid="charitable-source-filter"
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value as DonationSource | 'All')}
            className={selectClass}
          >
            <option value="All">Any source</option>
            <option value="Self">Self ({counts.all - counts.daf})</option>
            <option value="DAF">DAF ({counts.daf})</option>
          </select>
          <label htmlFor="charitable-person-filter" className="sr-only">
            Filter by donor
          </label>
          <select
            id="charitable-person-filter"
            data-testid="charitable-person-filter"
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
            <CharitableReceiptThumb receipt={receipt} />
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-brand-navy">
                    {receipt.organization}
                  </p>
                  <p className="text-xs text-text-muted">
                    {formatDate(receipt.donation_date, SHORT_DATE)}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-semibold text-brand-navy tabular-nums">
                  <Amount receipt={receipt} />
                </span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <GiftTypeBadge giftType={receipt.gift_type} />
                {isDafGrant(receipt) && <DafBadge />}
                <StatusBadge status={receipt.status} />
                {(personNameFor(receipt.person, namesById) || receipt.donor) && (
                  <span className="text-xs text-text-muted">
                    {personNameFor(receipt.person, namesById) || receipt.donor}
                  </span>
                )}
                {needsAcknowledgment(receipt) && (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600">
                    <TriangleAlert className="h-3 w-3" aria-hidden="true" />
                    No acknowledgment
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-end gap-2">
            {receipt.status === 'Unclaimed' && (
              <button
                onClick={() => onMarkClaimed(receipt.id)}
                disabled={isUpdating}
                aria-label="Mark as claimed"
                className="inline-flex items-center gap-1 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <CheckCircle className="w-3.5 h-3.5" />
                Claimed
              </button>
            )}
            <button
              onClick={() => onEdit(receipt)}
              aria-label="Edit donation"
              className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-brand-navy"
            >
              <Pencil className="w-4 h-4" />
            </button>
            <button
              onClick={() => onDelete(receipt.id)}
              aria-label="Delete donation"
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
