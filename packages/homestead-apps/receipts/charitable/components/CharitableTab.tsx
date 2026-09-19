/**
 * The charitable half of the Receipts page: what you gave, and what it's worth
 * on a return.
 *
 * Everything here is scoped to one year, because a donation belongs to exactly
 * one and the question is always "what did I give in <year>". The selected year
 * lives in the URL (`?tab=charitable&year=2025`) so the answer is linkable; with
 * no year named, the tab resolves one itself — this year when there's giving in
 * it, otherwise the most recent year that has any, so a tab opened in January
 * doesn't greet you with an empty page while last year's giving sits one click
 * away.
 */

import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertCircle, HandHeart, Landmark } from 'lucide-react';
import { SkeletonPage } from '@rambleraptor/homestead-core/shared/components/Skeleton';
import { ConfirmDialog } from '@rambleraptor/homestead-core/shared/components/ConfirmDialog';
import { Modal } from '@rambleraptor/homestead-core/shared/components/Modal';
import { formatCurrency } from '@rambleraptor/homestead-core/shared/utils/currencyUtils';
import { ReceiptKPICard } from '../../shared/ReceiptKPICard';
import { useCharitableReceipts } from '../hooks/useCharitableReceipts';
import { useCharitableStats } from '../hooks/useCharitableStats';
import { useCreateCharitableReceipt } from '../hooks/useCreateCharitableReceipt';
import { useUpdateCharitableReceipt } from '../hooks/useUpdateCharitableReceipt';
import { useDeleteCharitableReceipt } from '../hooks/useDeleteCharitableReceipt';
import { receiptsForYear } from '../stats';
import { CharitableStatTiles } from './CharitableStatTiles';
import { CharitableOrgBreakdown } from './CharitableOrgBreakdown';
import { CharitableYearTable } from './CharitableYearTable';
import { CharitableVault } from './CharitableVault';
import { CharitableCaptureForm } from './CharitableCaptureForm';
import { CharitableEditForm } from './CharitableEditForm';
import { CharitableEmptyState } from './CharitableEmptyState';
import type {
  CharitableReceipt,
  CharitableReceiptFormData,
  CharitableStatus,
} from '../types';

const YEAR_PARAM = 'year';

/** A four-digit year from the URL, or undefined for anything else. */
function parseYear(raw: string | null): number | undefined {
  if (!raw) return undefined;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 1900 && value <= 2999 ? value : undefined;
}

interface CharitableTabProps {
  /** The shell's add affordance was used. */
  addOpen: boolean;
  /** Opens the shell's add flow — for the empty state's own call to action. */
  onOpenAdd: () => void;
  onCloseAdd: () => void;
}

export function CharitableTab({ addOpen, onOpenAdd, onCloseAdd }: CharitableTabProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [receiptToDelete, setReceiptToDelete] = useState<string | null>(null);
  const [editingReceipt, setEditingReceipt] = useState<CharitableReceipt | null>(null);
  const [statusFilter, setStatusFilter] = useState<CharitableStatus | 'All'>('All');

  const selectedYear = parseYear(searchParams.get(YEAR_PARAM));
  const { data: receipts, isLoading, isError, error } = useCharitableReceipts();
  // Undefined means "you pick" — the hook reports what it landed on as stats.year.
  const { stats } = useCharitableStats(selectedYear);

  const createMutation = useCreateCharitableReceipt();
  const updateMutation = useUpdateCharitableReceipt();
  const deleteMutation = useDeleteCharitableReceipt();

  const year = stats?.year ?? selectedYear ?? new Date().getFullYear();

  const yearReceipts = useMemo(
    () => receiptsForYear(receipts ?? [], year),
    [receipts, year],
  );

  const selectYear = (next: number) => {
    const params = new URLSearchParams(searchParams);
    params.set(YEAR_PARAM, String(next));
    setSearchParams(params, { replace: true });
  };

  const handleFormSubmit = async (data: CharitableReceiptFormData) => {
    try {
      await createMutation.mutateAsync(data);
      onCloseAdd();
    } catch (err) {
      // Error surfaced by the global mutation error toast (queryClient.ts).
    }
  };

  const handleEditSubmit = async (data: Partial<CharitableReceipt>) => {
    if (!editingReceipt) return;
    await updateMutation.mutateAsync({ id: editingReceipt.id, data });
    setEditingReceipt(null);
  };

  const handleMarkClaimed = async (id: string) => {
    try {
      await updateMutation.mutateAsync({ id, data: { status: 'Claimed' } });
    } catch (err) {
      // Error surfaced by the global mutation error toast (queryClient.ts).
    }
  };

  const handleDelete = (id: string) => {
    setReceiptToDelete(id);
    setDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (receiptToDelete) {
      await deleteMutation.mutateAsync(receiptToDelete);
      setDeleteConfirmOpen(false);
      setReceiptToDelete(null);
    }
  };

  if (isLoading) {
    return (
      <SkeletonPage
        body="cards"
        label="Loading charitable receipts"
        data-testid="charitable-loading"
      />
    );
  }

  if (isError) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50/40 p-6">
        <div className="flex items-center gap-3">
          <AlertCircle className="w-6 h-6 text-red-600" />
          <div>
            <h3 className="font-semibold text-red-900">
              Failed to load charitable receipts
            </h3>
            <p className="text-sm text-red-700">
              {error instanceof Error ? error.message : 'An error occurred'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const hasAnyReceipts = (receipts?.length ?? 0) > 0;

  return (
    <div className="space-y-6">
      {stats && (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-text-muted">
              Showing the {year} tax year
            </p>
            {stats.years.length > 0 && (
              <div className="flex items-center gap-2">
                <label htmlFor="charitable-year" className="text-sm text-text-muted">
                  Tax year
                </label>
                <select
                  id="charitable-year"
                  data-testid="charitable-year-select"
                  value={year}
                  onChange={(e) => selectYear(Number(e.target.value))}
                  className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-brand-navy focus:ring-2 focus:ring-accent-terracotta focus:border-accent-terracotta"
                >
                  {/* The resolved year always appears, even with nothing in it —
                      otherwise the control would show a year it isn't on. */}
                  {(stats.years.some((y) => y.year === year)
                    ? stats.years.map((y) => y.year)
                    : [year, ...stats.years.map((y) => y.year)]
                  ).map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <ReceiptKPICard
            data-testid="charitable-kpi"
            badge={{ icon: Landmark, label: 'Deductible' }}
            label={`Charitable contributions · ${year}`}
            value={formatCurrency(stats.total)}
            caption={`Across ${stats.count} ${
              stats.count === 1 ? 'receipt' : 'receipts'
            } in ${year}`}
            footnote="What you gave, less anything you received in return. A gift of $250 or more needs a written acknowledgment from the charity to be deductible at all."
            icon={HandHeart}
          />
        </>
      )}

      {!hasAnyReceipts && <CharitableEmptyState onAdd={onOpenAdd} />}

      {hasAnyReceipts && stats && (
        <>
          <CharitableStatTiles stats={stats} />

          <div className="grid gap-6 lg:grid-cols-2">
            <CharitableOrgBreakdown breakdown={stats.organizationBreakdown} />
            <CharitableYearTable
              years={stats.years}
              selectedYear={year}
              onSelectYear={selectYear}
            />
          </div>

          <CharitableVault
            receipts={yearReceipts}
            year={year}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            onMarkClaimed={handleMarkClaimed}
            onEdit={setEditingReceipt}
            onDelete={handleDelete}
            isUpdating={updateMutation.isPending}
          />
        </>
      )}

      <Modal isOpen={addOpen} onClose={onCloseAdd} title="Add Donation">
        <CharitableCaptureForm
          onSubmit={handleFormSubmit}
          onCancel={onCloseAdd}
          isSubmitting={createMutation.isPending}
        />
      </Modal>

      <Modal
        isOpen={editingReceipt !== null}
        onClose={() => setEditingReceipt(null)}
        title="Edit Donation"
      >
        {editingReceipt && (
          <CharitableEditForm
            receipt={editingReceipt}
            onSubmit={handleEditSubmit}
            onCancel={() => setEditingReceipt(null)}
            isSubmitting={updateMutation.isPending}
          />
        )}
      </Modal>

      <ConfirmDialog
        isOpen={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={handleConfirmDelete}
        title="Delete Donation"
        message="Are you sure you want to delete this donation? This action cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}
