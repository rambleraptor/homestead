/**
 * The gift card form at its own address: `/gift-cards/new` adds a card and
 * `/gift-cards/cards/:id/edit` changes one. Saving a new card returns to the
 * list; saving an edit returns to the card's merchant, and so does Cancel.
 */

import { Link, useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowLeft } from 'lucide-react';
import type { AppRouteProps } from '@rambleraptor/homestead-core/apps/types';
import { SkeletonPage } from '@rambleraptor/homestead-core/shared/components/Skeleton';
import { useGiftCard } from '../hooks/useGiftCard';
import { useCreateGiftCard } from '../hooks/useCreateGiftCard';
import { useUpdateGiftCard } from '../hooks/useUpdateGiftCard';
import { GIFT_CARDS_HOME, merchantHref } from '../routes';
import { GiftCardForm } from './GiftCardForm';
import type { GiftCardFormData } from '../types';

export function GiftCardFormRoute({ params }: AppRouteProps) {
  const id = params?.id ?? null;
  const navigate = useNavigate();
  const { data: card, isLoading, isError, error } = useGiftCard(id);
  const createMutation = useCreateGiftCard();
  const updateMutation = useUpdateGiftCard();

  const backHref = card ? merchantHref(card.merchant) : GIFT_CARDS_HOME;

  if (id && isLoading) {
    return (
      <SkeletonPage
        body="list"
        bodyCount={4}
        label="Loading gift card"
        data-testid="gift-card-form-loading"
      />
    );
  }

  if (id && (isError || !card)) {
    return (
      <div className="space-y-4">
        <Link
          to={GIFT_CARDS_HOME}
          className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          <span className="font-medium">Back to Merchants</span>
        </Link>
        <div
          role="alert"
          className="bg-red-50/20 border border-red-200 rounded-lg p-6"
          data-testid="gift-card-form-error"
        >
          <div className="flex items-center gap-3">
            <AlertCircle className="w-6 h-6 text-red-600" />
            <div>
              <h3 className="font-semibold text-red-900">
                {isError ? 'Failed to load this gift card' : 'This gift card could not be found'}
              </h3>
              {isError && (
                <p className="text-sm text-red-700">
                  {error instanceof Error ? error.message : 'An error occurred'}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const handleSubmit = async (data: GiftCardFormData) => {
    try {
      if (id) {
        await updateMutation.mutateAsync({ id, data });
        navigate(merchantHref(data.merchant));
      } else {
        await createMutation.mutateAsync(data);
        navigate(GIFT_CARDS_HOME);
      }
    } catch {
      // Error surfaced by the global mutation error toast (queryClient.ts).
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Link
        to={backHref}
        className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
        data-testid="gift-card-form-back"
      >
        <ArrowLeft className="w-5 h-5" />
        <span className="font-medium">{card ? `Back to ${card.merchant}` : 'Back to Merchants'}</span>
      </Link>
      <h2 className="text-2xl font-bold text-gray-900">
        {id ? 'Edit Gift Card' : 'Add New Gift Card'}
      </h2>
      <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
        <GiftCardForm
          onSubmit={handleSubmit}
          onCancel={() => navigate(backHref)}
          initialData={card ?? undefined}
          isSubmitting={createMutation.isPending || updateMutation.isPending}
        />
      </div>
    </div>
  );
}
