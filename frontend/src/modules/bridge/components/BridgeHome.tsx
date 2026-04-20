'use client';

/**
 * Bridge module root — toggles between a list of saved hands (showing
 * all four bids per hand in a single view) and a form for entering a
 * new hand. Mirrors the view-state pattern used by MinigolfHome.
 */

import React, { useState } from 'react';
import { Plus, Loader2, AlertCircle } from 'lucide-react';
import { PageHeader } from '@/shared/components/PageHeader';
import { logger } from '@/core/utils/logger';
import { useHands } from '../hooks/useHands';
import { useCreateHand } from '../hooks/useCreateHand';
import { useDeleteHand } from '../hooks/useDeleteHand';
import { HandList } from './HandList';
import { HandForm } from './HandForm';
import type { HandFormData } from '../types';

type View = 'list' | 'new';

export function BridgeHome() {
  const [view, setView] = useState<View>('list');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data: hands, isLoading, isError, error } = useHands();
  const createHand = useCreateHand();
  const deleteHand = useDeleteHand();

  const handleSubmit = async (data: HandFormData) => {
    try {
      await createHand.mutateAsync(data);
      setView('list');
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
      {view === 'list' && (
        <>
          <PageHeader
            title="Bridge"
            subtitle="Record each hand's final bids by direction."
            actions={
              <button
                type="button"
                onClick={() => setView('new')}
                data-testid="new-hand-button"
                className="flex items-center gap-2 px-4 py-2 bg-accent-terracotta hover:bg-accent-terracotta-hover text-white rounded-lg font-medium font-body transition-colors shadow-sm"
              >
                <Plus className="w-5 h-5" />
                New Hand
              </button>
            }
          />

          <HandList
            hands={hands ?? []}
            onDelete={handleDelete}
            deletingId={deletingId}
          />
        </>
      )}

      {view === 'new' && (
        <HandForm
          onSubmit={handleSubmit}
          onCancel={() => setView('list')}
          isSubmitting={createHand.isPending}
        />
      )}
    </div>
  );
}
