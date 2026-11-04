/**
 * A merchant's gift cards at their own address:
 * `/gift-cards/merchants/:merchant`. The segment is the merchant's name,
 * percent-encoded (see `routes.ts`), so the page can be shared and reloaded.
 *
 * The cards come from the same summaries the list is built from. Deleting a
 * card asks first; when the merchant's last card goes — deleted here, or used
 * up by a Quick Transaction — the page returns to the list rather than
 * showing an empty merchant.
 */

import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import type { AppRouteProps } from '@rambleraptor/homestead-core/apps/types';
import { SkeletonPage } from '@rambleraptor/homestead-core/shared/components/Skeleton';
import { ConfirmDialog } from '@rambleraptor/homestead-core/shared/components/ConfirmDialog';
import { QueryError } from '@rambleraptor/homestead-core/shared/components/QueryError';
import { useMerchantSummaries } from '../hooks/useMerchantSummaries';
import { useDeleteGiftCard } from '../hooks/useDeleteGiftCard';
import { GIFT_CARDS_HOME, decodeMerchantParam, editCardHref } from '../routes';
import { MerchantDetail } from './MerchantDetail';

export function MerchantDetailRoute({ params }: AppRouteProps) {
  const merchant = decodeMerchantParam(params?.merchant ?? '');
  const navigate = useNavigate();
  const [cardToDelete, setCardToDelete] = useState<string | null>(null);

  const { stats, isLoading, isError, error, refetch } = useMerchantSummaries();
  const deleteMutation = useDeleteGiftCard();

  const summary = stats?.merchants.find((m) => m.merchant === merchant);

  // Once the merchant has been on screen, its disappearance means its last
  // card is gone: go back to the list instead of showing nothing.
  const seen = useRef(false);
  useEffect(() => {
    if (summary) {
      seen.current = true;
    } else if (seen.current && stats) {
      navigate(GIFT_CARDS_HOME, { replace: true });
    }
  }, [summary, stats, navigate]);

  if (isLoading) {
    return (
      <SkeletonPage
        body="list"
        bodyCount={3}
        label={`Loading ${merchant || 'merchant'} gift cards`}
        data-testid="merchant-detail-loading"
      />
    );
  }

  if (isError || !summary) {
    return (
      <div className="space-y-4">
        <Link
          to={GIFT_CARDS_HOME}
          className="inline-flex items-center gap-2 text-text-muted hover:text-text-main transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          <span className="font-medium">Back to Merchants</span>
        </Link>
        <QueryError
          error={isError ? error : `Nothing is filed under “${merchant}”. It may have been renamed or used up.`}
          onRetry={isError ? () => void refetch() : undefined}
          title={isError ? 'Failed to load gift cards' : 'No gift cards for this merchant'}
          data-testid="merchant-detail-error"
        />
      </div>
    );
  }

  const handleConfirmDelete = async () => {
    if (!cardToDelete) return;
    try {
      await deleteMutation.mutateAsync(cardToDelete);
    } catch {
      // Error surfaced by the global mutation error toast (queryClient.ts).
    } finally {
      setCardToDelete(null);
    }
  };

  return (
    <>
      <MerchantDetail
        merchant={summary.merchant}
        cards={summary.cards}
        totalAmount={summary.totalAmount}
        backHref={GIFT_CARDS_HOME}
        onEdit={(card) => navigate(editCardHref(card.id))}
        onDelete={setCardToDelete}
      />

      <ConfirmDialog
        isOpen={cardToDelete !== null}
        onClose={() => setCardToDelete(null)}
        onConfirm={handleConfirmDelete}
        title="Delete Gift Card"
        message="Are you sure you want to delete this gift card? This action cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        isLoading={deleteMutation.isPending}
      />
    </>
  );
}
