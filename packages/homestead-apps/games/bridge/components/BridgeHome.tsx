/**
 * Bridge app root — quick-entry form on top, saved hands as tables
 * below. The form resets itself after each hand is submitted, so the
 * parent only needs to handle persistence + errors.
 */

import { useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { PageHeader } from '@rambleraptor/homestead-core/shared/components/PageHeader';
import { QueryError } from '@rambleraptor/homestead-core/shared/components/QueryError';
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

  const { data: hands, isLoading, isError, error, refetch } = useHands();
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
    } catch {
      // Error surfaced by the global mutation error toast (queryClient.ts).
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteHand.mutateAsync(id);
    } catch {
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
      <QueryError
        error={error}
        onRetry={() => void refetch()}
        title="Failed to load hands"
        data-testid="bridge-error"
      />
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
