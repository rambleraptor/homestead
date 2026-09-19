/**
 * Bridge app root — quick-entry form on top, saved hands as tables
 * below. The form resets itself after each hand is submitted, so the
 * parent only needs to handle persistence + errors.
 */

import { useMemo, useState } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import { PageHeader } from '@rambleraptor/homestead-core/shared/components/PageHeader';
import { useHands } from '../hooks/useHands';
import { useCreateHand } from '../hooks/useCreateHand';
import { useDeleteHand } from '../hooks/useDeleteHand';
import { HandList } from './HandList';
import { HandForm } from './HandForm';
import { BoardFilter } from './BoardFilter';
import { distinctBoards, handBoard, type BoardFilterValue } from '../utils';
import type { HandFormData } from '../types';

export function BridgeHome() {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // `undefined` means "no explicit pick yet" — fall back to the newest
  // hand's board. `null` is the legacy "no board" bucket.
  const [selectedBoard, setSelectedBoard] = useState<BoardFilterValue | undefined>(
    undefined,
  );

  const { data: hands, isLoading, isError, error } = useHands();
  const createHand = useCreateHand();
  const deleteHand = useDeleteHand();

  // Boards that actually have hands, and the one currently shown. Hands
  // arrive newest-first, so the newest hand's board is the default view.
  const boards = useMemo(() => distinctBoards(hands ?? []), [hands]);
  const activeBoard = useMemo<BoardFilterValue | undefined>(() => {
    if (boards.length === 0) return undefined;
    if (selectedBoard !== undefined && boards.includes(selectedBoard)) {
      return selectedBoard;
    }
    return hands && hands.length > 0 ? handBoard(hands[0]) : boards[0];
  }, [boards, selectedBoard, hands]);

  const visibleHands = useMemo(
    () => (hands ?? []).filter((hand) => handBoard(hand) === activeBoard),
    [hands, activeBoard],
  );

  const handleSubmit = async (data: HandFormData) => {
    try {
      await createHand.mutateAsync(data);
      // Jump the view to the board the new hand landed on so it's visible.
      setSelectedBoard(data.board);
    } catch (err) {
      // Error surfaced by the global mutation error toast (queryClient.ts).
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteHand.mutateAsync(id);
    } catch (err) {
      // Error surfaced by the global mutation error toast (queryClient.ts).
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

      <BoardFilter
        boards={boards}
        selected={activeBoard ?? null}
        onSelect={setSelectedBoard}
      />

      <HandList
        hands={visibleHands}
        onDelete={handleDelete}
        deletingId={deletingId}
      />
    </div>
  );
}
