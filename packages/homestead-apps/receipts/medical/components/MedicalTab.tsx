/**
 * The medical half of the Receipts page: out-of-pocket expenses held against a
 * future HSA withdrawal.
 *
 * The page shell (`ReceiptsHome`) owns the header, the tabs and the add
 * affordances; this owns everything below them, including its own edit and
 * delete flows and the form the shell's add button opens.
 */

import { useState } from 'react';
import { AlertCircle, PiggyBank, Sparkles } from 'lucide-react';
import { SkeletonPage } from '@rambleraptor/homestead-core/shared/components/Skeleton';
import { ConfirmDialog } from '@rambleraptor/homestead-core/shared/components/ConfirmDialog';
import { Modal } from '@rambleraptor/homestead-core/shared/components/Modal';
import { formatCurrency } from '@rambleraptor/homestead-core/shared/utils/currencyUtils';
import { ReceiptKPICard } from '../../shared/ReceiptKPICard';
import { useHSAStats } from '../hooks/useHSAStats';
import { useCreateHSAReceipt } from '../hooks/useCreateHSAReceipt';
import { useUpdateHSAReceipt } from '../hooks/useUpdateHSAReceipt';
import { useDeleteHSAReceipt } from '../hooks/useDeleteHSAReceipt';
import { HSAStatTiles } from './HSAStatTiles';
import { HSACategoryBreakdown } from './HSACategoryBreakdown';
import { HSAQuickCaptureForm } from './HSAQuickCaptureForm';
import { HSAReceiptEditForm } from './HSAReceiptEditForm';
import { HSAAuditVault } from './HSAAuditVault';
import { HSAEmptyState } from './HSAEmptyState';
import type { HSAReceipt, HSAReceiptFormData, ReceiptStatus } from '../types';

interface MedicalTabProps {
  /** The shell's add affordance was used. */
  addOpen: boolean;
  /** Opens the shell's add flow — for the empty state's own call to action. */
  onOpenAdd: () => void;
  onCloseAdd: () => void;
}

export function MedicalTab({ addOpen, onOpenAdd, onCloseAdd }: MedicalTabProps) {
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [receiptToDelete, setReceiptToDelete] = useState<string | null>(null);
  const [editingReceipt, setEditingReceipt] = useState<HSAReceipt | null>(null);
  const [statusFilter, setStatusFilter] = useState<ReceiptStatus | 'All'>('All');

  const { stats, isLoading, isError, error } = useHSAStats();
  const createMutation = useCreateHSAReceipt();
  const updateMutation = useUpdateHSAReceipt();
  const deleteMutation = useDeleteHSAReceipt();

  const handleFormSubmit = async (data: HSAReceiptFormData) => {
    try {
      await createMutation.mutateAsync(data);
      onCloseAdd();
    } catch (err) {
      // Error surfaced by the global mutation error toast (queryClient.ts).
    }
  };

  const handleEditSubmit = async (data: Partial<HSAReceipt>) => {
    if (!editingReceipt) return;
    await updateMutation.mutateAsync({ id: editingReceipt.id, data });
    setEditingReceipt(null);
  };

  const handleMarkAsReimbursed = async (id: string) => {
    try {
      await updateMutation.mutateAsync({ id, data: { status: 'Reimbursed' } });
    } catch (err) {
      // Error surfaced by the global mutation error toast (queryClient.ts).
    }
  };

  const handleDeleteReceipt = (id: string) => {
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
      <SkeletonPage body="cards" label="Loading HSA receipts" data-testid="hsa-loading" />
    );
  }

  if (isError) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50/40 p-6">
        <div className="flex items-center gap-3">
          <AlertCircle className="w-6 h-6 text-red-600" />
          <div>
            <h3 className="font-semibold text-red-900">Failed to load HSA receipts</h3>
            <p className="text-sm text-red-700">
              {error instanceof Error ? error.message : 'An error occurred'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const hasReceipts = !!stats && stats.totalReceipts > 0;

  return (
    <div className="space-y-6">
      {stats && (
        <ReceiptKPICard
          badge={{ icon: Sparkles, label: 'Tax-free' }}
          label="Liquidatable Cash"
          value={formatCurrency(stats.totalStored)}
          caption={`Available across ${stats.storedReceipts} stored ${
            stats.storedReceipts === 1 ? 'receipt' : 'receipts'
          }`}
          footnote="The total you can withdraw from your HSA tax-free, based on the unreimbursed medical expenses you’ve stored."
          icon={PiggyBank}
        />
      )}

      {stats && !hasReceipts && <HSAEmptyState onAdd={onOpenAdd} />}

      {stats && hasReceipts && (
        <>
          <HSAStatTiles stats={stats} />

          {stats.categoryBreakdown.length > 0 && (
            <HSACategoryBreakdown breakdown={stats.categoryBreakdown} />
          )}

          <HSAAuditVault
            stats={stats}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            onMarkAsReimbursed={handleMarkAsReimbursed}
            onEdit={setEditingReceipt}
            onDelete={handleDeleteReceipt}
            isUpdating={updateMutation.isPending}
          />
        </>
      )}

      {/* Quick capture (modal) */}
      <Modal isOpen={addOpen} onClose={onCloseAdd} title="Add Receipt">
        <HSAQuickCaptureForm
          onSubmit={handleFormSubmit}
          onCancel={onCloseAdd}
          isSubmitting={createMutation.isPending}
        />
      </Modal>

      <Modal
        isOpen={editingReceipt !== null}
        onClose={() => setEditingReceipt(null)}
        title="Edit Receipt"
      >
        {editingReceipt && (
          <HSAReceiptEditForm
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
        title="Delete Receipt"
        message="Are you sure you want to delete this receipt? This action cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}
