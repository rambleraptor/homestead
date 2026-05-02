'use client';

/**
 * HSA Home Component
 *
 * Main interface for managing unreimbursed medical expenses
 */

import { useState } from 'react';
import { Loader2, AlertCircle, Receipt } from 'lucide-react';
import { useHSAStats } from '../hooks/useHSAStats';
import { useCreateHSAReceipt } from '../hooks/useCreateHSAReceipt';
import { useUpdateHSAReceipt } from '../hooks/useUpdateHSAReceipt';
import { useDeleteHSAReceipt } from '../hooks/useDeleteHSAReceipt';
import { HSAKPICard } from './HSAKPICard';
import { HSAQuickCaptureForm } from './HSAQuickCaptureForm';
import { HSAAuditVault } from './HSAAuditVault';
import { ConfirmDialog } from '@/shared/components/ConfirmDialog';
import { PageHeader } from '@/shared/components/PageHeader';
import { logger } from '@/core/utils/logger';
import type { HSAReceiptFormData, ReceiptStatus } from '../types';

export function HSAHome() {
  const [showForm, setShowForm] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [receiptToDelete, setReceiptToDelete] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<ReceiptStatus | 'All'>('All');

  const { stats, isLoading, isError, error } = useHSAStats();
  const createMutation = useCreateHSAReceipt();
  const updateMutation = useUpdateHSAReceipt();
  const deleteMutation = useDeleteHSAReceipt();

  const handleFormSubmit = async (data: HSAReceiptFormData) => {
    try {
      await createMutation.mutateAsync(data);
      setShowForm(false);
    } catch (err) {
      logger.error('Failed to create HSA receipt', err);
    }
  };

  const handleFormCancel = () => {
    setShowForm(false);
  };

  const handleMarkAsReimbursed = async (id: string) => {
    try {
      await updateMutation.mutateAsync({
        id,
        data: { status: 'Reimbursed' },
      });
    } catch (err) {
      logger.error('Failed to mark receipt as reimbursed', err);
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
              Failed to load HSA receipts
            </h3>
            <p className="text-sm text-red-700">
              {error instanceof Error ? error.message : 'An error occurred'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="HSA Receipts"
        subtitle="Track unreimbursed medical expenses"
        actions={<Receipt className="w-8 h-8 text-accent-terracotta" />}
      />

      {/* KPI Card - Liquidatable Tax-Free Cash */}
      {stats && (
        <HSAKPICard
          totalStored={stats.totalStored}
          storedReceipts={stats.storedReceipts}
        />
      )}

      {/* Quick Capture Form */}
      <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900">
            Quick Capture
          </h2>
          <button
            onClick={() => setShowForm(!showForm)}
            data-testid="add-hsa-receipt-button"
            className="text-sm font-medium text-accent-terracotta hover:text-accent-terracotta-hover transition-colors"
          >
            {showForm ? 'Hide Form' : 'Add Receipt'}
          </button>
        </div>
        {showForm && (
          <HSAQuickCaptureForm
            onSubmit={handleFormSubmit}
            onCancel={handleFormCancel}
            isSubmitting={createMutation.isPending}
          />
        )}
      </div>

      {/* Audit Vault */}
      {stats && (
        <HSAAuditVault
          stats={stats}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          onMarkAsReimbursed={handleMarkAsReimbursed}
          onDelete={handleDeleteReceipt}
          isUpdating={updateMutation.isPending}
        />
      )}

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
