'use client';

/**
 * Bridge module root — quick-entry form on top, saved hands as tables
 * below. The form resets itself after each hand is submitted, so the
 * parent only needs to handle persistence + errors.
 */

import React, { useState } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import { PageHeader } from '@rambleraptor/homestead-core/shared/components/PageHeader';
import { logger } from '@rambleraptor/homestead-core/utils/logger';
import { useHands } from '../hooks/useHands';
import { useCreateHand } from '../hooks/useCreateHand';
import { useDeleteHand } from '../hooks/useDeleteHand';
import { HandList } from './HandList';
import { HandForm } from './HandForm';
import type { HandFormData } from '../types';

export function BridgeHome() {
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data: hands, isLoading, isError, error } = useHands();
  const createHand = useCreateHand();
  const deleteHand = useDeleteHand();

  const handleSubmit = async (data: HandFormData) => {
    try {
      await createHand.mutateAsync(data);
    } catch (err) {
      logger.error('Failed to save bridge hand', err);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteHand.mutateAsync(id);
    } catch (err) {
      logger.error('Failed to delete bridge hand', err);
    } finally {
      setDeletingId(null);
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
            <h3 className="font-semibold text-red-900">Failed to load hands</h3>
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
        title="Bridge"
        subtitle="Tap level, suit, then each direction to log a hand."
      />

      <HandForm
        onSubmit={handleSubmit}
        isSubmitting={createHand.isPending}
      />

      <HandList
        hands={hands ?? []}
        onDelete={handleDelete}
        deletingId={deletingId}
      />
    </div>
  );
}
